#!/usr/bin/env python3
"""
Standalone latency evaluation script for the tutor voice pipeline.
Mocks STT/LLM/TTS and records simulated latencies; prints min/max/p50/p95 and saves to eval_results.json.
Run from repo root: python agent/tests/eval_latency.py
Or from agent: python tests/eval_latency.py
"""

import json
import random
import statistics
from pathlib import Path

# Sample student utterances: short answers, wrong answers, questions, silence
SAMPLE_UTTERANCES = [
    "Yes",
    "No",
    "I think it's 3 over 4",
    "The numerator is the top number",
    "I don't know",
    "Can you repeat the question?",
    "Is it when the cell splits?",
    "Chlorophyll?",
    "",  # silence / no input
    "Maybe the denominator stays the same when you add",
]


def percentile(sorted_data: list[float], p: float) -> float:
    """Compute percentile (0..100) using linear interpolation. Uses stdlib only."""
    if not sorted_data:
        return 0.0
    n = len(sorted_data)
    k = (n - 1) * (p / 100)
    f = int(k)
    c = f + 1 if f + 1 < n else f
    return sorted_data[f] + (k - f) * (sorted_data[c] - sorted_data[f])


def simulate_turn() -> dict[str, float]:
    """Simulate one turn: return dict with stt_ms, llm_ms, tts_ms, e2e_ms (simulated)."""
    # Simulate latencies (ms) with some variance
    stt_ms = max(0, random.gauss(120, 40))
    llm_ms = max(0, random.gauss(350, 100))
    tts_ms = max(0, random.gauss(180, 50))
    e2e_ms = stt_ms + llm_ms + tts_ms + random.gauss(0, 20)
    return {
        "stt_ms": round(stt_ms, 1),
        "llm_ms": round(llm_ms, 1),
        "tts_ms": round(tts_ms, 1),
        "e2e_ms": round(max(0, e2e_ms), 1),
    }


def main() -> None:
    results: list[dict] = []
    print("Simulating pipeline for", len(SAMPLE_UTTERANCES), "turns (mocked STT/LLM/TTS)...")
    for i, utterance in enumerate(SAMPLE_UTTERANCES):
        turn = simulate_turn()
        turn["utterance"] = utterance if utterance else "(silence)"
        turn["turn"] = i + 1
        results.append(turn)
        print(
            f"  Turn {i+1}: STT={turn['stt_ms']:.0f}ms LLM={turn['llm_ms']:.0f}ms "
            f"TTS={turn['tts_ms']:.0f}ms E2E={turn['e2e_ms']:.0f}ms  | {turn['utterance'][:40]!r}"
        )

    # Aggregate by stage (exclude silence turn for stats if desired; here we include all)
    stages = ("stt_ms", "llm_ms", "tts_ms", "e2e_ms")
    summary: dict[str, dict[str, float]] = {}
    for stage in stages:
        vals = [r[stage] for r in results]
        vals_sorted = sorted(vals)
        summary[stage] = {
            "min": min(vals),
            "max": max(vals),
            "p50": percentile(vals_sorted, 50),
            "p95": percentile(vals_sorted, 95),
            "mean": statistics.mean(vals),
        }

    # Print summary table (stdlib only)
    print("\n" + "=" * 60)
    print("LATENCY SUMMARY (simulated, ms)")
    print("=" * 60)
    header = f"{'Stage':<10} {'Min':>10} {'Max':>10} {'P50':>10} {'P95':>10} {'Mean':>10}"
    print(header)
    print("-" * 60)
    for stage in stages:
        s = summary[stage]
        print(
            f"{stage:<10} {s['min']:>10.1f} {s['max']:>10.1f} "
            f"{s['p50']:>10.1f} {s['p95']:>10.1f} {s['mean']:>10.1f}"
        )
    print("=" * 60)

    # Save results
    out_path = Path(__file__).resolve().parent / "eval_results.json"
    payload = {"turns": results, "summary": summary}
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
