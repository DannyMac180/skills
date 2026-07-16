---
name: explain-this
description: >
  Explain any digital artifact — a paper, PDF, article, code diff, or codebase —
  so the person actually understands it, not just skims it. Explanations are
  shaped by a persistent learner profile, gated by comprehension quizzes, and
  feed a spaced-repetition review loop. USE WHEN: explain this, explain this
  paper / PDF / article / diff / repo, help me understand this, what does this
  mean, what is this really saying, break this down, walk me through this, quiz
  me, review my cards, explain-this review, explain-this interview. NOT FOR:
  plain summarization when the user only wants a TL;DR, writing new content, or
  reviewing code for defects.
---

# Explain This

Understanding is the bottleneck, not information. This skill turns any digital
artifact into an explanation the user can genuinely absorb — shaped to how they
learn, checked by quizzes that prevent false confidence, and retained through
spaced-repetition review. The goal is formation, not summarization: who the
user becomes by understanding, not just what they can skim.

## State contract

All user state lives in `EXPLAIN_THIS_HOME` (default `~/.explain-this/`) —
never in this skill's install directory, so it survives skill updates and is
shared across agent hosts:

```
~/.explain-this/
  LEARNER.md            # who this person is as a learner — read before EVERY explanation
  memory/cards.jsonl    # spaced-repetition cards + SM-2 scheduling state
  memory/signals.jsonl  # append-only quiz-attempt evidence
```

## First run

If `~/.explain-this/LEARNER.md` does not exist, do NOT explain anything yet.
Run the interview in `references/interview.md` (~10 minutes), draft LEARNER.md
from `references/learner-template.md`, show it to the user, and apply their
corrections. The profile is the product's first artifact.

## Every explanation follows the spine

Read `LEARNER.md` first, then build the explanation in this order:

1. **Why does this exist?** — the problem the artifact answers. Context before content.
2. **The one idea** — the single sentence worth retaining above all others.
3. **How it works** — intuition before mechanism, prose-ordered (literate
   sequencing), analogies drawn from the learner's deep domains, skipping what
   their profile says they already know.
4. **What can you now do** — point at the learner's formation goals: what can
   they build, argue, or decide that they couldn't before.
5. **Check yourself** — the quiz. Generate per `references/quiz.md`; add each
   question to the card deck per `references/review.md`.

## Depth dial

Default comes from LEARNER.md frontmatter; per-request override phrases win:

| Depth | Meaning | Trigger phrases |
|-------|---------|-----------------|
| orient | 5-minute orientation | "just orient me", "quick pass" |
| working | can explain it to a colleague (default) | — |
| rederivable | could re-derive / re-build it | "really grok", "go deep" |

## Artifact adapters

Pick the adapter for the artifact type; it defines ingestion and what
"meaning" means for that type:

- Papers / PDFs → `references/adapters/paper.md`
- Articles / markdown / essays → `references/adapters/article.md`
- Code, diffs, repos → `references/adapters/code.md`

## Output destinations

Markdown is canonical. The user directs the destination ("put it in Obsidian",
"give me an HTML file", "just tell me here"); the default lives in LEARNER.md
frontmatter. In document output, embed quiz questions at section ends with
answers in `<details>` blocks. An HTML render is an optional layer for
interactive quiz widgets — never required.

## Review mode

"quiz me" / "review my cards" / "explain-this review" → run the conversational
review loop in `references/review.md` (due cards via `scripts/sm2.ts due`).
When invoked for a NEW explanation while cards are due, mention it once
("6 cards due — review first, or after?") but never block.

## Gotchas

- **Never skip the profile read.** An explanation not shaped by LEARNER.md is
  a generic summary — the exact thing this skill exists to avoid.
- **A summary is not an explanation.** If the output could have been produced
  without the artifact's actual content or without the profile, start over.
- **Never write LEARNER.md's Known Weak Patterns from a single session.** Only
  the evidence loop (`references/review.md`, thresholds) may add entries, and
  every entry must cite its evidence. One bad quiz is noise, not identity.
- **Quiz questions come from the artifact, not the explanation** — otherwise
  they're echo questions that test short-term verbal memory. See
  `references/quiz.md` two-pass procedure.
- **Grade the user's free-text answers yourself** (hit/partial/miss). Never
  ask them to self-grade; self-grading is generous and corrupts the evidence.
- **You wrote the explanation AND grade the quiz — watch for grading
  inflation.** Grade against the artifact and the stored answer/rubric, not
  against your own explanation's wording. When unsure between hit and
  partial, choose partial.
- **State is sacred.** Never reset, rewrite, or prune `~/.explain-this/`
  except through the documented flows. Losing a learner's history is the worst
  failure this tool can have.
