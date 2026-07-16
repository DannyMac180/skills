# Review Mode & the Evidence Loop

Two systems share one data source (quiz results) but have different jobs:
**retention** (spaced-repetition review of cards) and **adaptation** (evidence-
gated updates to LEARNER.md). Keep them distinct.

## Data files (in `~/.explain-this/memory/`)

**cards.jsonl** — one self-contained card per line:

```json
{"id": "card_aiayn_03",
 "artifact": {"title": "Attention Is All You Need", "source": "https://arxiv.org/abs/1706.03762", "explained": "2026-07-15"},
 "question": "Why does multi-head attention use multiple smaller heads instead of one full-width head?",
 "answer": "Each head learns a different relationship type in a different subspace; one full-width head would average them into mush.",
 "type": "transfer",
 "tags": ["mechanism"],
 "state": {"interval_days": 4, "ease": 2.5, "due": "2026-07-19", "reps": 2, "lapses": 0},
 "history": [{"ts": "2026-07-15T09:12:00Z", "result": "hit", "mode": "inline"}],
 "status": "active"}
```

**signals.jsonl** — one append-only line per quiz attempt:

```json
{"ts": "2026-07-15T09:12:00Z", "artifact": "attention-is-all-you-need", "card": "card_aiayn_03", "tags": ["mechanism"], "result": "hit", "mode": "inline", "excluded": false}
```

Signals are dumb at write time — no interpretation. Scheduling is straight
SM-2 (see `scripts/sm2.ts`): hit (q=5) → interval × ease; partial (q=3) →
advances but drops ease; miss (q=2) → interval resets, ease drops, lapse
recorded. Cards retire when the interval exceeds ~120 days (known — stop
asking); `suspended` when the user says "don't quiz me on this." Cap ~5 cards
per artifact so the deck grows linearly with reading.

## Review session flow

```
explain-this review
  → scripts/sm2.ts due            (due cards, most overdue first, cap 8)
  → per card:
      ask the question → user answers in FREE TEXT
      → grade it yourself: hit / partial / miss, one line of feedback
      → on miss: RE-EXPLAIN DIFFERENTLY — a new route in, shaped by
        LEARNER.md, never the same words again
      → scripts/sm2.ts grade <id> <result>   (updates SM-2 + logs the signal)
  → session close: score summary ("6/8 — two derivation misses")
  → run the threshold scan (below); if a pattern crossed, show the drafted
    profile entry WITH its evidence and add it to LEARNER.md
```

Grading is always agent-side against the stored answer/rubric. Never
self-graded — self-grading is generous and corrupts the evidence.

## The evidence loop (adaptation)

The path from "missed a question" to "the profile says something about you"
must pass through accumulated evidence:

1. **Threshold scan** after each session: `scripts/scan-signals.ts scan`
   (defaults: ≥4 misses on the same tag, across ≥2 distinct artifacts, within
   a 60-day window). The cross-artifact requirement separates "struggles with
   derivations" (profile-worthy) from "that one paper was brutal" (not).
2. **Evidence cited inline.** Every Known Weak Patterns entry written to
   LEARNER.md carries its proof: `[evidence: 5 misses / 3 artifacts, Jul–Sep]`.
   Auditable against signals.jsonl; the user may delete any entry they
   disagree with. The profile never claims what it can't prove.
3. **Patterns heal.** `scripts/scan-signals.ts heal` (defaults: hit-rate ≥80%
   over the last 6 graded signals on a tag) lists entries eligible for
   retirement. Weak patterns are supposed to shrink under treatment — a
   deficit-only profile becomes a self-fulfilling ceiling.
4. **Bad-question escape hatch.** If the user says a question was bad, mark
   that signal `"excluded": true` — generation failures never become facts
   about the learner. Skips are logged as signals too.

All thresholds are tunable constants in the scripts' flags; the defaults are
starting guesses.

## Surfacing

Portable core is on-demand plus a non-blocking nudge: when the skill is
invoked for a new explanation and cards are due, mention it once ("6 due —
review first, or after?"). Never block, never nag. Host-specific layers
(daily digests, notes-app exports) are optional additions, never requirements.
