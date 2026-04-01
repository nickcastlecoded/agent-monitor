"""
Claude Opus 4.6 AI Advisor — regime analysis, risk validation, performance review.

Uses:
  • claude-opus-4-6 with adaptive thinking (thinking: {type: "adaptive"})
  • Streaming for long analysis prompts
  • Structured JSON output for machine-readable risk verdicts

The advisor is called periodically (default every 6 hours) and:
  1. Analyses current spread z-scores, cointegration stats, and portfolio state
  2. Returns a regime verdict (TRENDING | MEAN_REVERTING | UNCERTAIN)
  3. Flags specific risk factors (correlation breakdown, volatility spike, etc.)
  4. Can veto pending entries (returns allow=False) for regime-hostile conditions
  5. Generates a human-readable narrative report
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional

import anthropic

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """
You are an expert quantitative futures trader and risk manager specialising in
mean-reversion pairs trading.  You have deep knowledge of:
- Soybean crush spreads (ZS/ZM/ZL physical processing margins)
- Petroleum crack spreads (CL/RB/HO 3:2:1 refinery margins)
- WTI-Brent crude oil logistics spreads
- Treasury yield-curve spreads (NOB 10s/30s)
- Gold-silver ratio (monetary metals)
- Ornstein-Uhlenbeck processes, Kalman filtering, cointegration

When presented with strategy metrics, you provide:
1. A concise regime assessment (MEAN_REVERTING | TRENDING | UNCERTAIN)
2. Specific risk factors that merit immediate attention
3. Whether pending trade entries should be ALLOWED or BLOCKED
4. A brief narrative explaining your reasoning

Be direct and actionable.  Avoid generic disclaimers.
Output all structured data as valid JSON inside a <json> block.
""".strip()

_ANALYSIS_TEMPLATE = """
Current UTC time: {timestamp}

## Portfolio State
- Account equity: ${equity:,.0f}
- Open positions: {n_open}
- Portfolio drawdown: {drawdown:.2f}%
- Active pairs: {active_pairs}

## Per-Pair Statistics
{pair_stats}

## Pending Signals
{pending_signals}

## Recent Trade Performance
- Total trades: {total_trades}
- Overall win rate: {win_rate:.1%}
- Portfolio Sharpe: {sharpe:.3f}

---
Analyse the above, then output:

