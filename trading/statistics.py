"""
Statistical analysis engine for mean-reversion pairs trading.

Implements:
  • ADF unit-root test (both legs must be I(1))
  • Engle-Granger two-step cointegration test
  • Johansen VECM cointegration test
  • Half-life estimation via AR(1) regression on spread
  • OU process parameter estimation (θ, μ, σ)
  • Optimal entry/exit thresholds (Cummins & Bucca 2012)
  • Hurst exponent (rolling — H < 0.5 confirms mean reversion)
  • Kalman filter for dynamic hedge-ratio estimation
  • Rolling OLS hedge ratio
  • Static OLS hedge ratio
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from scipy.stats import norm
from statsmodels.regression.linear_model import OLS
from statsmodels.tools import add_constant
from statsmodels.tsa.stattools import adfuller, coint
from statsmodels.tsa.vector_ar.vecm import coint_johansen

logger = logging.getLogger(__name__)


# ── Result data classes ───────────────────────────────────────────────────────

@dataclass
class ADFResult:
    symbol: str
    statistic: float
    p_value: float
    is_nonstationary: bool   # True → I(1) candidate


@dataclass
class CointegrationResult:
    pair_name: str
    eg_pvalue: float          # Engle-Granger p-value
    johansen_trace_stat: float
    johansen_cv_5pct: float
    is_cointegrated: bool
    hedge_ratio: float        # OLS β (Y ~ β·X)
    spread_mean: float
    spread_std: float
    half_life_days: float
    hurst: float


@dataclass
class OUParams:
    theta: float   # mean-reversion speed (per day)
    mu: float      # long-run mean
    sigma: float   # diffusion (annualised via √252)
    half_life: float


@dataclass
class OptimalThresholds:
    """
    Analytically optimal entry (a) and exit (b) thresholds for an OU process.
    Maximises expected P&L per unit time using first-passage time densities.
    (Cummins & Bucca 2012, Equation framework)
    """
    entry: float   # |z| to enter trade
    exit: float    # |z| to exit trade
    expected_return_per_day: float


# ── Unit-root testing ─────────────────────────────────────────────────────────

def adf_test(series: pd.Series, max_lags: int = 10) -> ADFResult:
    """
    Augmented Dickey-Fuller test for a unit root.
    H0: series has a unit root (non-stationary).
    We want to *fail to reject* H0 for both legs of a pair → both I(1).
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        stat, pval, _, _, _, _ = adfuller(series.dropna(), maxlag=max_lags, autolag="AIC")
    return ADFResult(
        symbol=str(series.name),
        statistic=stat,
        p_value=pval,
        is_nonstationary=(pval > 0.05),   # fail to reject H0
    )


# ── Cointegration testing ─────────────────────────────────────────────────────

def engle_granger(
    y: pd.Series,
    x: pd.Series,
) -> Tuple[float, float, float]:
    """
    Engle-Granger two-step test.
    Returns (p_value, hedge_ratio_beta, spread_adf_stat).
    Tests both orderings; returns the more favourable (lower p-value).
    """
    # Ordering 1: y ~ β·x
    pval1, stat1 = _eg_one_way(y, x)
    # Ordering 2: x ~ β·y  (OLS is not symmetric)
    pval2, stat2 = _eg_one_way(x, y)

    if pval1 <= pval2:
        pval, stat = pval1, stat1
        y_reg, x_reg = y, x
    else:
        pval, stat = pval2, stat2
        y_reg, x_reg = x, y

    # Re-run OLS for the better ordering to get hedge ratio
    X = add_constant(x_reg)
    res = OLS(y_reg, X).fit()
    beta = res.params.iloc[1]
    return pval, beta, stat


def _eg_one_way(y: pd.Series, x: pd.Series) -> Tuple[float, float]:
    """Run EG test in one ordering; return (p_value, adf_stat)."""
    try:
        t_stat, p_val, _ = coint(y.values, x.values)
        return float(p_val), float(t_stat)
    except Exception:
        return 1.0, 0.0


def johansen_test(df: pd.DataFrame) -> Tuple[float, float]:
    """
    Johansen trace test for cointegration.
    Returns (trace_statistic, critical_value_5pct).
    rank(Π) >= 1 confirmed if trace_stat > cv_5pct.
    """
    try:
        result = coint_johansen(df.dropna(), det_order=0, k_ar_diff=1)
        # trace_stat[0] tests H0: rank=0 vs rank≥1
        trace = float(result.lr1[0])
        cv = float(result.cvt[0, 1])   # 5% critical value
        return trace, cv
    except Exception as exc:
        logger.warning("Johansen test failed: %s", exc)
        return 0.0, 999.0


# ── Half-life and OU parameters ───────────────────────────────────────────────

