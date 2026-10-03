# quiz-after

When Claude finishes a task that changed something, a small quiz appears above
the prompt: two or three questions about what was just built, each with a
button that reveals the answer and why. It checks that you understand the
change, not that you remember file names. Press **Save to deck** and the
questions become spaced-repetition cards in your
[explain-this](../../../explain-this) deck.

```
Quiz · Retry queue with backoff · fork: 48.2k cached, 350 new, 520 out
1. Why does the queue back off instead of retrying at a fixed rate?
   [ Reveal answer 1 ]
2. What happens to a job that fails after the last retry?
   a) It is dropped
   b) It goes to the dead-letter list
   c) It retries forever
   → It goes to the dead-letter list The worker never drops work silently.
[ Save to deck ]  [ Dismiss ]
```

## How it decides

1. While a turn runs, it counts the main conversation's tool calls that were
   not read-only (an edit, a write, a Bash command that changes things, a
   subagent launch). Reads, searches, plain chat and bookkeeping tools
   (TodoWrite, the task tools, plan mode, AskUserQuestion, ToolSearch) count
   for nothing.
2. When the main turn ends normally and that count is above zero, it makes
   **one** `$.model.fork` call. The fork sees the conversation as the main
   thread last sent it and first answers: is the task actually finished?
3. Not finished: nothing is drawn. Finished: it returns JSON with the
   questions, which are cleaned up (bad fields dropped, at most three, multiple
   choice only when the answer is one of the choices) and drawn.

The fork runs after the turn has ended, on a timer, so it never holds up the
turn. If you send a new prompt before it answers, that quiz is thrown away.

## What it costs

| When | Model calls | Tokens |
| --- | --- | --- |
| Chat-only or read-only turn, aborted turn, subagent turn | none | 0 |
| `/quiz off` | none | 0 |
| A turn that changed something, quiz on, task finished | 1 fork | the whole transcript as input, served mostly from the prompt cache, plus about 350 new input tokens for the question and roughly 200 to 700 output tokens |
| The same, but the fork judges the task unfinished | 1 fork | the same cached transcript and ~350 new input tokens, about 10 output tokens; nothing drawn |
| `/quiz now` | 1 fork | as a finished task |
| Reveal, Dismiss, Save to deck | none | 0 |

A fork reuses the main thread's prompt cache, so the transcript is billed at
the cache-read rate rather than full input price, as long as the cache entry
is still warm (it is: the turn just ended). The quiz header shows each fork's
actual split, `cached / new / out`, so you can see what you paid. A `cached`
number near zero means the cache had lapsed or the model changed, and that
fork paid full price for the transcript.

The token figures above are estimates from the prompt's length, not
measurements; the header's numbers are the real ones. The cached read is the
big term: on a 100k-token session, every qualifying turn reads 100k cached
tokens, finished or not.

## Commands and keys

- `/quiz` toggles it on or off. The setting is kept in the plugin's `$.store`,
  so it survives restarts. `/quiz on` and `/quiz off` set it explicitly.
- `/quiz now` asks for a quiz about the work so far, skipping the "is it
  finished?" check. It works even while the mod is off.
- With the band focused (ctrl+x tab, or a click): `1`, `2`, `3` reveal answers,
  `s` saves to the deck, `x` dismisses. The declarations also say a bare digit
  typed into an *empty* prompt presses a band Button, so while a quiz is up,
  `1` in an empty prompt reveals answer 1 instead of typing (not tried live).

## Save to deck (explain-this)

The button appends one card per question to
`$EXPLAIN_THIS_HOME/memory/cards.jsonl` (default `~/.explain-this/memory/`),
in the shape `explain-this/scripts/sm2.ts add` writes: a fresh SM-2 state
(`interval_days 0, ease 2.5, due today`), `type` `transfer` for transfer
questions and `recall` otherwise, and the question's tag. The answer and its
reason are stored together because explain-this review grades free-text answers
against them. Questions already in the deck are skipped.

Nothing is written unless you press the button. If the `memory` folder does not
exist, the mod creates nothing and says so in a toast. Run explain-this once to
set the deck up.

## Composes with

- **Other bands above the prompt** (for example token-weather): quiz-after draws
  its quiz and then whatever the rest of the chain draws (`await next(e)`)
  beneath it, so it never hides another mod. It steps aside while a survey holds
  the band.
- **explain-this**: shares its card deck, so `explain-this review` brings the
  questions back on the SM-2 schedule.
- **Other fork-based mods** (a next-steps supervisor, an assumptions check):
  each one is its own fork and pays its own cache read. If you run several,
  check the `cached` column before adding a third.
- **A mode selector**: quiz-after has no mode of its own yet. `/quiz off` is the
  switch a "learning mode" would flip.

## Install

```sh
claude plugin validate templates/quiz-after
claude --plugin-dir templates/quiz-after
claude plugin test templates/quiz-after   # parsing, card shape, gating and the band on terminal and desktop
```

Copy the folder and rename it before changing it. Built against Claude Code
2.1.286's declarations.
