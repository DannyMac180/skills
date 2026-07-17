# Explain This — Roadmap

v0 ships the core loop: interview → profile-shaped explanation → quiz gate →
spaced-repetition review → evidence-gated profile adaptation. Candidates for
future versions, roughly ordered:

## v1 candidates

- **Socratic mode** — instead of explaining, ask questions and only fill the
  gaps the learner can't fill themselves. A different interaction contract:
  the learner constructs the understanding; the skill steers.
- **Artifact mode** — for hosts that support rendered artifacts (e.g. Claude
  Code artifacts), emit the explanation as an interactive page: embedded
  click-to-reveal quiz widgets, and figures/visuals extracted from the source
  document inline. The markdown note stays canonical; the artifact is a render.
- **Skip as a first-class signal** — the docs promise "skips are logged" but
  the signal schema only accepts hit/partial/miss. Add `skip` to the result
  enum so chronic skipping is actually measurable. (Found during first live test.)
- **Schema version field** — a `"v": 1` on cards and signals so future schema
  changes can migrate real users' state instead of breaking it.

## v2 candidates

- **Video adapter** — transcripts, timestamps-as-citations, "meaning" =
  the argument arc across time. A different beast than text; deferred until
  the text adapters are proven.
- **Book adapter** — chapter-scale ingestion, argument arcs across chapters,
  cumulative quizzing across a book's deck.
- **Spaced-rep export** — emit cards in Anki / Obsidian spaced-repetition
  plugin formats for people who already live in those tools. The
  conversational review loop stays the native path (it can re-explain on a
  miss; flashcard apps can't).
- **Threshold tuning from real data** — the evidence-loop constants
  (4 misses / 2 artifacts / 60-day window / 80% heal rate) are principled
  guesses. Revisit once real signals.jsonl histories exist.

Design principles that constrain all of the above: state stays plain files in
`~/.explain-this/`; the skill folder stays stateless and replaceable; nothing
requires a specific agent host; markdown remains the canonical output.