def estimate_half_life(spread: pd.Series) -> float:
    """
    Estimate half-life via AR(1) regression on spread differences.
    ΔS_t = α + β·S_{t-1} + ε_t
    half_life = −ln(2) / ln(1 + β)  ≈ −ln(2) / β  when |β| is small.
    Returns np.inf if β >= 0 (no mean reversion).
    """
    s = spread.dropna()
    delta_s = s.diff().dropna()
    s_lagged = s.shift(1).dropna()
    aligned = pd.concat([delta_s, s_lagged], axis=1).dropna()
    aligned.columns = ["ds", "s_lag"]

    X = add_constant(aligned["s_lag"])
    res = OLS(aligned["ds"], X).fit()
    beta = res.params["s_lag"]

    if beta >= 0:
        logger.debug("β ≥ 0 → no mean reversion in spread")
        return np.inf

    hl = -np.log(2) / np.log(1 + beta)
    return float(max(hl, 0.5))


def estimate_ou_params(spread: pd.Series) -> OUParams:
    """
    Estimate Ornstein-Uhlenbeck parameters via AR(1) discretisation.
    dS = θ(μ − S)dt + σ_ε dW
    """
    s = spread.dropna()
    delta_s = s.diff().dropna()
    s_lag = s.shift(1).dropna()
    df = pd.concat([delta_s, s_lag], axis=1).dropna()
    df.columns = ["ds", "s_lag"]

    X = add_constant(df["s_lag"])
    res = OLS(df["ds"], X).fit()
    alpha_hat = res.params["const"]
    beta_hat = res.params["s_lag"]

    # θ = −β, μ = −α/β
    theta = max(-beta_hat, 1e-6)
    mu = -alpha_hat / beta_hat if abs(beta_hat) > 1e-9 else float(s.mean())
    sigma_eps = float(res.resid.std())
    sigma_ou = sigma_eps * np.sqrt(2 * theta)   # annualised via √252 in caller
    half_life = np.log(2) / theta

    return OUParams(theta=theta, mu=mu, sigma=sigma_ou, half_life=half_life)


# ── Optimal thresholds (Cummins & Bucca 2012) ────────────────────────────────

def _expected_first_passage(a: float, b: float, ou: OUParams) -> float:
    """
    Expected time (days) for OU process starting at z=a to reach z=b.
    Approximation via Siegmund (1985) formula for OU exit time.
    """
    if a <= b:
        return 1e-9
    theta = ou.theta
    sigma = ou.sigma / np.sqrt(252)    # per-day sigma
    # OU normalised: X = (S − μ)/σ_∞ where σ_∞ = σ/√(2θ)
    sigma_inf = sigma / np.sqrt(2 * theta + 1e-12)
    a_norm = a * sigma_inf
    b_norm = b * sigma_inf
    # First-passage approximation
    et = (1 / theta) * (np.exp(2 * theta * (a_norm - b_norm)) - 1) / (2 * theta + 1e-12)
    return max(et, 0.01)


def optimal_ou_thresholds(
    ou: OUParams,
    transaction_cost_z: float = 0.05,
    grid_points: int = 50,
) -> OptimalThresholds:
    """
    Find (entry=a, exit=b) that maximise μ_R = (a − b − c) / E[T].
    Grid search over (a, b) with a ∈ [0.5, 4.0] and b ∈ [0.0, a).
    """
    best_ratio = -np.inf
    best_a, best_b = 2.0, 0.5

    a_vals = np.linspace(0.5, 4.0, grid_points)
    b_vals = np.linspace(0.0, 3.5, grid_points)

    for a in a_vals:
        for b in b_vals:
            if b >= a:
                continue
            et = _expected_first_passage(a, b, ou)
            net = a - b - transaction_cost_z
            if net <= 0:
                continue
            ratio = net / et
            if ratio > best_ratio:
                best_ratio = ratio
                best_a, best_b = a, b

    return OptimalThresholds(
        entry=float(best_a),
        exit=float(best_b),
        expected_return_per_day=float(best_ratio),
    )


# ── Hurst exponent ────────────────────────────────────────────────────────────

