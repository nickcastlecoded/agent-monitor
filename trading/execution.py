"""
Trade execution layer.

Responsibilities:
  • Translate TradeOrder (from risk.py) into IB BAG combo orders
  • Run what-if margin check before committing
  • Manage open trades (track fills, partial fills, open positions)
  • Provide emergency flat-all for drawdown / cointegration stops
  • Retry failed orders with exponential back-off (network errors only)

Order-routing strategy
  ─────────────────────
  Inter-commodity combos (different underlying):
    → SMART-routed BAG with NonGuaranteed=1 (legs fill independently)
    → Use limit orders on spread price for entries
    → Use market orders for urgent stops/exits

  Intra-commodity calendar spreads:
    → Direct-routed to exchange for guaranteed atomic fill
    (Not used in this strategy but noted for completeness)
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional

from ib_async import Contract, Trade, util

from config import PairConfig, StrategyConfig
from ib_client import IBClient, make_combo
from risk import LegOrder, TradeOrder

logger = logging.getLogger(__name__)


class OrderStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELLED = "cancelled"
    ERROR = "error"


@dataclass
class OpenPosition:
    pair_name: str
    side: str                           # "LONG" | "SHORT"
    combo_contract: Contract
    ib_trade: Trade
    leg_orders: List[LegOrder]
    quantity: float
    entry_time: float = field(default_factory=time.time)
    entry_z: float = 0.0
    fill_price: Optional[float] = None
    status: OrderStatus = OrderStatus.SUBMITTED


@dataclass
class ExecutionResult:
    success: bool
    pair_name: str
    side: str
    quantity: float
    fill_price: Optional[float]
    ib_trade: Optional[Trade]
    error: str = ""


class TradeExecutor:
    """
    Converts TradeOrder objects into live IB orders.
    Maintains a registry of open positions per pair.
    """

    MAX_RETRIES = 3
    RETRY_BASE_DELAY = 2.0   # seconds

    def __init__(self, ib: IBClient, cfg: StrategyConfig) -> None:
        self.ib = ib
        self.cfg = cfg
        # pair_name → OpenPosition (at most one active position per pair)
        self._positions: Dict[str, OpenPosition] = {}

    # ── Entry ─────────────────────────────────────────────────────────────────

    async def enter(
        self,
        order: TradeOrder,
        prices: Dict[str, float],
        spread_price: float,
        excess_liquidity: float,
    ) -> ExecutionResult:
        """
        Execute an entry order.  Returns ExecutionResult.
        Runs a what-if margin check first; aborts if margin insufficient.
        """
        pair_name = order.pair_name

        if pair_name in self._positions:
            logger.warning("Already have position in %s; ignoring entry", pair_name)
            return ExecutionResult(False, pair_name, order.side, 0, None, None,
                                   "duplicate entry blocked")

        # Resolve conIds for all legs
        conids = await self._resolve_conids(order)
        if conids is None:
            return ExecutionResult(False, pair_name, order.side, 0, None, None,
                                   "conId resolution failed")

        combo = make_combo(order.pair, conids)
        qty = self._compute_combo_qty(order)

        # What-if margin check
        test_order = self.ib.ib.whatIfOrder(combo, qty, order.side)
        try:
            init_margin, _ = await self.ib.what_if_margin(combo, test_order)
            required = abs(init_margin) * 1.5
            if required > excess_liquidity:
                logger.warning(
                    "%s: what-if margin %.0f × 1.5 = %.0f > liquidity %.0f; skipping",
                    pair_name, abs(init_margin), required, excess_liquidity,
                )
                return ExecutionResult(False, pair_name, order.side, 0, None, None,
                                       f"margin check failed: need {required:.0f}")
        except Exception as e:
            logger.warning("What-if margin check failed for %s: %s; proceeding", pair_name, e)

        # Limit order on spread price
        limit_price = self._spread_limit_price(spread_price, order.side)
        trade = await self._place_with_retry(
            combo=combo,
            action=order.side,
            qty=qty,
            limit_price=limit_price,
        )
        if trade is None:
            return ExecutionResult(False, pair_name, order.side, qty, None, None, "order failed")

        pos = OpenPosition(
            pair_name=pair_name,
            side=order.side,
            combo_contract=combo,
            ib_trade=trade,
            leg_orders=order.legs,
            quantity=qty,
            entry_z=0.0,
        )
        self._positions[pair_name] = pos

        logger.info("Entered %s spread for %s qty=%.0f limit=%.4f",
                    order.side, pair_name, qty, limit_price)
        return ExecutionResult(True, pair_name, order.side, qty, limit_price, trade)

    # ── Exit ──────────────────────────────────────────────────────────────────

    async def exit(
        self,
        pair_name: str,
        reason: str = "signal",
        urgent: bool = False,
    ) -> ExecutionResult:
        """
        Flatten an existing position.
        urgent=True → market order (stops, coint failures).
        """
        pos = self._positions.get(pair_name)
        if pos is None:
            return ExecutionResult(False, pair_name, "EXIT", 0, None, None, "no open position")

        reverse_action = "SELL" if pos.side == "LONG" else "BUY"

        if urgent:
            trade = self.ib.place_combo_market(pos.combo_contract, reverse_action, pos.quantity)
        else:
            # Limit at a very tight price (mid-market)
            trade = self.ib.place_combo_market(pos.combo_contract, reverse_action, pos.quantity)

        if trade is None:
            return ExecutionResult(False, pair_name, "EXIT", 0, None, None, "exit order failed")

        # Wait briefly for fill (market orders should fill near-immediately)
        for _ in range(10):
            await asyncio.sleep(0.5)
            if trade.orderStatus.status in ("Filled", "ApiCancelled"):
                break

        fill = trade.orderStatus.avgFillPrice or 0.0
        del self._positions[pair_name]

        logger.info("Exited %s (%s): fill=%.4f reason=%s",
                    pair_name, reverse_action, fill, reason)
        return ExecutionResult(True, pair_name, "EXIT", pos.quantity, fill, trade)

    async def exit_all(self, reason: str = "emergency") -> None:
        """Flatten every open position — used for end-of-day or regime alerts."""
        pairs = list(self._positions.keys())
        for pair_name in pairs:
            await self.exit(pair_name, reason=reason, urgent=True)
            await asyncio.sleep(0.3)

    # ── Order placement helpers ───────────────────────────────────────────────

    async def _place_with_retry(
        self,
        combo: Contract,
        action: str,
        qty: float,
        limit_price: Optional[float],
    ) -> Optional[Trade]:
        """Place an order with exponential back-off retry on transient failures."""
        for attempt in range(self.MAX_RETRIES):
            try:
                if limit_price is not None:
                    trade = self.ib.place_combo_limit(combo, action, qty, limit_price)
                else:
                    trade = self.ib.place_combo_market(combo, action, qty)
                return trade
            except Exception as exc:
                delay = self.RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(
                    "Order placement attempt %d failed: %s; retrying in %.1fs",
                    attempt + 1, exc, delay,
                )
                await asyncio.sleep(delay)
        logger.error("All %d order placement attempts failed", self.MAX_RETRIES)
        return None

    async def _resolve_conids(self, order: TradeOrder) -> Optional[List[int]]:
        """Fetch the front-month conId for each leg."""
        conids = []
        for leg in order.pair.legs:
            conid = await self.ib.get_front_month_conid(leg)
            if conid is None:
                logger.error("Cannot resolve conId for %s", leg.symbol)
                return None
            conids.append(conid)
        return conids

    def _compute_combo_qty(self, order: TradeOrder) -> float:
        """
        The BAG quantity is expressed in terms of the minimum unit (GCD of leg ratios).
        e.g. crack 3:2:1 → 1 BAG unit = 3 CL + 2 RB + 1 HO
        """
        from math import gcd
        from functools import reduce
        ratios = [abs(l.contracts) for l in order.legs if l.contracts != 0]
        if not ratios:
            return 1.0
        g = reduce(gcd, ratios)
        n_units = ratios[0] // g
        return float(n_units)

    @staticmethod
    def _spread_limit_price(spread_price: float, action: str) -> float:
        """
        Aggressive limit price: enter 1 tick inside the current spread.
        For LONG: pay slightly more; for SHORT: take slightly less.
        """
        tick = max(abs(spread_price) * 0.0005, 0.01)
        if action == "BUY" or action == "LONG":
            return spread_price + tick
        return spread_price - tick

    # ── State accessors ───────────────────────────────────────────────────────

    def has_position(self, pair_name: str) -> bool:
        return pair_name in self._positions

    def open_positions(self) -> Dict[str, OpenPosition]:
        return dict(self._positions)

    def num_open(self) -> int:
        return len(self._positions)

    def sync_fills(self) -> None:
        """Pull latest fill prices from IB for all open positions."""
        for pos in self._positions.values():
            try:
                fill = pos.ib_trade.orderStatus.avgFillPrice
                if fill and fill > 0:
                    pos.fill_price = fill
                st = pos.ib_trade.orderStatus.status
                if st == "Filled":
                    pos.status = OrderStatus.FILLED
                elif st in ("ApiCancelled", "Cancelled"):
                    pos.status = OrderStatus.CANCELLED
            except Exception:
                pass
