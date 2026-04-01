"""
Performance monitor and regime watchdog.

Responsibilities:
  • Track per-trade and portfolio P&L (realised + unrealised)
  • Rolling cointegration re-tests every N trading days
  • Rolling Hurst exponent — flag if H > 0.55 sustained
  • Sharpe ratio, max drawdown, profit factor, win rate
  • Emit structured logs and human-readable summary reports
  • Alert when any pair fails cointegration → triggers COINT_STOP
"""

from __future__ import annotations

import csv
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from config import PairConfig, StrategyConfig
from statistics import (
    CointegrationResult,
    engle_granger,
    estimate_half_life,
    hurst_exponent,
    johansen_test,
)
from strategy import Signal, SignalType

logger = logging.getLogger(__name__)

TRADE_LOG_PATH = os.path.join(os.path.dirname(__file__), "trade_log.csv")


# ── Trade record ──────────────────────────────────────────────────────────────

@dataclass
class TradeRecord:
    pair_name: str
    side: str
    entry_time: str
    exit_time: str
    entry_z: float
    exit_z: float
    pnl: float
    holding_days: float
    exit_reason: str


# ── Per-pair metrics ──────────────────────────────────────────────────────────

@dataclass
class PairMetrics:
    pair_name: str
    trades: List[TradeRecord] = field(default_factory=list)
    equity_curve: List[float] = field(default_factory=list)

    # Rolling spread stats
    spread_history: List[float] = field(default_factory=list)
    last_coint_pval: float = 0.0
    last_hurst: float = 0.5
    last_half_life: float = 0.0
    coint_ok: bool = True

    def record_trade(self, rec: TradeRecord) -> None:
        self.trades.append(rec)
        self.equity_curve.append(self.total_pnl())

    def total_pnl(self) -> float:
        return sum(t.pnl for t in self.trades)

    def win_rate(self) -> float:
        wins = [t for t in self.trades if t.pnl > 0]
        return len(wins) / max(1, len(self.trades))

    def profit_factor(self) -> float:
        gross_win = sum(t.pnl for t in self.trades if t.pnl > 0)
        gross_loss = abs(sum(t.pnl for t in self.trades if t.pnl < 0))
        return gross_win / max(gross_loss, 1e-9)

    def avg_holding(self) -> float:
        if not self.trades:
            return 0.0
        return float(np.mean([t.holding_days for t in self.trades]))

    def sharpe(self, risk_free: float = 0.05) -> float:
        if len(self.trades) < 3:
            return 0.0
        rets = [t.pnl for t in self.trades]
        daily_rf = risk_free / 252
        excess = np.array(rets) - daily_rf * np.array([t.holding_days for t in self.trades])
        std = np.std(excess, ddof=1)
        if std == 0:
            return 0.0
        return float(np.mean(excess) / std * np.sqrt(252 / max(1, self.avg_holding())))

    def max_drawdown(self) -> float:
        if not self.equity_curve:
            return 0.0
        cum = np.cumsum(self.equity_curve)
        peak = np.maximum.accumulate(cum)
        dd = (cum - peak) / np.maximum(peak, 1)
        return float(dd.min())


# ── Portfolio-level monitor ───────────────────────────────────────────────────

