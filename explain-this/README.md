# Explain This

An agent skill that explains any digital artifact — papers, articles, code —
so you actually *understand* it, instead of just skimming an AI summary.

Inspired by Geoffrey Litt's
[Understanding is the New Bottleneck](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html)
and Andy Matuschak & Michael Nielsen's work on embedded spaced repetition
(*Quantum Country*). As AI produces more of our work, understanding — not
output — is what's scarce. This skill treats explanation as formation: the
point isn't just what you can do with an artifact, it's who you become by
understanding it.

## What makes it different

- **A learner profile, not a generic explainer.** On first run it interviews
  you (~10 minutes) and writes `~/.explain-this/LEARNER.md` — your prior
  knowledge, how you like to enter a topic, what understanding is *for* in
  your life. Every explanation is shaped by it.
- **Quizzes as speed regulators.** Every explanation ends with a few
  load-bearing questions (recall / transfer / explain-back), graded by the
  agent against your free-text answers — no generous self-grading.
- **Spaced-repetition review.** Quiz questions become cards. "Quiz me" runs a
  conversational review; when you miss, it re-explains *differently* instead
  of just flipping the card.
- **An evidence-gated profile.** The profile only claims weaknesses it can
  prove (≥4 same-tag misses across ≥2 artifacts), cites its evidence, and
  retires entries when you improve.

## Install

Point your agent at this folder's GitHub URL and ask it to install the skill,
or copy the `explain-this/` folder into your agent's skills directory.

**First run:** the skill will interview you before explaining anything
(~10 minutes) and create `~/.explain-this/` for your profile and review cards.
That directory is yours — it survives skill updates and is shared by every
agent host you use.

## Usage

- "Explain this paper: <link or file>"
- "Explain this diff" / "help me understand this repo"
- "Just orient me on this" (shallow) / "I want to really grok this" (deep)
- "Quiz me" / "review my cards"
- "Explain-this interview" (redo or revise your profile)

## Requirements

Any agent that supports skills. The two helper scripts run on
[Bun](https://bun.sh) or Node with native TypeScript type-stripping
(v23+, or v22.6+ with `--experimental-strip-types`), zero dependencies.

## Privacy

`~/.explain-this/` contains a candid profile of how you learn and a record of
what you've studied. It lives outside any repository by design — don't commit
it, and treat it like the personal document it is.
