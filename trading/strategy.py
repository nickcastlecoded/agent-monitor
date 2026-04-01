"""
Spread construction, z-score calculation, and signal generation.

One PairStrategy instance per active pair.  The strategy is stateful:
  • Maintains the current Kalman / rolling-OLS hedge ratio
  • Tracks the rolling z-score window sized to the half-life
  • Emits discrete Signal objects consumed by the execution layer

Signal types
  ENTER_LONG   → spread is cheap → buy Y, sell X
  ENTER_SHORT  → spread is rich  → sell Y, buy X
  EXIT         → z-score has reverted to target
  STOP_LOSS    → z-score beyond hard stop
  TIME_STOP    → held > N × half_life bars without reversion
  COINT_STOP   → rolling cointegration p-value has exceeded exit threshold
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Deque, Dict, List, Optional, Tuple
from collections import deque

import numpy as np
import pandas as pd

from config import HedgeMethod, PairConfig
from statistics import (
    CointegrationResult,
    KalmanHedge,
    OUParams,
    OptimalThresholds,
    estimate_half_life,
    estimate_ou_params,
    hurst_exponent,
    optimal_ou_thresholds,
    engle_granger,
    johansen_test,
)

logger = logging.getLogger(__name__)


class SignalType(str, Enum):
    ENTER_LONG = "enter_long"
    ENTER_SHORT = "enter_short"
    EXIT = "exit"
    STOP_LOSS = "stop_loss"
    TIME_STOP = "time_stop"
    COINT_STOP = "coint_stop"
    HOLD = "hold"


class PositionSide(str, Enum):
    LONG = "long"    # long spread (buy Y, sell X)
    SHORT = "short"  # short spread (sell Y, buy X)
    FLAT = "flat"


@dataclass
class Signal:
    pair_name: str
    signal: SignalType
    z_score: float
    spread: float
    hedge_ratio: float      # current β
    alpha: float            # current α (intercept)
    half_life: float
    hurst: float
    timestamp: pd.Timestamp
    notes: str = ""


@dataclass
class SpreadState:
    """Rolling state maintained across each price update."""
    prices: Dict[str, float] = field(default_factory=dict)
    spread_history: Deque[float] = field(default_factory=lambda: deque(maxlen=500))
    z_score_history: Deque[float] = field(default_factory=lambda: deque(maxlen=500))
    bars_in_position: int = 0
    position_side: PositionSide = PositionSide.FLAT
    entry_z: float = 0.0
    last_coint_pval: float = 0.0


class PairStrategy:
    """
    Per-pair strategy logic.  Feed daily closes via `update()`, receive Signals.
    """

    def __init__(
        self,
        pair: PairConfig,
        coint_result: CointegrationResult,
        ou_params: OUParams,
        optimal_thresh: OptimalThresholds,
    ) -> None:
        self.pair = pair
        self.coint = coint_result
        self.ou = ou_params
        self.optimal = optimal_thresh

        # Active thresholds — start with optimal, fallback to config defaults
        self.z_entry = max(pair.z_entry, optimal_thresh.entry)
        self.z_exit = min(pair.z_exit, optimal_thresh.exit)
        self.z_stop = pair.z_stop

        self.half_life = max(coint_result.half_life_days, pair.min_half_life)
        self.z_window = max(int(self.half_life), 20)

        # Hedge-ratio estimators
        self._kalman = KalmanHedge(delta=pair.kalman_delta)
        self._beta_ols = coint_result.hedge_ratio
        self._alpha_ols = coint_result.spread_mean

        self._rolling_betas: Deque[float] = deque(maxlen=pair.rolling_ols_window + 10)
        self._rolling_y: Deque[float] = deque(maxlen=pair.rolling_ols_window + 10)
        self._rolling_x: Deque[float] = deque(maxlen=pair.rolling_ols_window + 10)

        self._state = SpreadState()
        self._state.last_coint_pval = coint_result.eg_pvalue

        # Warm-up flag: need z_window bars before issuing signals
        self._warm = False
        self._bar_count = 0

        logger.info(
            "PairStrategy initialised: %s | HL=%.1f | z_entry=%.2f | z_exit=%.2f | method=%s",
            pair.name, self.half_life, self.z_entry, self.z_exit, pair.hedge_method,
        )

    # ── Formation-period warm-up ──────────────────────────────────────────────

    def warm_up(self, df: pd.DataFrame) -> None:
        """
        Feed the full formation-period DataFrame to prime internal estimators.
        df columns must match leg symbols in order: [Y_symbol, X_symbol] for
        two-leg pairs, or a pre-built [spread_col, zero_col] for multi-leg.
        """
        symbols = [leg.symbol for leg in self.pair.legs]
        if len(symbols) < 2:
            return

        y_col, x_col = symbols[0], symbols[1]
        if y_col not in df.columns or x_col not in df.columns:
            return

        for _, row in df.iterrows():
            self._update_hedge(float(row[y_col]), float(row[x_col]))
            spread = self._compute_spread(float(row[y_col]), float(row[x_col]))
            self._state.spread_history.append(spread)
            if len(self._state.spread_history) >= self.z_window:
                z = self._compute_z(spread)
                self._state.z_score_history.append(z)

        self._warm = True
        logger.debug("PairStrategy %s warmed up on %d bars", self.pair.name, len(df))

    # ── Per-bar update ────────────────────────────────────────────────────────

    def update(
        self,
        prices: Dict[str, float],
        timestamp: pd.Timestamp,
        coint_pval: Optional[float] = None,
    ) -> Signal:
        """
        Process one bar of prices.  prices keys = leg symbols.
        Returns a Signal (may be HOLD if no action needed).
        """
        symbols = [leg.symbol for leg in self.pair.legs]
        if len(symbols) < 2:
            return self._hold(timestamp)

        # For multi-leg pairs (crush, crack) the spread is a pre-built value
        # passed as prices["__spread__"]
        if "__spread__" in prices:
            raw_spread = prices["__spread__"]
            alpha, beta = self._alpha_ols, 1.0
        else:
            y_val = prices.get(symbols[0])
            x_val = prices.get(symbols[1])
            if y_val is None or x_val is None:
                return self._hold(timestamp)
            alpha, beta = self._update_hedge(y_val, x_val)
            raw_spread = self._compute_spread(y_val, x_val)

        self._state.spread_history.append(raw_spread)
        self._bar_count += 1

        if len(self._state.spread_history) < self.z_window:
            return self._hold(timestamp)

        self._warm = True
        z = self._compute_z(raw_spread)
        self._state.z_score_history.append(z)

        # Update cointegration p-value if provided
        if coint_pval is not None:
            self._state.last_coint_pval = coint_pval

        hurst = self._rolling_hurst()
        sig = self._evaluate_signal(z, raw_spread, beta, alpha, hurst, timestamp)

        # Track holding period
        if self._state.position_side != PositionSide.FLAT:
            self._state.bars_in_position += 1

        return sig

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _update_hedge(self, y: float, x: float) -> Tuple[float, float]:
        method = self.pair.hedge_method

        if method == HedgeMethod.KALMAN:
            alpha, beta, _, _ = self._kalman.update(y, x)
            return alpha, beta

        elif method == HedgeMethod.ROLLING_OLS:
            self._rolling_y.append(y)
            self._rolling_x.append(x)
            win = self.pair.rolling_ols_window
            if len(self._rolling_y) >= win:
                yarr = np.array(list(self._rolling_y)[-win:])
                xarr = np.array(list(self._rolling_x)[-win:])
                X = np.column_stack([np.ones(win), xarr])
                try:
                    coefs = np.linalg.lstsq(X, yarr, rcond=None)[0]
                    self._alpha_ols = coefs[0]
                    self._beta_ols = coefs[1]
                except np.linalg.LinAlgError:
                    pass
            return self._alpha_ols, self._beta_ols

        else:  # STATIC_OLS
            return self._alpha_ols, self._beta_ols

    def _compute_spread(self, y: float, x: float) -> float:
        method = self.pair.hedge_method
        if method == HedgeMethod.KALMAN:
            alpha, beta = self._kalman.alpha, self._kalman.beta
        else:
            alpha, beta = self._alpha_ols, self._beta_ols
        return y - beta * x - alpha

    def _compute_z(self, spread: float) -> float:
        win = min(len(self._state.spread_history), self.z_window)
        recent = list(self._state.spread_history)[-win:]
        mu = np.mean(recent)
        sigma = np.std(recent, ddof=1)
        if sigma < 1e-12:
            return 0.0
        return (spread - mu) / sigma

    def _rolling_hurst(self) -> float:
        if len(self._state.spread_history) < 40:
            return 0.5
        s = pd.Series(list(self._state.spread_history)[-100:])
        return hurst_exponent(s)

    def _evaluate_signal(
        self,
        z: float,
        spread: float,
        beta: float,
        alpha: float,
        hurst: float,
        ts: pd.Timestamp,
    ) -> Signal:
        side = self._state.position_side
        hl = self.half_life

        def _sig(stype: SignalType, notes: str = "") -> Signal:
            return Signal(
                pair_name=self.pair.name,
                signal=stype,
                z_score=z,
                spread=spread,
                hedge_ratio=beta,
                alpha=alpha,
                half_life=hl,
                hurst=hurst,
                timestamp=ts,
                notes=notes,
            )

        # ── Cointegration stop ────────────────────────────────────────────────
        if self._state.last_coint_pval > self.pair.coint_exit_p:
            if side != PositionSide.FLAT:
                self._reset_position()
                return _sig(
                    SignalType.COINT_STOP,
                    f"EG p={self._state.last_coint_pval:.3f} > {self.pair.coint_exit_p}",
                )
            return self._hold(ts)

        # ── Mean-reversion regime check ───────────────────────────────────────
        if hurst > 0.55:
            logger.debug("%s: Hurst=%.3f > 0.55; skipping entry", self.pair.name, hurst)
            if side != PositionSide.FLAT:
                # Allow existing positions to play out; don't enter new
                pass
            else:
                return self._hold(ts)

        # ── In-position checks ────────────────────────────────────────────────
        if side == PositionSide.LONG:
            if z > -self.z_exit:
                self._reset_position()
                return _sig(SignalType.EXIT, f"z={z:.2f} crossed exit {self.z_exit:.2f}")
            if z < -self.z_stop:
                self._reset_position()
                return _sig(SignalType.STOP_LOSS, f"z={z:.2f} < -stop {self.z_stop:.2f}")
            if self._state.bars_in_position > self.pair.time_stop_mult * hl:
                self._reset_position()
                return _sig(
                    SignalType.TIME_STOP,
                    f"held {self._state.bars_in_position:.0f} bars > {self.pair.time_stop_mult*hl:.0f}",
                )

        elif side == PositionSide.SHORT:
            if z < self.z_exit:
                self._reset_position()
                return _sig(SignalType.EXIT, f"z={z:.2f} crossed exit {self.z_exit:.2f}")
            if z > self.z_stop:
                self._reset_position()
                return _sig(SignalType.STOP_LOSS, f"z={z:.2f} > stop {self.z_stop:.2f}")
            if self._state.bars_in_position > self.pair.time_stop_mult * hl:
                self._reset_position()
                return _sig(
                    SignalType.TIME_STOP,
                    f"held {self._state.bars_in_position:.0f} bars > {self.pair.time_stop_mult*hl:.0f}",
                )

        # ── Entry checks (only when flat) ─────────────────────────────────────
        elif side == PositionSide.FLAT:
            if z < -self.z_entry:
                self._enter_position(PositionSide.LONG, z)
                return _sig(SignalType.ENTER_LONG, f"z={z:.2f} < -{self.z_entry:.2f}")
            if z > self.z_entry:
                self._enter_position(PositionSide.SHORT, z)
                return _sig(SignalType.ENTER_SHORT, f"z={z:.2f} > {self.z_entry:.2f}")

        return self._hold(ts)

    def _enter_position(self, side: PositionSide, z: float) -> None:
        self._state.position_side = side
        self._state.bars_in_position = 0
        self._state.entry_z = z

    def _reset_position(self) -> None:
        self._state.position_side = PositionSide.FLAT
        self._state.bars_in_position = 0
        self._state.entry_z = 0.0

    def _hold(self, ts: pd.Timestamp) -> Signal:
        method = self.pair.hedge_method
        beta = self._kalman.beta if method == HedgeMethod.KALMAN else self._beta_ols
        alpha = self._kalman.alpha if method == HedgeMethod.KALMAN else self._alpha_ols
        spread = list(self._state.spread_history)[-1] if self._state.spread_history else 0.0
        z = list(self._state.z_score_history)[-1] if self._state.z_score_history else 0.0
        return Signal(
            pair_name=self.pair.name,
            signal=SignalType.HOLD,
            z_score=z,
            spread=spread,
            hedge_ratio=beta,
            alpha=alpha,
            half_life=self.half_life,
            hurst=0.5,
            timestamp=ts,
        )

    # ── Public accessors ──────────────────────────────────────────────────────

    @property
    def current_z(self) -> float:
        return self._state.z_score_history[-1] if self._state.z_score_history else 0.0

    @property
    def current_spread(self) -> float:
        return self._state.spread_history[-1] if self._state.spread_history else 0.0

    @property
    def position_side(self) -> PositionSide:
        return self._state.position_side

    @property
    def bars_in_position(self) -> int:
        return self._state.bars_in_position

    @property
    def is_warm(self) -> bool:
        return self._warm

    def update_cointegration(self, new_pval: float) -> None:
        """Called by the monitor when rolling cointegration is re-tested."""
        self._state.last_coint_pval = new_pval
        logger.info("%s: updated coint p-value → %.4f", self.pair.name, new_pval)


# ── Multi-leg spread pre-builder ──────────────────────────────────────────────

def build_crush_spread(df: pd.DataFrame) -> pd.Series:
    """
    Soybean crush margin:
    Crush = ZM·$100 + ZL·$600 − ZS·$50   (dollar terms, 1-unit contract)
    Normalised to a Z-score after dividing by a suitable scalar.
    """
    if not all(c in df.columns for c in ["ZS", "ZM", "ZL"]):
        raise ValueError("DataFrame must contain ZS, ZM, ZL columns")
    return (df["ZM"] * 100.0 + df["ZL"] * 600.0 - df["ZS"] * 50.0).rename("crush")


def build_crack_spread_321(df: pd.DataFrame) -> pd.Series:
    """
    3:2:1 Crack margin ($/bbl):
    Crack = [(2·RB·42) + (1·HO·42) − (3·CL)] / 3
    Prices are in: CL ($/bbl), RB ($/gal), HO ($/gal).
    """
    if not all(c in df.columns for c in ["CL", "RB", "HO"]):
        raise ValueError("DataFrame must contain CL, RB, HO columns")
    crack = (2 * df["RB"] * 42.0 + df["HO"] * 42.0 - 3 * df["CL"]) / 3.0
    return crack.rename("crack")