class PerformanceMonitor:

    def __init__(self, cfg: StrategyConfig) -> None:
        self.cfg = cfg
        self._pair_metrics: Dict[str, PairMetrics] = {}
        self._portfolio_pnl: List[float] = []     # daily P&L snapshots
        self._start_equity = cfg.account_equity
        self._peak_equity = cfg.account_equity
        self._bars_since_retest: Dict[str, int] = {}

        # Initialise trade log CSV
        if not os.path.exists(TRADE_LOG_PATH):
            with open(TRADE_LOG_PATH, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=[
                    "pair_name", "side", "entry_time", "exit_time",
                    "entry_z", "exit_z", "pnl", "holding_days", "exit_reason",
                ])
                writer.writeheader()

    def register_pair(self, pair_name: str) -> None:
        if pair_name not in self._pair_metrics:
            self._pair_metrics[pair_name] = PairMetrics(pair_name=pair_name)
            self._bars_since_retest[pair_name] = 0

    def record_trade(
        self,
        pair_name: str,
        side: str,
        entry_time: datetime,
        exit_time: datetime,
        entry_z: float,
        exit_z: float,
        pnl: float,
        exit_reason: str,
    ) -> None:
        m = self._pair_metrics.get(pair_name)
        if m is None:
            return
        holding = max(1.0, (exit_time - entry_time).total_seconds() / 86400)
        rec = TradeRecord(
            pair_name=pair_name,
            side=side,
            entry_time=entry_time.isoformat(),
            exit_time=exit_time.isoformat(),
            entry_z=entry_z,
            exit_z=exit_z,
            pnl=pnl,
            holding_days=holding,
            exit_reason=exit_reason,
        )
        m.record_trade(rec)
        self._log_trade_csv(rec)
        logger.info(
            "TRADE: %s %s P&L=%.2f holding=%.1fd exit=%s",
            pair_name, side, pnl, holding, exit_reason,
        )

    def update_spread(self, pair_name: str, spread: float, coint_pval: float, hurst: float) -> None:
        m = self._pair_metrics.get(pair_name)
        if m is None:
            return
        m.spread_history.append(spread)
        m.last_coint_pval = coint_pval
        m.last_hurst = hurst
        m.coint_ok = coint_pval < self.cfg.pairs[0].coint_exit_p if self.cfg.pairs else True

    def should_retest_cointegration(self, pair_name: str) -> bool:
        """Return True when it's time to re-run the cointegration tests."""
        n = self._bars_since_retest.get(pair_name, 0) + 1
        self._bars_since_retest[pair_name] = n
        if n >= self.cfg.coint_retest_days:
            self._bars_since_retest[pair_name] = 0
            return True
        return False

    # ── Rolling cointegration re-test ─────────────────────────────────────────

    def rolling_cointegration(
        self,
        df: pd.DataFrame,
        pair: PairConfig,
    ) -> Tuple[float, bool]:
        """
        Re-test cointegration on the last `formation_days` rows of df.
        Returns (eg_pvalue, is_cointegrated).
        """
        window = min(self.cfg.formation_days, len(df))
        recent = df.tail(window).dropna()

        if len(recent) < 60:
            return 1.0, False

        symbols = [leg.symbol for leg in pair.legs]
        if len(symbols) < 2:
            return 1.0, False

        y_col, x_col = symbols[0], symbols[1]
        if y_col not in recent.columns or x_col not in recent.columns:
            return 1.0, False

        try:
            eg_pval, _, _ = engle_granger(recent[y_col], recent[x_col])
            joh_trace, joh_cv = johansen_test(recent[[y_col, x_col]])
            is_coint = eg_pval < pair.coint_exit_p and joh_trace > joh_cv
        except Exception as exc:
            logger.warning("Rolling coint test failed for %s: %s", pair.name, exc)
            eg_pval, is_coint = 1.0, False

        m = self._pair_metrics.get(pair.name)
        if m:
            m.last_coint_pval = eg_pval
            m.coint_ok = is_coint

        logger.info(
            "Rolling coint retest %s: EG p=%.4f | ok=%s",
            pair.name, eg_pval, is_coint,
        )
        return eg_pval, is_coint

    # ── Portfolio snapshot ────────────────────────────────────────────────────

    def portfolio_snapshot(self, current_equity: float) -> Dict:
        self._portfolio_pnl.append(current_equity - self._start_equity)
        self._peak_equity = max(self._peak_equity, current_equity)
        drawdown = (current_equity - self._peak_equity) / self._peak_equity

        total_trades = sum(len(m.trades) for m in self._pair_metrics.values())
        total_pnl = sum(m.total_pnl() for m in self._pair_metrics.values())

        all_pnls = [t.pnl for m in self._pair_metrics.values() for t in m.trades]
        portfolio_sharpe = 0.0
        if len(all_pnls) >= 3:
            arr = np.array(all_pnls)
            portfolio_sharpe = float(np.mean(arr) / np.std(arr, ddof=1) * np.sqrt(252))

        per_pair = {}
        for name, m in self._pair_metrics.items():
            per_pair[name] = {
                "total_pnl": m.total_pnl(),
                "trades": len(m.trades),
                "win_rate": m.win_rate(),
                "profit_factor": m.profit_factor(),
                "sharpe": m.sharpe(),
                "max_drawdown": m.max_drawdown(),
                "avg_holding_days": m.avg_holding(),
                "coint_pval": m.last_coint_pval,
                "hurst": m.last_hurst,
                "coint_ok": m.coint_ok,
            }

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "current_equity": current_equity,
            "total_pnl": total_pnl,
            "total_trades": total_trades,
            "portfolio_drawdown_pct": drawdown * 100,
            "portfolio_sharpe": portfolio_sharpe,
            "per_pair": per_pair,
        }

    def print_summary(self, equity: float) -> None:
        snap = self.portfolio_snapshot(equity)
        sep = "─" * 70
        print(f"\n{sep}")
        print(f"  Portfolio Summary  {snap['timestamp']}")
        print(sep)
        print(f"  Equity:        ${snap['current_equity']:>12,.2f}")
        print(f"  Total P&L:     ${snap['total_pnl']:>12,.2f}")
        print(f"  Trades:        {snap['total_trades']:>5}")
        print(f"  Drawdown:      {snap['portfolio_drawdown_pct']:>7.2f}%")
        print(f"  Sharpe:        {snap['portfolio_sharpe']:>7.3f}")
        print(sep)
        for name, m in snap["per_pair"].items():
            print(f"  {name[:35]:<35} | P&L ${m['total_pnl']:>9,.2f} "
                  f"| WR {m['win_rate']:>5.1%} | HL {m['avg_holding_days']:>5.1f}d "
                  f"| coint {'OK' if m['coint_ok'] else 'FAIL'}")
        print(sep + "\n")

    def _log_trade_csv(self, rec: TradeRecord) -> None:
        with open(TRADE_LOG_PATH, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "pair_name", "side", "entry_time", "exit_time",
                "entry_z", "exit_z", "pnl", "holding_days", "exit_reason",
            ])
            writer.writerow(rec.__dict__)
