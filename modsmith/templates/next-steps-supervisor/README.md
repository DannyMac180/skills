# next-steps-supervisor

A second opinion on every turn that did real work. When Claude finishes a turn
that changed something, a forked copy of the conversation asks four questions
about it:

- What was the original goal?
- Did the work actually achieve it? (`yes`, `partly`, `no`)
- Where did it cut corners: tests not run, a stub left in, a claim never checked?
- Did it do anything you should have approved first?

The answer is drawn above the prompt. A clean result takes one line:

```
✓ Supervisor: Solved · Add retry with backoff to the API client
[ Run the full test suite ]  [ Dismiss ]
```

Anything else expands:

```
◐ Supervisor: Partly solved · fork: 48k cached, 0.2k new, 0.1k out
Goal: Add retry with backoff to the API client
Gaps
  · No retry on 429 responses
Shortcuts taken
  · Tests were written but never run
[ Run the client tests and fix failures ]  [ Handle 429 with Retry-After ]  [ Dismiss ]
```

Each next-step button sends that step as your next prompt (hotkeys `n` and
`m` once the band has focus). Dismiss clears the verdict. A new turn clears
it too.

None of this enters the main conversation: by `$.model.fork`'s documented
contract the fork's question and answer stay outside the transcript, so the
main context does not grow. (Not yet confirmed in a live session; see
DECISIONS.md.)

## Commands

| Command | Does |
| --- | --- |
| `/supervisor` | Toggle on/off (saved across sessions) |
| `/supervisor on` / `off` | Set it explicitly |
| `/supervisor now` | Check the last turn right away, even when off or un-gated |

## What it costs

One `$.model.fork` per qualifying turn, and only then.

- **When it runs:** after a main-loop turn that ended with an answer *and*
  either ran at least one tool that was not read-only (an edit, a write, a
  shell command) or made 8 or more tool calls. At most once per turn. Never
  on chat-only turns, interrupted turns, subagent turns, or while off. If a
  turn ends while the previous turn's fork is still out, that old reply is
  dropped and the newer turn is checked as soon as it returns.
- **How much:** the fork re-sends the main thread's last request with the
  question appended, so the API serves the transcript from its prompt cache.
  You pay cache-read price on the transcript (typically about a tenth of
  normal input), full price on the ~250-token question plus Claude's final
  reply for the turn (quoted in the question, capped at its last 4,000
  characters, so at most about 1k tokens), and output on a reply of roughly
  100-300 tokens. On a 50k-token session that is about 5-6k
  input-equivalent tokens per check. These are estimates, not measurements. The band shows the real numbers each time
  (`fork: 48k cached, 0.2k new, 0.1k out`).
- **When it gets expensive:** if the cache entry has lapsed (typically about
  5 minutes after the main thread's last request) or right after `/model`,
  the fork pays full price for the whole transcript. The `cached` figure
  falls to near zero when that happens.
- It never runs a second time for the same turn. The fork only reads the
  main thread's cached prefix and its own tail is never cached, so it should
  not make the next real turn more expensive.

## Composes with

- **quiz-after**: both mods fork after a turn and both draw above the prompt.
  This mod draws its verdict and then `{await next(e)}` underneath, so the
  quiz (and anything else below it in the chain) still shows. Neither hides
  the other. Hotkeys are chosen not to clash: quiz-after uses `1`-`3`, `s`,
  `x`; this mod uses `n`, `m`.
- **token-weather** and other AbovePrompt bands: same rule, they draw below.
- **assumption-ledger**: the ledger records what Claude assumed; the
  supervisor judges whether the result met the goal. Running both gives you
  "what it assumed" and "whether it worked" side by side.
- **mode-registry / effort-modes**: no direct link. A future mode could turn
  the supervisor on only for high-effort domains (API, security).

When a survey holds the band, this mod yields completely and draws only what
is below it.

## Install / load

```
claude --plugin-dir /path/to/next-steps-supervisor
```

Check it before loading:

```
claude plugin validate /path/to/next-steps-supervisor
claude plugin test /path/to/next-steps-supervisor
```

## Files

```
.claude-plugin/plugin.json   manifest, types pointer
hooks/hooks.json             { "modules": ["./register.tsx"] }
hooks/register.tsx           gating, the fork, /supervisor, the band
hooks/verdict.ts             fork prompt and a tolerant JSON parser
types/index.d.ts             Verdict type and PluginState entry
tests/supervisor.test.tsx    gating, final-reply quote, queued check, drawing with what is below, button submit
```