<json>
{{
  "regime": "MEAN_REVERTING|TRENDING|UNCERTAIN",
  "confidence": 0.0-1.0,
  "risk_factors": ["factor1", "factor2"],
  "entry_verdicts": {{
    "<pair_name>": {{"allow": true|false, "reason": "..."}}
  }},
  "alerts": ["alert1"],
  "narrative": "2-3 sentence summary"
}}
</json>
"""


@dataclass
class RegimeVerdict:
    regime: str              # MEAN_REVERTING | TRENDING | UNCERTAIN
    confidence: float
    risk_factors: List[str]
    entry_verdicts: Dict[str, Dict]   # {pair_name: {"allow": bool, "reason": str}}
    alerts: List[str]
    narrative: str
    raw_response: str


class AIAdvisor:
    """
    Wraps the Anthropic Python SDK for periodic regime analysis.
    Keeps a frozen system prompt and a rolling conversation window
    (last N analyses) to enable context-aware assessments.
    """

    MAX_HISTORY_TURNS = 4    # keep last 4 analysis turns in context

    def __init__(self, api_key: Optional[str] = None) -> None:
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            logger.warning("ANTHROPIC_API_KEY not set — AI advisor will be disabled")
        self._client = anthropic.Anthropic(api_key=key) if key else None
        self._history: List[Dict] = []   # {"role": ..., "content": ...}

    # ── Main analysis entry point ─────────────────────────────────────────────

    async def analyse(
        self,
        portfolio_snapshot: Dict,
        pending_signals: List[Dict],
    ) -> Optional[RegimeVerdict]:
        """
        Run a full regime analysis.  Returns None if client not configured.
        Streams the response; parses the embedded <json> block for structured data.
        """
        if self._client is None:
            return None

        prompt = self._build_prompt(portfolio_snapshot, pending_signals)
        self._history.append({"role": "user", "content": prompt})

        # Trim history to MAX_HISTORY_TURNS pairs (user + assistant)
        if len(self._history) > self.MAX_HISTORY_TURNS * 2:
            self._history = self._history[-(self.MAX_HISTORY_TURNS * 2):]

        full_text = ""
        thinking_text = ""

        try:
            with self._client.messages.stream(
                model="claude-opus-4-6",
                max_tokens=4096,
                thinking={"type": "adaptive"},
                system=_SYSTEM_PROMPT,
                messages=self._history,
            ) as stream:
                for event in stream:
                    if event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            full_text += event.delta.text
                        elif event.delta.type == "thinking_delta":
                            thinking_text += event.delta.thinking

            # Append assistant response to history
            self._history.append({"role": "assistant", "content": full_text})

            verdict = self._parse_verdict(full_text)
            logger.info(
                "AI regime verdict: %s (confidence=%.2f) | alerts=%s",
                verdict.regime, verdict.confidence, verdict.alerts,
            )
            return verdict

        except anthropic.APIError as exc:
            logger.error("AI analysis failed: %s", exc)
            return None

    # ── Single-pair risk veto ─────────────────────────────────────────────────

    async def veto_entry(
        self,
        pair_name: str,
        z_score: float,
        half_life: float,
        hurst: float,
        coint_pval: float,
        spread_vol: float,
    ) -> Dict:
        """
        Quick (non-streaming) veto check for a specific pending entry.
        Returns {"allow": bool, "reason": str}.
        Faster than a full analysis; suitable for real-time gating.
        """
        if self._client is None:
            return {"allow": True, "reason": "AI not configured"}

        prompt = (
            f"Pair: {pair_name}\n"
            f"Z-score: {z_score:.3f}\n"
            f"Half-life: {half_life:.1f} days\n"
            f"Hurst exponent: {hurst:.3f} (< 0.5 = mean-reverting)\n"
            f"Cointegration EG p-value: {coint_pval:.4f}\n"
            f"Spread volatility: {spread_vol:.4f}\n\n"
            "Should this entry be ALLOWED or BLOCKED?\n"
            "Respond ONLY with JSON: {\"allow\": true|false, \"reason\": \"...\"}."
        )

        try:
            response = self._client.messages.create(
                model="claude-opus-4-6",
                max_tokens=256,
                system=(
                    "You are a risk manager for a futures pairs trading desk. "
                    "Respond only with a JSON object {allow: bool, reason: string}."
                ),
                messages=[{"role": "user", "content": prompt}],
            )
            text = ""
            for block in response.content:
                if block.type == "text":
                    text += block.text
            return json.loads(text.strip())
        except Exception as exc:
            logger.warning("Veto check failed for %s: %s; allowing", pair_name, exc)
            return {"allow": True, "reason": f"veto error: {exc}"}

    # ── Performance review ────────────────────────────────────────────────────

    async def performance_review(self, snapshot: Dict) -> str:
        """
        Generate a prose performance review for operator review.
        Uses streaming; returns the full text.
        """
        if self._client is None:
            return "AI advisor not configured."

        prompt = (
            "Provide a 3-paragraph performance review of this futures pairs "
            "trading portfolio, covering: (1) what is working, (2) what is not "
            "working, (3) concrete recommendations for the next period.\n\n"
            f"Portfolio data:\n{json.dumps(snapshot, indent=2, default=str)}"
        )

        text = ""
        try:
            with self._client.messages.stream(
                model="claude-opus-4-6",
                max_tokens=1024,
                thinking={"type": "adaptive"},
                system=_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                for event in stream:
                    if (
                        event.type == "content_block_delta"
                        and event.delta.type == "text_delta"
                    ):
                        text += event.delta.text
        except Exception as exc:
            return f"Performance review failed: {exc}"

        return text

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _build_prompt(self, snapshot: Dict, pending_signals: List[Dict]) -> str:
        per_pair = snapshot.get("per_pair", {})
        pair_lines = []
        for name, m in per_pair.items():
            pair_lines.append(
                f"  {name}:\n"
                f"    P&L=${m.get('total_pnl', 0):,.0f} | "
                f"WR={m.get('win_rate', 0):.1%} | "
                f"Sharpe={m.get('sharpe', 0):.2f} | "
                f"HL={m.get('avg_holding_days', 0):.1f}d | "
                f"coint_p={m.get('coint_pval', 1):.4f} | "
                f"H={m.get('hurst', 0.5):.3f} | "
                f"coint={'OK' if m.get('coint_ok') else 'FAIL'}"
            )

        sig_lines = []
        for sig in pending_signals:
            sig_lines.append(
                f"  {sig.get('pair_name')}: {sig.get('signal')} "
                f"z={sig.get('z_score', 0):.2f} HL={sig.get('half_life', 0):.1f}d"
            )

        total_trades = snapshot.get("total_trades", 0)
        win_rates = [m.get("win_rate", 0) for m in per_pair.values()]
        overall_wr = sum(win_rates) / max(len(win_rates), 1)

        return _ANALYSIS_TEMPLATE.format(
            timestamp=datetime.utcnow().isoformat(),
            equity=snapshot.get("current_equity", 0),
            n_open=snapshot.get("n_open_positions", 0),
            drawdown=snapshot.get("portfolio_drawdown_pct", 0),
            active_pairs=", ".join(per_pair.keys()) or "none",
            pair_stats="\n".join(pair_lines) or "  (none)",
            pending_signals="\n".join(sig_lines) or "  (none)",
            total_trades=total_trades,
            win_rate=overall_wr,
            sharpe=snapshot.get("portfolio_sharpe", 0),
        )

    @staticmethod
    def _parse_verdict(text: str) -> RegimeVerdict:
        """Extract the <json>...</json> block from the response."""
        import re
        match = re.search(r"<json>(.*?)</json>", text, re.DOTALL | re.IGNORECASE)
        if match:
            try:
                data = json.loads(match.group(1).strip())
                return RegimeVerdict(
                    regime=data.get("regime", "UNCERTAIN"),
                    confidence=float(data.get("confidence", 0.5)),
                    risk_factors=data.get("risk_factors", []),
                    entry_verdicts=data.get("entry_verdicts", {}),
                    alerts=data.get("alerts", []),
                    narrative=data.get("narrative", ""),
                    raw_response=text,
                )
            except json.JSONDecodeError:
                pass

        # Fallback: conservative defaults
        return RegimeVerdict(
            regime="UNCERTAIN",
            confidence=0.3,
            risk_factors=["could not parse AI response"],
            entry_verdicts={},
            alerts=["AI response parse error"],
            narrative=text[:300] if text else "No response",
            raw_response=text,
        )
