# LEARNER.md Template

Draft this from the interview (`interview.md`), show it to the user, apply
their corrections, and write it to `~/.explain-this/LEARNER.md`. Keep the
whole file under ~150 lines — it loads into context on every explanation, so
every section must earn its cost. Nothing here is machine-only: the user owns
this file and may edit anything.

```markdown
---
name: <name>
created: <YYYY-MM-DD>
last_profile_update: <YYYY-MM-DD>
profile_updates: 0
defaults:
  depth: working            # orient | working | rederivable
  output: chat              # chat | <notes path> | html
  quiz: gate                # gate | appendix | off
---

# How I Learn

## Prior Knowledge — build analogies here, skip re-explaining this
<!-- from Q1; three tiers -->
- **Deep (could teach it):** <!-- TODO -->
- **Working (compress, don't re-teach):** <!-- TODO -->
- **Thin (explain from scratch):** <!-- TODO: from Q3 -->

## Entry Preferences — how to open an explanation
<!-- from Q2, Q4, Q5 -->
- <!-- TODO: e.g. "intuition before formalism, why before how" -->
- <!-- TODO: evidence preference — proof / demo / story -->

## Depth Dial
- Default: <!-- TODO: from config picks -->
- Override phrases: "just orient me" → orient; "I want to really grok this" → rederivable

## Known Weak Patterns — machine-earned, evidence-gated
<!-- Seeded from Q3. After that, written ONLY by the evidence loop
     (review.md): ≥4 same-tag misses across ≥2 artifacts. Every entry cites
     its evidence and the user may delete any entry they disagree with. -->
- <!-- TODO: seed from Q3, e.g. "Loses the thread on multi-step derivations →
     slow down, add a worked example [seeded at interview]" -->

## Formation Goals — what understanding is FOR
<!-- from Q6. The "what can you now do" section of every explanation points
     here. This is what turns explanation into formation. -->
- <!-- TODO -->

## Stretch Policy — anti-overfitting counterweight
<!-- from Q7. Comfort-only explanations become a ceiling. -->
- Roughly 1 in <N> explanations: lead with the unfamiliar frame, flagged
  ("trying the formal route first — tell me if it doesn't land")
- My reaction is signal; log it
```

## Rules encoded in this template

- Frontmatter `defaults` = machine-read config; the body = human-read
  identity. One file, two audiences.
- `Known Weak Patterns` entries must cite evidence (misses / artifacts /
  date range) — the file stays honest and auditable.
- `profile_updates` in frontmatter makes profile drift visible at a glance;
  bump it on every evidence-driven revision.