def hurst_exponent(series: pd.Series, max_lag: int = 20) -> float:
    """
    Hurst exponent via R/S analysis.
    H < 0.5 → mean-reverting  |  H = 0.5 → random walk  |  H > 0.5 → trending.
    """
    s = series.dropna().values
    n = len(s)
    if n < 20:
        return 0.5

    lags = range(2, min(max_lag, n // 2))
    rs_vals = []
    lag_vals = []

    for lag in lags:
        segments = n // lag
        if segments < 2:
            continue
        rs_seg = []
        for i in range(segments):
            seg = s[i * lag: (i + 1) * lag]
            mean = seg.mean()
            deviation = np.cumsum(seg - mean)
            r = deviation.max() - deviation.min()
            std = seg.std(ddof=1)
            if std > 0:
                rs_seg.append(r / std)
        if rs_seg:
            rs_vals.append(np.mean(rs_seg))
            lag_vals.append(lag)

    if len(lag_vals) < 2:
        return 0.5

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = np.polyfit(np.log(lag_vals), np.log(rs_vals), 1)
    return float(np.clip(fit[0], 0.0, 1.0))


# ── Kalman filter hedge ratio ─────────────────────────────────────────────────

class KalmanHedge:
    """
    State-space model for dynamic hedge ratio estimation.

    State:   θ_t = [α_t, β_t]  (intercept and hedge ratio)
    Transition: θ_t = θ_{t-1} + w_t,   w_t ~ N(0, Q)
    Observation: Y_t = [1, X_t] · θ_t + v_t,  v_t ~ N(0, R_t)

    Process noise Q = (δ / (1−δ)) · I²  with δ (default 1e-4).
    Observation noise R_t is estimated adaptively from the innovation.
    """

    def __init__(self, delta: float = 1e-4) -> None:
        self.delta = delta
        self.Q = (delta / (1.0 - delta)) * np.eye(2)
        self._theta: Optional[np.ndarray] = None   # [2,1] state
        self._P: Optional[np.ndarray] = None        # [2,2] covariance
        self._R: float = 0.0                        # observation noise var

    def update(self, y: float, x: float) -> Tuple[float, float, float, float]:
        """
        Process one (y, x) observation.
        Returns (alpha, beta, innovation_e, innovation_std).
        """
        H = np.array([[1.0, x]])   # [1,2]

        if self._theta is None:
            self._theta = np.zeros((2, 1))
            self._P = np.eye(2) * 1e6
            self._R = 1.0

        # ── Predict ──
        theta_pred = self._theta
        P_pred = self._P + self.Q

        # ── Innovation ──
        y_hat = float((H @ theta_pred)[0, 0])
        e = y - y_hat
        S = float((H @ P_pred @ H.T)[0, 0]) + self._R

        # ── Kalman gain ──
        K = (P_pred @ H.T) / S          # [2,1]

        # ── Update ──
        self._theta = theta_pred + K * e
        self._P = (np.eye(2) - K @ H) @ P_pred

        # ── Adaptive observation noise ──
        self._R = max(0.9 * self._R + 0.1 * (e ** 2 - float((H @ P_pred @ H.T)[0, 0])), 1e-6)

        alpha = float(self._theta[0, 0])
        beta = float(self._theta[1, 0])
        return alpha, beta, e, float(np.sqrt(S))

    def batch_update(
        self, y_series: pd.Series, x_series: pd.Series
    ) -> Tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
        """
        Vectorised batch update over aligned Y, X series.
        Returns (alpha_series, beta_series, spread_series, spread_std_series).
        """
        alphas, betas, spreads, stds = [], [], [], []
        for y_val, x_val in zip(y_series.values, x_series.values):
            a, b, e, s = self.update(float(y_val), float(x_val))
            alphas.append(a)
            betas.append(b)
            spreads.append(e)
            stds.append(s)

        idx = y_series.index
        return (
            pd.Series(alphas, index=idx, name="alpha"),
            pd.Series(betas, index=idx, name="beta"),
            pd.Series(spreads, index=idx, name="spread"),
            pd.Series(stds, index=idx, name="spread_std"),
        )

    @property
    def alpha(self) -> float:
        return float(self._theta[0, 0]) if self._theta is not None else 0.0

    @property
    def beta(self) -> float:
        return float(self._theta[1, 0]) if self._theta is not None else 1.0


# ── Full cointegration analysis ───────────────────────────────────────────────

def analyse_pair(
    df: pd.DataFrame,
    pair_name: str,
    y_col: str,
    x_col: str,
) -> CointegrationResult:
    """
    Run the complete formation-period analysis for a two-leg pair.
    For multi-leg pairs (crush, crack) this should be called on the
    pre-constructed spread series vs. zero.
    """
    y = df[y_col].dropna()
    x = df[x_col].dropna()
    common = y.index.intersection(x.index)
    y, x = y.loc[common], x.loc[common]

    # Cointegration
    eg_pval, beta, _ = engle_granger(y, x)
    johansen_trace, johansen_cv = johansen_test(df[[y_col, x_col]].dropna())

    # Spread
    spread = y - beta * x
    hl = estimate_half_life(spread)
    hurst = hurst_exponent(spread)

    is_coint = (
        eg_pval < 0.05
        and johansen_trace > johansen_cv
        and 0 < hl < np.inf
    )

    logger.info(
        "%s | EG p=%.3f | Johansen: %.2f vs cv=%.2f | HL=%.1f days | H=%.3f | coint=%s",
        pair_name, eg_pval, johansen_trace, johansen_cv, hl, hurst, is_coint,
    )

    return CointegrationResult(
        pair_name=pair_name,
        eg_pvalue=eg_pval,
        johansen_trace_stat=johansen_trace,
        johansen_cv_5pct=johansen_cv,
        is_cointegrated=is_coint,
        hedge_ratio=beta,
        spread_mean=float(spread.mean()),
        spread_std=float(spread.std()),
        half_life_days=hl,
        hurst=hurst,
    )
