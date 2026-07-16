# The First-Run Interview

Creates `~/.explain-this/LEARNER.md`. Design principle: **reveal, don't ask for
self-report** — people are bad at describing how they learn, so every question
extracts the answer behaviorally. One question per turn, curious-colleague
tone, no system jargon until the reveal. Target ~10 minutes, hard cap 15.

## Opener (framing, not a question)

> "Before I explain anything, I want to learn how *you* learn. A handful of
> questions, no right answers — what you tell me shapes every explanation I
> ever give you. Takes about ten minutes."

## The seven questions (in order)

| # | Question | Populates | Notes |
|---|----------|-----------|-------|
| 1 | "What do you know so well you could teach it? Two or three things — they don't have to be professional." | Prior Knowledge (deep) | Opens with competence, not deficit. Follow-up if all answers are work: "Anything outside work — a hobby, a craft, a past life?" Non-work domains make the best analogies. |
| 2 | "Tell me about the last thing you understood deeply — not just used, *understood*. How did you get there?" | Entry Preferences | The process they describe IS their learning style. Follow-up: "What was the moment it clicked?" |
| 3 | "Now the opposite: something you tried to learn and bounced off. What went wrong?" | Known Weak Patterns (seed) + Prior Knowledge (thin) | Seeds weak patterns honestly so the section isn't empty while the evidence loop matures. |
| 4 | "When you open a paper or a long technical article, what do you actually do first — abstract, figures, skim the whole thing, or start reading from the top?" | Entry Preferences | Behavioral probe — what they *do*, not what they *prefer*. Adapt the medium (docs/videos) if they don't read papers. |
| 5 | "When something is explained to you, what makes you trust it — a proof, a working demo, or a story about why it exists?" | Evidence preference | Determines whether explanations lead with derivation, example, or motivation. |
| 6 | "What are you trying to build or become this year? What should understanding new things be *for*?" | Formation Goals | The soul question — give it room, never rush it. This is what turns explanation into formation. |
| 7 | "Last one: when an explanation pushes you outside your comfort zone, is that energizing or exhausting? How much pushing do you want?" | Stretch Policy | Calibrates the anti-overfitting counterweight (default: 1 in 5 explanations leads with an unfamiliar frame). |

## Conduct rules

- **One question per turn.** Never a wall of questions.
- **Max one follow-up per question.** The time cap beats completeness — TODO
  gaps in the profile are fine.
- **Mirror only non-obvious inferences.** When you draw a conclusion the
  person didn't state ("sounds like you need the why before the how — is that
  right?"), say it so it can be corrected at the source. Don't mirror every
  answer; that reads as formulaic.

## Config picks (after Q7 — asked directly, these are settings, not psychology)

1. Default depth: orient / working / rederivable
2. Default output destination (chat, a notes folder, HTML file, etc.)
3. Quiz gate: on (quiz before closing each explanation) / appendix / off

## The reveal

Draft the complete LEARNER.md from `learner-template.md` and present it:

> "Here's you, as a learner — my first sketch, anyway. Read it. What did I get
> wrong?"

Apply corrections conversationally or let them edit the file directly — both
fine. Then create `~/.explain-this/memory/` so the state contract is complete.

## Edge cases

- **Bail mid-interview:** draft from what exists; unanswered sections get
  `<!-- TODO: not yet asked -->` comments. The skill works with a partial profile.
- **Re-run on an existing profile:** switch to review mode — walk the current
  file section by section, propose diffs, never silently overwrite.
