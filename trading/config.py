"""
Strategy configuration — pair definitions, risk limits, signal thresholds.

Five pairs ranked by mean-reversion reliability:
  1. Soybean Crush  (ZS/ZM/ZL)  — physical processing arbitrage
  2. 3:2:1 Crack    (CL/RB/HO)  — refinery margin arbitrage
  3. WTI-Brent      (CL/BZ)     — logistics spread
  4. Treasury NOB   (ZN/ZB)     — yield curve shape
  5. Gold-Silver    (GC/SI)     — monetary metals ratio
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import List


class PairType(str, Enum):
    CRUSH_SPREAD = "crush_spread"
    CRACK_SPREAD = "crack_spread"
    WTI_BRENT = "wti_brent"
    TREASURY_NOB = "treasury_nob"
    GOLD_SILVER = "gold_silver"


class HedgeMethod(str, Enum):
    STATIC_OLS = "static_ols"
    ROLLING_OLS = "rolling_ols"
    KALMAN = "kalman"


@dataclass
class LegSpec:
    symbol: str
    exchange: str
    currency: str
    sec_type: str           # "FUT"
    multiplier: str         # e.g. "1000" for CL
    description: str
    # Signed ratio in the spread formula:
    #   positive = long leg, negative = short leg
    ratio: int


@dataclass
class PairConfig:
    name: str
    pair_type: PairType
    legs: List[LegSpec]
    hedge_method: HedgeMethod = HedgeMethod.KALMAN

    # Signal thresholds
    z_entry: float = 2.0
    z_exit: float = 0.5
    z_stop: float = 3.5

    # Tradeable half-life window (trading days)
    min_half_life: int = 5
    max_half_life: int = 60

    # Cointegration p-value gates
    coint_enter_p: float = 0.05
    coint_exit_p: float = 0.10

    # Kalman process-noise delta
    kalman_delta: float = 1e-4

    # Rolling OLS window (trading days)
    rolling_ols_window: int = 60

    # Time-stop: exit after N × half_life bars
    time_stop_mult: float = 3.0

    # IB spread margin reference (USD, approximate)
    approx_span_margin: float = 2000.0

    enabled: bool = True


@dataclass
class StrategyConfig:
    # ── IB Gateway ───────────────────────────────────────────────────────────
    ib_host: str = "127.0.0.1"
    ib_port: int = 4002          # 4001 live | 4002 paper
    ib_client_id: int = 1

    # ── Formation period ──────────────────────────────────────────────────────
    formation_days: int = 252    # 1 trading year

    # ── Risk / sizing ─────────────────────────────────────────────────────────
    account_equity: float = 100_000.0
    risk_per_trade_pct: float = 0.01     # 1% of equity per trade
    max_active_pairs: int = 3
    use_half_kelly: bool = True

    # ── Portfolio allocation ──────────────────────────────────────────────────
    # Inverse-vol weighting across active pairs
    use_inv_vol_weighting: bool = True

    # ── Re-test cointegration every N days ───────────────────────────────────
    coint_retest_days: int = 30

    # ── AI analysis ──────────────────────────────────────────────────────────
    ai_analysis_interval_hours: int = 6

    # ── Pairs (populated below) ───────────────────────────────────────────────
    pairs: List[PairConfig] = field(default_factory=list)


# ── Pair definitions ──────────────────────────────────────────────────────────

SOYBEAN_CRUSH = PairConfig(
    name="Soybean Crush (ZS/ZM/ZL)",
    pair_type=PairType.CRUSH_SPREAD,
    hedge_method=HedgeMethod.STATIC_OLS,   # 1:1:1 ratio is physically stable
    legs=[
        LegSpec("ZS", "CBOT", "USD", "FUT", "50",  "Soybeans",      ratio=-1),
        LegSpec("ZM", "CBOT", "USD", "FUT", "100", "Soybean Meal",  ratio=+1),
        LegSpec("ZL", "CBOT", "USD", "FUT", "600", "Soybean Oil",   ratio=+1),
    ],
    z_entry=2.0,
    z_stop=3.5,
    min_half_life=3,
    max_half_life=20,
    approx_span_margin=2000.0,
    kalman_delta=1e-4,
)

CRACK_SPREAD_321 = PairConfig(
    name="3:2:1 Crack Spread (CL/RB/HO)",
    pair_type=PairType.CRACK_SPREAD,
    hedge_method=HedgeMethod.STATIC_OLS,   # 3:2:1 is physically stable
    legs=[
        LegSpec("CL", "NYMEX", "USD", "FUT", "1000", "WTI Crude",        ratio=-3),
        LegSpec("RB", "NYMEX", "USD", "FUT", "42000","RBOB Gasoline",     ratio=+2),
        LegSpec("HO", "NYMEX", "USD", "FUT", "42000","Heating Oil/ULSD",  ratio=+1),
    ],
    z_entry=2.0,
    z_stop=3.5,
    min_half_life=10,
    max_half_life=20,
    approx_span_margin=1451.0,
    kalman_delta=1e-4,
)

WTI_BRENT = PairConfig(
    name="WTI-Brent Spread (CL/BZ)",
    pair_type=PairType.WTI_BRENT,
    hedge_method=HedgeMethod.KALMAN,       # structural break → dynamic hedge
    legs=[
        LegSpec("CL", "NYMEX", "USD", "FUT", "1000", "WTI Crude",   ratio=+1),
        LegSpec("BZ", "NYMEX", "USD", "FUT", "1000", "Brent Crude",  ratio=-1),
    ],
    z_entry=2.0,
    z_stop=3.5,
    min_half_life=15,
    max_half_life=40,
    approx_span_margin=2500.0,
    kalman_delta=5e-5,
)

TREASURY_NOB = PairConfig(
    name="Treasury NOB Spread (ZN/ZB)",
    pair_type=PairType.TREASURY_NOB,
    hedge_method=HedgeMethod.ROLLING_OLS,  # DV01-weighted; CTD changes quarterly
    legs=[
        LegSpec("ZN", "CBOT", "USD", "FUT", "1000", "10-Year T-Note", ratio=+1),
        LegSpec("ZB", "CBOT", "USD", "FUT", "1000", "30-Year T-Bond",  ratio=-1),
    ],
    z_entry=2.0,
    z_stop=3.5,
    min_half_life=5,
    max_half_life=20,
    approx_span_margin=1500.0,
    rolling_ols_window=40,
    kalman_delta=1e-4,
)

GOLD_SILVER = PairConfig(
    name="Gold-Silver Ratio (GC/SI)",
    pair_type=PairType.GOLD_SILVER,
    hedge_method=HedgeMethod.KALMAN,       # ratio drifts significantly
    legs=[
        LegSpec("GC", "COMEX", "USD", "FUT", "100",  "Gold",   ratio=+1),
        LegSpec("SI", "COMEX", "USD", "FUT", "5000", "Silver",  ratio=-1),
    ],
    z_entry=2.0,
    z_stop=3.5,
    min_half_life=30,
    max_half_life=90,
    approx_span_margin=7000.0,
    kalman_delta=5e-5,
)

# Default strategy config — enable top two pairs (strongest physical anchors)
DEFAULT_CONFIG = StrategyConfig(
    pairs=[SOYBEAN_CRUSH, CRACK_SPREAD_321, WTI_BRENT, TREASURY_NOB, GOLD_SILVER]
)
