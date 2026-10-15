# Decisions: next-steps-supervisor

## Made

**A fork, not a completion or a subagent.** `$.model.fork` re-asks over the
main thread's own transcript, so the prompt cache serves it and the supervisor
sees exactly what Claude saw. `$.model.complete` has no history, so it would
need the transcript pasted in (full input price, and a summary loses the
detail a supervisor needs). `$.agent.spawn` runs a whole loop with tools,
which is more cost and more ways to go wrong for a judgment that needs none.

**Gate: a non-read-only tool ran, or 8+ tool calls.** "Changed something" is
read from `tool.call`'s result (`isReadOnly !== true` and not denied), the
same signal quiz-after uses, rather than a list of tool names, so MCP tools
and future built-ins count without edits here. The 8-call threshold catches
long research turns that edited nothing but might still have stopped short.
Only main-loop calls count (`agentId === undefined`).

**Once per turn, keyed on `turn.start`.** A counter bumps at `turn.start`
(main loop only; subagents raise none) and the check records which turn it
judged. A second `turn.complete` for the same turn does not fork again.
`turn.start` also clears the previous verdict so a stale one never sits over
new work.

**The fork runs on `$.clock.after(0)`.** Awaiting it inside `turn.complete`
would hold the end of the turn for several seconds. The reference names
timers as the way to run work past a dispatch. A "checking…" line shows
while it runs. If a new turn starts before the reply lands, the reply is
dropped.

**The turn's final reply is quoted in the fork's question.** The fork
replays the main thread's last request, and the final reply is that
request's response, so the fork most likely cannot see it. That reply is
where "done, tests pass" claims live, which are exactly what a supervisor
checks. It is capped at its last 4,000 characters (about 1k tokens at full
price); the cached prefix is unaffected because the fork's tail is never
cached. Added by the independent check; the original version did not quote it.

**A turn that ends while a fork is out is queued, not lost.** The original
gate skipped any turn that ended while the previous fork was still running,
so a quick follow-up prompt was never checked. Now the stale reply is
dropped (as before) and the newest turn is checked when the old fork
returns. `turn.start` also resets the "checking…" line so it does not sit
over the new turn. An automatic check whose reply lands after `/supervisor
off` is dropped; `/supervisor now` still shows its result.

**Clean means `solved: yes` and no gaps, shortcuts or approvals.** The spec
said "solved and no gaps"; a turn that solved the goal by skipping its tests
is exactly what the supervisor exists to flag, so shortcuts and approvals
also expand the view.

**Next steps submit as the person's own words** (`$.prompt.submit({ text,
asUser: true })`). The person pressed the button, so the model should read
it as their prompt, not as "the next-steps-supervisor plugin sent a
message". The verdict clears before submitting.

**Draw mine, then `{below}`.** `await next(e)` is called once, before
deciding anything, and placed under this mod's tree in a column. When there
is nothing to show, or a survey holds the band, the hook returns `below`
unchanged.

**Next steps stack, one per row.** A Button label is one
line and cannot wrap. Side by side in the desktop band, the first step was
clipped at 60 chars and the second ran off the right edge. Each step now has
its own row, Dismiss below, and the label cap is 160 (the parser clips at 240).

**Hotkeys `n` and `m`, none on Dismiss.** quiz-after uses `1`-`3`, `s`, `x`
in the same band, and a clash means the later-drawn one wins. Button keys are
prefixed `supervisor-` for the same reason.

**Tolerant parser.** Take the outermost `{...}`, `JSON.parse` it, require
`solved` to be one of the three words, keep only string array items, cap
3 per list and 2 next steps, clip each to 240 chars. A reply that fails is
logged to the debug log and dropped. Nothing is shown rather than half a
verdict.

**On/off lives in `$.store`**, so `/supervisor off` survives restarts. The
verdict lives in `$.state` (survives hot reload, draws reactively). The
per-turn counters are module variables: a reload mid-turn costs one skipped
check and nothing draws from them.

## Considered and rejected

- **Gating on `turn.complete`'s `usage`** (skip cheap turns): a short turn
  can still delete a file. Tool activity is the better signal.
- **A slash command for next steps instead of buttons:** `$.prompt.submit`
  exists on this build, so the buttons send the step directly.
- **Persisting verdicts to disk** as a log: useful, but it is a second
  feature with its own file-placement questions. Left for a fork of this
  template.
- **Asking for a numeric score:** models cluster scores, and a number gives
  the person nothing to act on. `yes/partly/no` plus concrete gaps does.
- **Injecting the verdict into the next turn's context** so Claude
  self-corrects: that defeats the point of keeping the main context clean,
  and it takes the decision away from the person.

## Confirmed in a live session

First run on 2026-10-03, in the Claude Code desktop app (2.1.287), loaded
beside a third mod (token-weather) and quiz-after:

- The fork started from `$.clock.after` after the turn ended ran normally; it
  was not cut as `aborted`.
- The fork followed the JSON instruction and the band drew above the prompt,
  alongside the other two bands without hiding either.
- Nothing from the fork appeared in the main conversation's context.

Still unconfirmed live: the buttons and hotkeys, whether the fork already sees the final reply, and the real per-check
token cost.

## Assumptions not verified in a live session

- The fork's prompt and reply do not appear in the main transcript. This is
  the documented contract of `$.model.fork` and what the brief states; this
  template's test mocks the fork, so it does not prove it.
- `$` captured in a `turn.complete` hook stays usable inside a
  `$.clock.after` callback after that dispatch has returned. The test kit's
  mocked clock runs it this way and passes; a live session was not run.
- Whether the fork sees the turn's final reply on its own. The declaration
  says it replays "the main thread's last request", which suggests not, so
  the reply is quoted; if it is in fact included, the quote is a duplicate
  costing up to about 1k full-price tokens per check.
- `isReadOnly` is set on real built-in read tools (Read, Grep, Glob) so they
  do not count as changes. The test sets it by hand.
- Prompt-cache figures in README (cache read at about a tenth of input
  price, a roughly 5-minute cache lifetime) are typical API behaviour, not
  measured with this mod. Per-check token estimates in README are
  arithmetic, not measurements.
- How the desktop app draws two next-step buttons plus Dismiss in one row
  was not checked by eye; the test only proves the tree is accepted on the
  terminal and desktop surfaces.
