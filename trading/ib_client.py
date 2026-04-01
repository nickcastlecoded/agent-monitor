"""
IB Gateway client — connection, historical data, live tickers, contract resolution,
what-if margin queries.

Uses ib_async (the actively-maintained successor to ib_insync).
Connect on port 4001 (live) or 4002 (paper).

Key IB API constraints enforced here:
  - CONTFUT endDateTime must be '' (empty string) — TWS 10.30+ / error 10339
  - Max 60 historical data requests per 10-minute window
  - No identical requests within 15 seconds
  - Max 50 messages/second to Gateway
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from typing import Dict, List, Optional, Tuple

import pandas as pd
from ib_async import (
    IB,
    BarData,
    Contract,
    ComboLeg,
    Future,
    Order,
    LimitOrder,
    MarketOrder,
    TagValue,
    Trade,
    Ticker,
    util,
)

from config import LegSpec, PairConfig, StrategyConfig

logger = logging.getLogger(__name__)


# ── Rate-limit bookkeeping ────────────────────────────────────────────────────

class _HistRateLimit:
    """Sliding-window rate limiter: 60 requests per 600 seconds."""

    MAX_REQUESTS = 60
    WINDOW_SEC = 600
    MIN_REPEAT_SEC = 15

    def __init__(self) -> None:
        self._timestamps: deque[float] = deque()
        self._last_key: Dict[str, float] = {}

    async def acquire(self, key: str) -> None:
        now = time.monotonic()

        # Enforce per-key 15-second gap
        last = self._last_key.get(key, 0.0)
        wait_repeat = max(0.0, self.MIN_REPEAT_SEC - (now - last))
        if wait_repeat:
            logger.debug("Rate-limit: waiting %.1fs for repeat key %s", wait_repeat, key)
            await asyncio.sleep(wait_repeat)
            now = time.monotonic()

        # Enforce 60-per-600s window
        while True:
            # Remove timestamps outside window
            cutoff = now - self.WINDOW_SEC
            while self._timestamps and self._timestamps[0] < cutoff:
                self._timestamps.popleft()
            if len(self._timestamps) < self.MAX_REQUESTS:
                break
            sleep_for = self._timestamps[0] - cutoff + 0.5
            logger.warning("Historical data rate limit reached; sleeping %.1fs", sleep_for)
            await asyncio.sleep(sleep_for)
            now = time.monotonic()

        self._timestamps.append(now)
        self._last_key[key] = now


_rate_limit = _HistRateLimit()


# ── Contract helpers ──────────────────────────────────────────────────────────

def make_contfut(leg: LegSpec) -> Contract:
    """Continuous futures contract for historical data."""
    return Contract(
        symbol=leg.symbol,
        secType="CONTFUT",
        exchange=leg.exchange,
        currency=leg.currency,
    )


def make_future(leg: LegSpec, expiry: str) -> Future:
    """Specific-expiry futures contract for live data and order placement."""
    return Future(
        symbol=leg.symbol,
        lastTradeDateOrContractMonth=expiry,
        exchange=leg.exchange,
        currency=leg.currency,
        multiplier=leg.multiplier,
    )


def make_combo(pair: PairConfig, leg_conids: List[int]) -> Contract:
    """
    Build a SMART-routed BAG (combo) contract.

    leg_conids must be in the same order as pair.legs.
    Positive ratio → BUY leg; negative ratio → SELL leg.
    """
    combo = Contract()
    combo.symbol = pair.legs[0].symbol
    combo.secType = "BAG"
    combo.exchange = "SMART"
    combo.currency = pair.legs[0].currency

    combo_legs = []
    for leg_spec, conid in zip(pair.legs, leg_conids):
        cl = ComboLeg()
        cl.conId = conid
        cl.ratio = abs(leg_spec.ratio)
        cl.action = "BUY" if leg_spec.ratio > 0 else "SELL"
        cl.exchange = leg_spec.exchange
        combo_legs.append(cl)

    combo.comboLegs = combo_legs
    return combo


def non_guaranteed_limit(action: str, qty: float, price: float) -> Order:
    """Non-guaranteed limit order for inter-commodity combos."""
    o = LimitOrder(action, qty, price)
    o.smartComboRoutingParams = [TagValue("NonGuaranteed", "1")]
    o.transmit = True
    return o


def non_guaranteed_market(action: str, qty: float) -> Order:
    """Non-guaranteed market order for urgent exits."""
    o = MarketOrder(action, qty)
    o.smartComboRoutingParams = [TagValue("NonGuaranteed", "1")]
    o.transmit = True
    return o


# ── Main IB client ────────────────────────────────────────────────────────────

class IBClient:
    """Thin async wrapper around ib_async.IB for this strategy."""

    def __init__(self, cfg: StrategyConfig) -> None:
        self.cfg = cfg
        self.ib = IB()
        self._connected = False

    # ── Connection ────────────────────────────────────────────────────────────

    async def connect(self) -> None:
        await self.ib.connectAsync(
            host=self.cfg.ib_host,
            port=self.cfg.ib_port,
            clientId=self.cfg.ib_client_id,
        )
        self._connected = True
        logger.info(
            "Connected to IB Gateway %s:%d (clientId=%d)",
            self.cfg.ib_host, self.cfg.ib_port, self.cfg.ib_client_id,
        )

    async def disconnect(self) -> None:
        if self._connected:
            self.ib.disconnect()
            self._connected = False
            logger.info("Disconnected from IB Gateway.")

    @property
    def connected(self) -> bool:
        return self._connected and self.ib.isConnected()

    # ── Account ───────────────────────────────────────────────────────────────

    async def get_net_liquidation(self) -> float:
        """Return NLV from account summary."""
        [summary] = await self.ib.accountSummaryAsync()
        for item in summary:
            if item.tag == "NetLiquidation":
                return float(item.value)
        return self.cfg.account_equity

    async def get_excess_liquidity(self) -> float:
        tags = await self.ib.accountSummaryAsync()
        for item in tags[0]:
            if item.tag == "ExcessLiquidity":
                return float(item.value)
        return 0.0

    # ── Contract resolution ───────────────────────────────────────────────────

    async def resolve_contract(self, contract: Contract) -> Optional[Contract]:
        """Qualify a contract against IB, returning the first match."""
        details = await self.ib.reqContractDetailsAsync(contract)
        if not details:
            logger.warning("No contract details for %s", contract.symbol)
            return None
        return details[0].contract

    async def get_front_month_conid(self, leg: LegSpec) -> Optional[int]:
        """Return the conId of the nearest active contract for a leg."""
        fut = Contract(
            symbol=leg.symbol,
            secType="FUT",
            exchange=leg.exchange,
            currency=leg.currency,
        )
        details = await self.ib.reqContractDetailsAsync(fut)
        if not details:
            return None
        # Sort by expiry, take front month
        details.sort(key=lambda d: d.contract.lastTradeDateOrContractMonth)
        return details[0].contract.conId

    async def get_front_month_expiry(self, leg: LegSpec) -> Optional[str]:
        fut = Contract(
            symbol=leg.symbol,
            secType="FUT",
            exchange=leg.exchange,
            currency=leg.currency,
        )
        details = await self.ib.reqContractDetailsAsync(fut)
        if not details:
            return None
        details.sort(key=lambda d: d.contract.lastTradeDateOrContractMonth)
        return details[0].contract.lastTradeDateOrContractMonth

    # ── Historical data ───────────────────────────────────────────────────────

    async def get_daily_bars(
        self,
        leg: LegSpec,
        n_days: int = 252,
    ) -> pd.Series:
        """
        Fetch back-adjusted daily closes for a continuous futures contract.
        Returns a pd.Series indexed by date, named leg.symbol.
        """
        contract = make_contfut(leg)
        key = f"{leg.symbol}_{n_days}"
        await _rate_limit.acquire(key)

        duration = f"{max(n_days + 20, 252)} D"
        bars: List[BarData] = await self.ib.reqHistoricalDataAsync(
            contract,
            endDateTime="",          # MUST be empty for CONTFUT
            durationStr=duration,
            barSizeSetting="1 day",
            whatToShow="TRADES",
            useRTH=True,
            formatDate=1,
            keepUpToDate=False,
        )
        if not bars:
            logger.warning("No historical bars returned for %s", leg.symbol)
            return pd.Series(dtype=float, name=leg.symbol)

        df = util.df(bars)[["date", "close"]].copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date").sort_index()
        series = df["close"].tail(n_days)
        series.name = leg.symbol
        logger.debug("Loaded %d bars for %s", len(series), leg.symbol)
        return series

    async def get_pair_history(
        self,
        pair: PairConfig,
        n_days: int = 252,
    ) -> pd.DataFrame:
        """
        Load daily closes for all legs of a pair.
        Returns a DataFrame with columns = [leg.symbol, ...].
        Rows are the intersection of available trading dates.
        """
        tasks = [self.get_daily_bars(leg, n_days) for leg in pair.legs]
        series_list = await asyncio.gather(*tasks)

        df = pd.concat(series_list, axis=1).dropna()
        logger.info(
            "Pair %s: loaded %d common daily bars for %d legs",
            pair.name, len(df), len(pair.legs),
        )
        return df

    # ── Live market data ──────────────────────────────────────────────────────

    async def subscribe_live_tick(self, leg: LegSpec, expiry: str) -> Ticker:
        """Subscribe to real-time last/bid/ask for a specific-expiry contract."""
        contract = make_future(leg, expiry)
        qualified = await self.resolve_contract(contract)
        if qualified is None:
            raise RuntimeError(f"Cannot qualify contract for {leg.symbol} {expiry}")
        ticker = self.ib.reqMktData(qualified, "", False, False)
        return ticker

    def cancel_market_data(self, contract: Contract) -> None:
        self.ib.cancelMktData(contract)

    # ── What-if margin ────────────────────────────────────────────────────────

    async def what_if_margin(
        self,
        combo: Contract,
        order: Order,
    ) -> Tuple[float, float]:
        """
        Return (initMarginChange, maintMarginChange) for a what-if order.
        Both values are negative when margin is consumed.
        """
        what_if_order = Order(**{k: v for k, v in order.__dict__.items()})
        what_if_order.whatIf = True
        trade = self.ib.placeOrder(combo, what_if_order)
        await asyncio.sleep(0.5)   # allow TWS to populate orderStatus
        st = trade.orderStatus
        init = float(st.initMarginChange) if st.initMarginChange else 0.0
        maint = float(st.maintMarginChange) if st.maintMarginChange else 0.0
        self.ib.cancelOrder(trade.order)
        return init, maint

    # ── Order placement ───────────────────────────────────────────────────────

    def place_combo_limit(
        self,
        combo: Contract,
        action: str,
        qty: float,
        limit_price: float,
    ) -> Trade:
        order = non_guaranteed_limit(action, qty, limit_price)
        trade = self.ib.placeOrder(combo, order)
        logger.info(
            "Placed %s combo limit %.2f × %d @ %.4f",
            action, qty, 1, limit_price,
        )
        return trade

    def place_combo_market(
        self,
        combo: Contract,
        action: str,
        qty: float,
    ) -> Trade:
        order = non_guaranteed_market(action, qty)
        trade = self.ib.placeOrder(combo, order)
        logger.info("Placed %s combo MARKET × %d", action, qty)
        return trade

    def cancel_order(self, trade: Trade) -> None:
        self.ib.cancelOrder(trade.order)

    # ── Positions ─────────────────────────────────────────────────────────────

    async def get_positions(self) -> List:
        return await self.ib.reqPositionsAsync()

    # ── Event loop keep-alive ─────────────────────────────────────────────────

    async def sleep(self, seconds: float) -> None:
        await self.ib.sleep(seconds)
