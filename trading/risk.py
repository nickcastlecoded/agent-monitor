"""
Position sizing and portfolio risk management.

Implements:
  • Dollar-neutral leg sizing (match notional exposure across legs)
  • Risk-per-trade sizing  (risk 1–2% of equity per z-unit of stop)
  • Inverse-volatility weighting across active pairs
  • Half-Kelly criterion for optimal leverage
  • Margin check (compare required margin vs. available liquidity)
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from config import LegSpec, PairConfig, StrategyConfig
from strategy import Signal

logger = logging.getLogger(__name__)


@dataclass
class LegOrder:
    """Signed order for one futures leg."""
    leg: LegSpec
    contracts: int        # positive = buy, negative = sell
    notional: float       # dollar notional (abs)
    multiplier: float


@dataclass
class TradeOrder:
    """Complete trade for one pair spread — one order per leg."""
    pair_name: str
    pair: PairConfig
    side: str             # "LONG" | "SHORT" | "EXIT"
    legs: List[LegOrder]
    total_notional: float
    estimated_margin: float
    notes: str = ""


# ── Sizing helpers ────────────────────────────────────────────────────────────

def _multiplier(leg: LegSpec) -> float:
    return float(leg.multiplier)


def dollar_notional(leg: LegSpec, price: float, contracts: int) -> float:
    return abs(contracts) * price * _multiplier(leg)


def contracts_for_notional(
    leg: LegSpec,
    price: float,
    target_notional: float,
) -> int:
    """Floor to nearest integer number of contracts."""
    mult = _multiplier(leg)
    if price <= 0 or mult <= 0:
        return 0
    raw = target_notional / (price * mult)
    return max(1, int(math.floor(raw)))


# ── Core sizing engine ────────────────────────────────────────────────────────

class PositionSizer:
    """
    Computes contract quantities for each leg of a spread trade.

    Sizing flow
    -----------
    1. Compute `base_notional` from risk-per-trade or Kelly
    2. Apply inverse-vol weight for this pair
    3. Convert notional → integer contracts for the anchor leg
    4. Size remaining legs to match the anchor using the physical ratios
       (crush 1:1:1, crack 3:2:1) or the current hedge ratio (two-leg pairs)
    """

    def __init__(self, cfg: StrategyConfig) -> None:
        self.cfg = cfg

    def size_trade(
        self,
        signal: Signal,
        pair: PairConfig,
        prices: Dict[str, float],
        equity: float,
        spread_volatility: float,
        inv_vol_weight: float = 1.0,
    ) -> Optional[TradeOrder]:
        """
        Return a TradeOrder for `signal` or None if sizing fails / margin too low.

        Parameters
        ----------
        signal           : Signal object carrying hedge_ratio and z-score
        pair             : PairConfig for the pair
        prices           : {symbol: last_price} for each leg
        equity           : current account NLV
        spread_volatility: rolling std of the spread (same units as spread)
        inv_vol_weight   : portfolio weight from inverse-vol allocation (0–1)
        """
        symbols = [leg.symbol for leg in pair.legs]
        for sym in symbols:
            if sym not in prices or prices[sym] <= 0:
                logger.warning("Missing price for %s in pair %s", sym, pair.name)
                return None

        # ── Base notional from risk-per-trade ─────────────────────────────────
        z_stop_distance = abs(pair.z_stop - abs(signal.z_score))
        if z_stop_distance < 0.1:
            z_stop_distance = 0.1   # floor

        if spread_volatility > 0:
            base_notional = (equity * self.cfg.risk_per_trade_pct) / (
                spread_volatility * z_stop_distance / prices[symbols[0]]
            )
        else:
            base_notional = equity * self.cfg.risk_per_trade_pct * 10

        # Apply half-Kelly if requested
        if self.cfg.use_half_kelly:
            kelly_notional = self._kelly_notional(signal, equity, spread_volatility)
            if kelly_notional > 0:
                base_notional = min(base_notional, kelly_notional)

        # Apply inverse-vol portfolio weight
        base_notional *= inv_vol_weight

        # Cap to 20% of equity to avoid overconcentration
        base_notional = min(base_notional, equity * 0.20)

        if base_notional <= 0:
            logger.warning("Degenerate base_notional for %s", pair.name)
            return None

        # ── Build leg orders ──────────────────────────────────────────────────
        leg_orders = self._build_leg_orders(
            pair=pair,
            signal=signal,
            prices=prices,
            base_notional=base_notional,
        )
        if not leg_orders:
            return None

        total_notional = sum(lo.notional for lo in leg_orders)
        est_margin = pair.approx_span_margin * sum(abs(lo.contracts) for lo in leg_orders if lo.contracts != 0) / max(1, sum(abs(r) for r in [l.ratio for l in pair.legs]))

        return TradeOrder(
            pair_name=pair.name,
            pair=pair,
            side=signal.signal.value.upper().replace("ENTER_", ""),
            legs=leg_orders,
            total_notional=total_notional,
            estimated_margin=est_margin,
            notes=signal.notes,
        )

    def _build_leg_orders(
        self,
        pair: PairConfig,
        signal: Signal,
        prices: Dict[str, float],
        base_notional: float,
    ) -> List[LegOrder]:
        """
        Compute signed contracts for each leg.

        Convention (LONG spread = buy spread = spread undervalued):
          • Each leg's direction = sign(leg.ratio)
          • For a LONG trade: buy positive-ratio legs, sell negative-ratio legs
          • For a SHORT trade: reverse all signs

        For two-leg pairs the anchor leg is the first (Y), sized to base_notional.
        The second leg (X) is sized as: contracts_X = β × contracts_Y.
        For fixed-ratio pairs (crush 1:1:1, crack 3:2:1) the ratios encode the lot.
        """
        from strategy import SignalType
        is_long = signal.signal in (SignalType.ENTER_LONG,)
        sign = 1 if is_long else -1   # +1 for LONG spread, -1 for SHORT

        legs = pair.legs
        leg_orders: List[LegOrder] = []

        if len(legs) == 2:
            # Two-leg pair: size anchor (Y = legs[0]) to base_notional
            anchor = legs[0]
            other = legs[1]
            p_anchor = prices[anchor.symbol]
            p_other = prices[other.symbol]

            n_anchor = contracts_for_notional(anchor, p_anchor, base_notional)
            # Other leg scaled by hedge ratio and sign of pair ratios
            beta = signal.hedge_ratio
            n_other_raw = beta * n_anchor
            n_other = max(1, int(round(n_other_raw)))

            # Check imbalance < 5%
            notional_anchor = dollar_notional(anchor, p_anchor, n_anchor)
            notional_other = dollar_notional(other, p_other, n_other)
            imbalance = abs(notional_anchor - notional_other) / max(notional_anchor, 1)
            if imbalance > 0.10:
                logger.debug(
                    "%s: notional imbalance %.1f%% (anchor=%.0f other=%.0f)",
                    pair.name, imbalance * 100, notional_anchor, notional_other,
                )

            # Apply trade direction using leg ratios and spread direction
            dir_anchor = sign * (1 if anchor.ratio > 0 else -1)
            dir_other = sign * (1 if other.ratio > 0 else -1)

            leg_orders.append(LegOrder(
                leg=anchor,
                contracts=dir_anchor * n_anchor,
                notional=notional_anchor,
                multiplier=_multiplier(anchor),
            ))
            leg_orders.append(LegOrder(
                leg=other,
                contracts=dir_other * n_other,
                notional=notional_other,
                multiplier=_multiplier(other),
            ))

        else:
            # Multi-leg (crush 3-leg, crack 3-leg): use fixed ratio encoding
            # Anchor to the first leg with abs(ratio) = maximum
            max_ratio = max(abs(l.ratio) for l in legs)
            anchor = next(l for l in legs if abs(l.ratio) == max_ratio)
            p_anchor = prices[anchor.symbol]
            n_unit = max(1, contracts_for_notional(anchor, p_anchor, base_notional / max_ratio))

            for leg in legs:
                n_leg = n_unit * abs(leg.ratio)
                dir_leg = sign * (1 if leg.ratio > 0 else -1)
                leg_orders.append(LegOrder(
                    leg=leg,
                    contracts=dir_leg * n_leg,
                    notional=dollar_notional(leg, prices[leg.symbol], n_leg),
                    multiplier=_multiplier(leg),
                ))

        return leg_orders

    def _kelly_notional(
        self,
        signal: Signal,
        equity: float,
        spread_vol: float,
    ) -> float:
        """
        Half-Kelly fraction of equity to risk.
        f* = μ_spread / σ²_spread; use f*/2 in practice.
        We approximate μ_spread ≈ signal.z_score × spread_vol (mean reversion premium).
        """
        if spread_vol <= 0:
            return 0.0
        mu_approx = abs(signal.z_score) * spread_vol
        sigma_sq = spread_vol ** 2
        f_star = mu_approx / (sigma_sq + 1e-12)
        half_kelly = 0.5 * f_star
        # Kelly fraction is expressed as fraction of wealth
        return min(half_kelly * equity, equity * 0.25)


# ── Inverse-vol portfolio weights ─────────────────────────────────────────────

def inverse_vol_weights(spread_vols: Dict[str, float]) -> Dict[str, float]:
    """
    Compute inverse-volatility weights so each pair contributes equal risk.
    spread_vols: {pair_name: annualised_spread_vol}
    """
    if not spread_vols:
        return {}

    inv = {k: 1.0 / max(v, 1e-12) for k, v in spread_vols.items()}
    total = sum(inv.values())
    return {k: v / total for k, v in inv.items()}


# ── Margin pre-check ──────────────────────────────────────────────────────────

def margin_sufficient(
    estimated_margin: float,
    excess_liquidity: float,
    safety_factor: float = 1.5,
) -> bool:
    """
    Only enter a trade if excess liquidity covers estimated margin × safety factor.
    """
    required = estimated_margin * safety_factor
    ok = excess_liquidity >= required
    if not ok:
        logger.warning(
            "Margin check failed: excess_liquidity=%.0f < required=%.0f",
            excess_liquidity, required,
        )
    return ok
