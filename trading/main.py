"""
Main async orchestrator for the futures pairs mean-reversion strategy.

Execution flow
──────────────
1.  Connect to IB Gateway (port 4001 live / 4002 paper)
2.  Load 252-day formation history for all enabled pairs
3.  Run cointegration tests (Engle-Granger + Johansen); disable pairs that fail
4.  Estimate OU parameters + optimal entry/exit thresholds per passing pair
5.  Warm-up Kalman / rolling-OLS estimators on formation data
6.  Enter the live trading loop:
      a. Fetch latest daily close (or intraday bar if bar_interval < 86400)
      b. Update each PairStrategy → emit Signal
      c. Apply AI veto for entry signals (every ai_analysis_interval_hours)
      d. Size trades via PositionSizer
      e. Margin check → Execute via TradeExecutor
      f. Every coint_retest_days bars: re-test cointegration, update strategies
      g. Every ai_analysis_interval_hours: full AI regime analysis
      h. Print performance summary every day

Usage
─────
    python main.py [--paper] [--pairs crush,crack] [--equity 100000]

Environment variables
─────────────────────
    ANTHROPIC_API_KEY  — required for AI advisor
    IB_HOST            — default 127.0.0.1
    IB_PORT            — default 4002 (paper)
    IB_CLIENT_ID       — default 1
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import pandas as pd
from dotenv import load_dotenv
from rich.logging import RichHandler

from ai_advisor import AIAdvisor
from config import (
    DEFAULT_CONFIG,
    SOYBEAN_CRUSH,
    CRACK_SPREAD_321,
    WTI_BRENT,
    TREASURY_NOB,
    GOLD_SILVER,
    PairConfig,
    StrategyConfig,
)
from execution import TradeExecutor
from ib_client import IBClient
from monitor import PerformanceMonitor
from risk import PositionSizer, inverse_vol_weights, margin_sufficient
from statistics import (
    adf_test,
    analyse_pair,
    estimate_ou_params,
    optimal_ou_thresholds,
)
from strategy import (
    PairStrategy,
    PositionSide,
    Signal,
    SignalType,
    build_crush_spread,
    build_crack_spread_321,
)

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    handlers=[RichHandler(rich_tracebacks=True)],
)
logger = logging.getLogger("pairs_trader")

# ── Pair aliases for CLI ──────────────────────────────────────────────────────
PAIR_MAP = {
    "crush": SOYBEAN_CRUSH,
    "crack": CRACK_SPREAD_321,
    "brent": WTI_BRENT,
    "nob": TREASURY_NOB,
    "gold": GOLD_SILVER,
}

# Bar interval for live loop (seconds).  86400 = daily close strategy.
BAR_INTERVAL = int(os.environ.get("BAR_INTERVAL", "86400"))


# ── Pre-processing helpers ────────────────────────────────────────────────────

def _build_synthetic_spread(pair: PairConfig, df: pd.DataFrame) -> Optional[pd.Series]:
    """For multi-leg pairs return the constructed spread; else None."""
    from config import PairType
    if pair.pair_type == PairType.CRUSH_SPREAD:
        if all(s in df.columns for s in ["ZS", "ZM", "ZL"]):
            return build_crush_spread(df)
    elif pair.pair_type == PairType.CRACK_SPREAD:
        if all(s in df.columns for s in ["CL", "RB", "HO"]):
            return build_crack_spread_321(df)
    return None


# ── Formation period ──────────────────────────────────────────────────────────

async def formation_period(
    ib: IBClient,
    cfg: StrategyConfig,
    pairs: List[PairConfig],
) -> Tuple[Dict[str, pd.DataFrame], Dict[str, PairStrategy]]:
    """
    Load history, run statistical tests, and build PairStrategy instances
    for all pairs that pass cointegration.
    """
    history: Dict[str, pd.DataFrame] = {}
    strategies: Dict[str, PairStrategy] = {}

    for pair in pairs:
        if not pair.enabled:
            continue

        logger.info("Formation period: loading data for %s …", pair.name)
        df = await ib.get_pair_history(pair, n_days=cfg.formation_days + 20)
        if df.empty or len(df) < 60:
            logger.warning("Insufficient data for %s; skipping", pair.name)
            continue

        history[pair.name] = df
        symbols = [l.symbol for l in pair.legs]

        # ADF tests — both legs must be I(1)
        adf_results = [adf_test(df[s]) for s in symbols if s in df.columns]
        any_stationary = any(not r.is_nonstationary for r in adf_results)
        if any_stationary:
            logger.warning(
                "%s: one or more legs appear stationary (I(0)); skipping", pair.name
            )
            continue

        # Cointegration
        y_col, x_col = symbols[0], symbols[1]
        coint_result = analyse_pair(df, pair.name, y_col, x_col)
        if not coint_result.is_cointegrated:
            logger.warning("%s failed cointegration test; skipping", pair.name)
            continue

        # Half-life validation
        hl = coint_result.half_life_days
        if hl < pair.min_half_life or hl > pair.max_half_life:
            logger.warning(
                "%s: half-life=%.1f outside [%d, %d]; skipping",
                pair.name, hl, pair.min_half_life, pair.max_half_life,
            )
            continue

        # OU parameters + optimal thresholds
        spread_series = df[y_col] - coint_result.hedge_ratio * df[x_col]
        ou = estimate_ou_params(spread_series)
        thresholds = optimal_ou_thresholds(ou)

        # Build strategy instance + warm up
        strat = PairStrategy(pair, coint_result, ou, thresholds)
        strat.warm_up(df)
        strategies[pair.name] = strat

        logger.info(
            "  ✓ %s | HL=%.1f days | z_entry=%.2f | z_exit=%.2f | OU θ=%.4f",
            pair.name, hl, strat.z_entry, strat.z_exit, ou.theta,
        )

    logger.info("Formation complete: %d/%d pairs active", len(strategies), len(pairs))
    return history, strategies


# ── Live price snapshot ───────────────────────────────────────────────────────

async def get_latest_prices(
    ib: IBClient,
    pair: PairConfig,
    n_bars: int = 2,
) -> Optional[Dict[str, float]]:
    """
    Fetch the most recent daily close for each leg via CONTFUT.
    Returns {symbol: close} or None on failure.
    """
    prices: Dict[str, float] = {}
    for leg in pair.legs:
        series = await ib.get_daily_bars(leg, n_days=n_bars)
        if series.empty:
            return None
        prices[leg.symbol] = float(series.iloc[-1])
    return prices


# ── Main trading loop ─────────────────────────────────────────────────────────

async def trading_loop(
    ib: IBClient,
    cfg: StrategyConfig,
    strategies: Dict[str, PairStrategy],
    history: Dict[str, pd.DataFrame],
    monitor: PerformanceMonitor,
    executor: TradeExecutor,
    sizer: PositionSizer,
    advisor: AIAdvisor,
) -> None:
    """
    Core async loop — runs until interrupted.
    Each iteration:
      1. Fetch latest prices per pair
      2. Update strategy → signal
      3. Cointegration re-test (on schedule)
      4. AI regime check (on schedule)
      5. Execute signals
      6. Daily summary print
    """
    ai_last_run = 0.0
    ai_interval = cfg.ai_analysis_interval_hours * 3600
    day_last_summary = 0
    last_bar_time: Dict[str, float] = {}

    # Track entry timestamps for P&L recording
    entry_times: Dict[str, datetime] = {}
    entry_zs: Dict[str, float] = {}

    # Register all active pairs with monitor
    for name in strategies:
        monitor.register_pair(name)

    logger.info("Trading loop started. BAR_INTERVAL=%ds", BAR_INTERVAL)

    while True:
        now = time.time()
        ts = pd.Timestamp.utcnow()

        # Compute inverse-vol weights across active strategies
        spread_vols = {}
        for name, strat in strategies.items():
            hist = strat._state.spread_history
            if len(hist) >= 10:
                spread_vols[name] = float(pd.Series(list(hist)[-60:]).std(ddof=1))
            else:
                spread_vols[name] = 1.0
        weights = inverse_vol_weights(spread_vols) if cfg.use_inv_vol_weighting else {
            n: 1.0 / max(len(strategies), 1) for n in strategies
        }

        # Current equity + liquidity
        try:
            equity = await ib.get_net_liquidation()
            liquidity = await ib.get_excess_liquidity()
        except Exception:
            equity = cfg.account_equity
            liquidity = equity * 0.5

        # Per-pair loop
        pending_entry_signals: List[Signal] = []

        for pair_name, strat in list(strategies.items()):
            pair = strat.pair

            # Rate-limit per-pair bar fetching to BAR_INTERVAL
            last = last_bar_time.get(pair_name, 0.0)
            if now - last < BAR_INTERVAL - 30:
                continue

            prices = await get_latest_prices(ib, pair, n_bars=2)
            if prices is None:
                logger.warning("Could not fetch prices for %s", pair_name)
                continue

            last_bar_time[pair_name] = now

            # Update history buffer (append latest row)
            symbols = [l.symbol for l in pair.legs]
            new_row = pd.DataFrame([prices], index=[ts])
            history[pair_name] = pd.concat([history[pair_name], new_row]).tail(
                cfg.formation_days + 20
            )

            # Cointegration re-test on schedule
            coint_pval: Optional[float] = None
            if monitor.should_retest_cointegration(pair_name):
                coint_pval, is_coint = monitor.rolling_cointegration(
                    history[pair_name], pair
                )
                strat.update_cointegration(coint_pval)
                if not is_coint:
                    logger.warning(
                        "%s: rolling coint FAILED (p=%.4f); position will be closed",
                        pair_name, coint_pval,
                    )

            # Build spread price for multi-leg synthetic spread
            if len(symbols) > 2 or strat.pair.pair_type.value in ("crush_spread", "crack_spread"):
                synth = _build_synthetic_spread(pair, history[pair_name])
                if synth is not None:
                    prices["__spread__"] = float(synth.iloc[-1])

            # Update strategy
            signal: Signal = strat.update(prices, ts, coint_pval)

            # Track Hurst for monitor
            hurst = strat._state.z_score_history[-1] if strat._state.z_score_history else 0.0
            monitor.update_spread(
                pair_name,
                strat.current_spread,
                strat._state.last_coint_pval,
                strat._rolling_hurst() if strat._warm else 0.5,
            )

            # ── Exit signals ──────────────────────────────────────────────────
            if signal.signal in (
                SignalType.EXIT,
                SignalType.STOP_LOSS,
                SignalType.TIME_STOP,
                SignalType.COINT_STOP,
            ):
                if executor.has_position(pair_name):
                    urgent = signal.signal in (SignalType.STOP_LOSS, SignalType.COINT_STOP)
                    result = await executor.exit(pair_name, reason=signal.signal.value, urgent=urgent)
                    if result.success:
                        entry_t = entry_times.pop(pair_name, datetime.utcnow() - timedelta(days=1))
                        entry_z = entry_zs.pop(pair_name, 0.0)
                        pnl_estimate = 0.0   # real P&L would come from IB fill prices
                        monitor.record_trade(
                            pair_name=pair_name,
                            side=strat._state.position_side.value if strat.position_side else "unknown",
                            entry_time=entry_t,
                            exit_time=datetime.utcnow(),
                            entry_z=entry_z,
                            exit_z=signal.z_score,
                            pnl=pnl_estimate,
                            exit_reason=signal.signal.value,
                        )

            # ── Entry signals ─────────────────────────────────────────────────
            elif signal.signal in (SignalType.ENTER_LONG, SignalType.ENTER_SHORT):
                if not executor.has_position(pair_name):
                    if executor.num_open() < cfg.max_active_pairs:
                        pending_entry_signals.append(signal)

        # ── AI regime check ───────────────────────────────────────────────────
        ai_verdicts: Dict[str, Dict] = {}
        if now - ai_last_run >= ai_interval and pending_entry_signals:
            snapshot = monitor.portfolio_snapshot(equity)
            snapshot["n_open_positions"] = executor.num_open()
            pending_dicts = [
                {
                    "pair_name": s.pair_name,
                    "signal": s.signal.value,
                    "z_score": s.z_score,
                    "half_life": s.half_life,
                    "hurst": s.hurst,
                }
                for s in pending_entry_signals
            ]
            verdict = await advisor.analyse(snapshot, pending_dicts)
            if verdict:
                ai_verdicts = verdict.entry_verdicts
                for alert in verdict.alerts:
                    logger.warning("AI ALERT: %s", alert)
                if verdict.regime == "TRENDING":
                    logger.warning(
                        "AI: regime=TRENDING (confidence=%.2f) — entry signals muted",
                        verdict.confidence,
                    )
            ai_last_run = now

        # ── Execute entry signals ─────────────────────────────────────────────
        for signal in pending_entry_signals:
            pair_name = signal.pair_name

            # AI veto check
            ai_v = ai_verdicts.get(pair_name, {})
            if ai_v.get("allow") is False:
                logger.info("AI vetoed entry for %s: %s", pair_name, ai_v.get("reason"))
                continue

            strat = strategies[pair_name]
            pair = strat.pair
            prices_entry = await get_latest_prices(ib, pair, n_bars=1)
            if prices_entry is None:
                continue

            trade_order = sizer.size_trade(
                signal=signal,
                pair=pair,
                prices=prices_entry,
                equity=equity,
                spread_volatility=spread_vols.get(pair_name, 1.0),
                inv_vol_weight=weights.get(pair_name, 1.0),
            )
            if trade_order is None:
                continue

            if not margin_sufficient(trade_order.estimated_margin, liquidity):
                continue

            spread_px = prices_entry.get("__spread__", list(prices_entry.values())[0])
            result = await executor.enter(trade_order, prices_entry, spread_px, liquidity)
            if result.success:
                entry_times[pair_name] = datetime.utcnow()
                entry_zs[pair_name] = signal.z_score
                logger.info(
                    "ENTRY %s %s | z=%.2f | HL=%.1fd",
                    pair_name, signal.signal.value, signal.z_score, signal.half_life,
                )

        # ── Daily summary ─────────────────────────────────────────────────────
        day_of_year = datetime.utcnow().timetuple().tm_yday
        if day_of_year != day_last_summary:
            monitor.print_summary(equity)
            day_last_summary = day_of_year

            # Periodic AI performance review
            snap = monitor.portfolio_snapshot(equity)
            review = await advisor.performance_review(snap)
            if review:
                logger.info("AI Performance Review:\n%s", review)

        # Sleep until next bar
        await ib.sleep(min(60, BAR_INTERVAL))


# ── Entry point ───────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Futures Pairs Mean-Reversion Trader")
    p.add_argument("--paper", action="store_true", default=True,
                   help="Use paper trading port (default)")
    p.add_argument("--live", action="store_true", default=False,
                   help="Connect to live trading port 4001")
    p.add_argument("--pairs", type=str, default="",
                   help="Comma-separated subset: crush,crack,brent,nob,gold")
    p.add_argument("--equity", type=float, default=100_000.0,
                   help="Starting equity for sizing")
    p.add_argument("--host", type=str, default=os.environ.get("IB_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.environ.get("IB_PORT", "4002")))
    p.add_argument("--client-id", type=int, default=int(os.environ.get("IB_CLIENT_ID", "1")))
    return p.parse_args()


async def main() -> None:
    args = parse_args()

    # Build config
    cfg = StrategyConfig(
        ib_host=args.host,
        ib_port=4001 if args.live else args.port,
        ib_client_id=args.client_id,
        account_equity=args.equity,
        pairs=DEFAULT_CONFIG.pairs,
    )

    # Filter pairs if specified
    enabled: List[PairConfig] = []
    if args.pairs:
        keys = [k.strip().lower() for k in args.pairs.split(",")]
        for k in keys:
            if k in PAIR_MAP:
                enabled.append(PAIR_MAP[k])
            else:
                logger.warning("Unknown pair key '%s'; valid: %s", k, list(PAIR_MAP))
    else:
        enabled = DEFAULT_CONFIG.pairs

    # Instantiate components
    ib = IBClient(cfg)
    monitor = PerformanceMonitor(cfg)
    advisor = AIAdvisor(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    # Graceful shutdown
    loop = asyncio.get_event_loop()
    executor_ref: Optional[TradeExecutor] = None

    def _shutdown(sig_name: str) -> None:
        logger.info("Signal %s received — shutting down", sig_name)
        if executor_ref:
            asyncio.ensure_future(executor_ref.exit_all("shutdown"))
        loop.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: _shutdown(s.name))

    try:
        await ib.connect()

        history, strategies = await formation_period(ib, cfg, enabled)
        if not strategies:
            logger.error("No pairs passed formation tests — exiting")
            await ib.disconnect()
            return

        sizer = PositionSizer(cfg)
        executor = TradeExecutor(ib, cfg)
        executor_ref = executor

        await trading_loop(
            ib=ib,
            cfg=cfg,
            strategies=strategies,
            history=history,
            monitor=monitor,
            executor=executor,
            sizer=sizer,
            advisor=advisor,
        )

    except KeyboardInterrupt:
        logger.info("Keyboard interrupt — flattening positions …")
        if executor_ref:
            await executor_ref.exit_all("keyboard_interrupt")
    except Exception as exc:
        logger.exception("Fatal error: %s", exc)
        if executor_ref:
            await executor_ref.exit_all("fatal_error")
    finally:
        await ib.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
