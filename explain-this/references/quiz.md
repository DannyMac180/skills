# Quiz Generation

Quizzes are **speed regulators**, not assessment theater — they force genuine
comprehension before moving on and prevent the false confidence a fluent
explanation can create. The whole evidence loop is only as good as the
questions feeding it.

## The governing test: load-bearing questions only

A question earns its place only if missing it would change what the learner
can do with the artifact. This kills trivia (author names, years, constants),
questions about the explanation's own structure, and box-checking recall.

## Composition scales with the depth dial

| Depth | Count | Mix |
|-------|-------|-----|
| orient | 3 | big-picture + the one idea only — no mechanism quizzing |
| working (default) | 5 | 2 recall, 2 transfer, 1 explain-back |
| rederivable | 7–8 | the working mix plus derivation-tagged questions |

Coverage anchors at every depth: at least one question on **the one idea**
(spine section 2), and at least one **transfer question pointed at the
learner's formation goals** — this is where the profile makes quizzes personal.

## Tag vocabulary (closed — used by the evidence loop)

Every question carries 1–2 tags from exactly this list:
`terminology`, `mechanism`, `derivation`, `transfer`, `big-picture`

## Type specs

- **recall** — only terms that later sections depend on. If nothing downstream
  breaks when it's forgotten, it's trivia: cut it.
- **transfer** — apply the mechanism in a novel context drawn from the
  learner's deep domains (LEARNER.md). The stored `answer` is a *grading
  rubric* ("uses the mechanism correctly in the new context"), not verbatim
  text — good transfer answers won't match canned text.
- **explain-back** — "explain X to a colleague in three sentences." Graded on
  exactly three criteria: core claim present, mechanism correct, nothing
  invented. 3/3 = hit, 2/3 = partial, else miss. "Nothing invented" is the
  anti-confabulation check — fluent-but-wrong is the failure mode this tool
  exists to catch.

## Two-pass generation

1. **Draft from the artifact, not the explanation.** Questions generated from
   the explanation converge on its wording and become *echo questions* —
   answerable by pattern-matching prose the learner just read, which measures
   short-term verbal memory, not understanding.
2. **Self-check every candidate:** (a) answerable from the artifact alone?
   (b) echo test — if the answer appears near-verbatim in the explanation
   within a sentence of the question's phrasing, cut it; (c) load-bearing
   test; (d) tags correct — the evidence loop depends on tag accuracy;
   (e) type-mix quota met.

## Weak-pattern targeting

If LEARNER.md lists an active Known Weak Pattern, include one deliberate
question on that tag in every relevant artifact's quiz. This is simultaneously
treatment (practice where weak) and measurement (generates the hit-rate data
that lets the entry heal and retire). Without it, weak patterns linger because
nothing re-tests them.

## Gate mechanics — honest about enforcement

- **Conversational mode: the gate is real.** Don't close the explanation until
  the quiz is attempted. On a miss, immediately re-explain the missed idea
  *differently* (a new route in, shaped by the profile) — this is the first
  learning moment, before the card ever enters the deck.
- **Document mode: the gate is advisory.** Embed questions at section ends
  with answers in `<details>` blocks — honor system. Every question still
  enters the card deck, so real enforcement arrives later via review.
- **"Skip" is always allowed** and logged as a signal. Chronic skipping is
  information too.

## After the quiz

Add every question to the deck (`scripts/sm2.ts add`) and log every attempt
(`scripts/scan-signals.ts log`) per `review.md`. Grade free-text answers
yourself — hit / partial / miss — never ask the learner to self-grade.
