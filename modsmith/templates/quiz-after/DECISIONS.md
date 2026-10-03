# quiz-after: decisions

## Decisions

**One fork, two jobs.** The "is it done?" check and the questions come from the
same `$.model.fork` call. The fork answers `{"done": false}` when the task is
unfinished, which costs only a few output tokens on top of the cached prefix.
Rejected: a cheap `$.model.complete` with Haiku to judge "done" first. It has no
history, so it would need the transcript pasted in at full price, which costs
more than the fork's cache read.

**Gate on non-read-only tool calls.** A turn qualifies when at least one
main-loop `tool.call` (no `agentId`) came back without `isReadOnly`, was not
denied, and was not a bookkeeping tool (TodoWrite, TaskCreate/Update/Stop,
AskUserQuestion, Enter/ExitPlanMode, ToolSearch). The engine sets `isReadOnly`
by the tool's own permission check, so `ls` and Read do not count but Edit,
Write and a mutating Bash do. Rejected: matching tool names
(Edit/Write/NotebookEdit). That misses changes made through Bash and MCP tools.
Subagents' own calls are not counted: delegation already shows as the main
loop's Agent call, and counting them would let another mod's background agent
make an unrelated turn pay for a fork. (The checker narrowed this from the first
version, which counted every loop's calls and the bookkeeping tools, so a
planning-only turn with a TodoWrite paid a full cached read.) Only the main
loop's `turn.complete` (no `agentId`) with `reason: 'answer'` can trigger a
fork.

**Fork after the turn, on a timer.** `turn.complete` calls `next(e)`, then
schedules the fork with `$.clock.after(0, ...)` and returns. The reference
says work that outlives a dispatch belongs on a timer. Awaiting the fork inside
the hook could hold up the end of the turn for the fork's whole latency.

**Stale quizzes are dropped.** A counter goes up on every `prompt.submit`. If it
changed while the fork ran, the result is discarded, because a quiz about the
previous task, drawn while Claude is working on the next one, is noise.
`/quiz now` ignores this check.

**Parse defensively, in a pure module.** `hooks/quiz.ts` has no `$`. It cuts
the outermost `{...}` out of whatever the fork wrote (prose, code fences),
`JSON.parse`s it in a try, drops questions without `q` or `answer`, caps fields
at 400 characters and the list at three, drops `choices` unless the answer is
one of them, and maps an unknown tag to `mechanism`. Keeping it pure is what
lets `claude plugin test` and a Bun script against `sm2.ts` exercise it.

**State.** The quiz and the "checking" phase live in `$.state` (atoms in
`types/index.d.ts`), so a hot reload keeps the quiz on screen and the band
redraws on writes. Per-turn counters are module variables: losing them on a
reload costs at most one skipped quiz. The on/off toggle lives in `$.store`,
the only one of these that must outlast the session.

**Compose in the band.** The render hook always awaits `next(e)` and draws it
under the quiz, so token-weather and similar bands stay visible. It returns
`next(e)` untouched while a survey holds the band.

**Card shape.** It copies `explain-this/scripts/sm2.ts`'s `Card` and the
defaults `add` fills in (`interval_days 0, ease 2.5, due today` in local
`YYYY-MM-DD`, `reps 0, lapses 0, history [], status active`). The id is
`card_quiz_<title-slug>_<base36 ms>_<n>`. The answer is stored as
`answer (why)`, because review grades free text against the stored answer.
Choices are not stored, since review asks open questions. `type` is `transfer`
for transfer-tagged questions and `recall` otherwise. `explain-back` is never
used. `artifact.source` is the session's working directory.

**Write path.** `$.fs` has no append, so the mod reads `cards.jsonl`, adds the
new lines (adding a newline first if the file lacks a trailing one) and writes
the whole file back. Cards whose id or question is already in the deck are
skipped, so pressing Save twice or re-saving after a reload adds nothing. Lines
it cannot parse are kept exactly as they are.

**Never create the deck.** If `<home>/memory` is missing, a toast says so and
nothing is written. `cards.jsonl` itself may be missing inside an existing
`memory` folder, and `sm2.ts` creates it the same way.

**Hotkeys.** `1` to `3` reveal, `s` saves, `x` dismisses. Dismiss carries
`role="dismiss"` so the desktop draws its native close control.

## Alternatives rejected

- **Drawing the quiz in a Pane.** The band is where a quick check belongs. A
  pane would take over the layout for something you glance at.
- **Free-text answers in an `Input`, graded by another fork.** That costs a
  second call per answer. explain-this review already grades free text, so
  Save to deck sends the questions there.
- **A per-question Save button.** More buttons in a small band. All questions
  are saved at once, and duplicates are skipped.
- **Quizzing every N turns, or on a cost budget.** "The task is finished" is the
  moment Thariq described. A fixed cadence would quiz half-done work.

## Confirmed in a live session

First run on 2026-10-03, in the Claude Code desktop app (2.1.287), loaded
beside a third mod (token-weather) and next-steps-supervisor:

- The fork started from `$.clock.after` after the turn ended ran normally; it
  was not cut as `aborted`.
- The fork followed the JSON instruction and the band drew above the prompt,
  alongside the other two bands without hiding either.
- Nothing from the fork appeared in the main conversation's context.

Still unconfirmed live: the buttons and hotkeys, Save to deck, and the real per-check
token cost.

## Assumptions not verified

- That `$.model.fork` called from a `$.clock.after` callback, after the
  `turn.complete` dispatch has returned, runs normally and is not cut as
  `aborted`. The types document abort only for an interrupted turn or an
  unloaded environment. This was not run in a live session.
- That the fork reliably follows the JSON instruction. The parser tolerates
  prose around the object, and an unreadable reply draws nothing and logs the
  first 120 characters to the debug log.
- The token figures in README are estimates. The header's live `cached / new /
  out` numbers are the real ones.
- Digit hotkeys from the composer. The `Button.hotkey` declaration says a bare
  digit in an empty composer presses a band Button, so `1` typed into an empty
  prompt while a quiz is up reveals answer 1 rather than typing. Not tried live;
  if it gets in the way, drop the digit hotkeys and keep the buttons.
- Paint. `tests/flow.test.tsx` mounts the band through the test kit on the
  terminal and desktop surfaces, so each surface's element table accepted the
  tree and the buttons press, but the kit checks the tree, not what either
  surface paints. No screenshot was taken.
- Whether typing a slash command raises `prompt.submit`. If it does, typing any
  command while a background fork runs counts as a new turn and that quiz is
  dropped (one lost quiz, no extra cost).
- That the hard-coded bookkeeping tool names match this build's tool names;
  a renamed tool only means a planning turn pays one fork again.
- That the plugin's environment has the user's local timezone, so `due` matches
  the date `sm2.ts` computes. A UTC environment would be off by a day near
  midnight.
- The read-then-write of `cards.jsonl` is not atomic. A `sm2.ts grade` running
  at the same moment could lose one of the two writes.
