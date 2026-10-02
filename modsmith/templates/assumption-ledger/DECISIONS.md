# Decisions

## A tool, not a fork

Thariq's version is a tool the model calls while it works. The alternative was
a `$.model.fork` at turn end asking "what did you assume, and what did you
skip?". Rejected: a fork reconstructs reasons after the fact, and it costs a
model call on every turn. A tool call happens at the moment of the choice, and
on a turn with nothing to record it costs nothing beyond the cached tool list.

## Byte-identical description, pinned in the list

The description and schema are module constants. `register_assumption` is
registered with them at `session.start`, and a `tool.describe` hook returns the
same constant with `isDeferred: false`. A plugin tool is named
`mcp__<plugin>__<name>`, and by the engine's rule MCP-style tools may be put
behind ToolSearch, where the model sees only the name and would rarely think to
call it. Pinning it in the list costs about 200 cached tokens a request; that
is the price of the model knowing when to call it.

The description is four sentences: when to call it (three kinds), that
`considered-not-done` matters most, and "skip the obvious". Longer guidance,
say examples, was rejected: it is paid on every request.

## Off means deferred, not unregistered

There is no `$.tool.unregister` in 2.1.286. `/assumptions off` sets
`isDeferred: true` and calls `$.ui.invalidate('tool.describe')`, so the tool
leaves the list (one cache rebuild), and any call that still arrives gets
"The ledger is off for this session. Carry on." without recording. The
setting is kept in `$.store` so it survives sessions.

## The follow-up button submits a prompt

The engine offers `$.prompt.submit`, which queues a real turn once the session
is idle. **Do it** uses it with `asUser: true`, since the person pressed the
button and the words are effectively theirs (the transcript still names the
plugin). If submit rejects, it falls back to `$.prompt.fill` (puts the text in
the prompt box), then `$.ui.copy`, then a toast. Alternatives considered: a
`/assumptions do <n>` command (more typing, the same result) and fill only (one
more keypress than needed). The pressed item leaves the band so it cannot be
sent twice.

## State and storage

- `$.state` holds `pending` (this turn), `shown` (the band), `turn` (a counter
  for labels) and `isOff`. The band reads from state, so a press redraws it
  without `$.ui.invalidate`, and a hot reload keeps it.
- The session log is in `$.store` under `log:<sessionId>`, appended at every
  call, not at turn end, so an interrupted turn still keeps its entries. The
  store is shared across sessions with a 4 MiB cap, so only the last 20
  sessions' logs are kept. Writes go through a small queue in the module
  because parallel tool calls would race the read-modify-write.
- `turn.start` clears `pending` and `shown`; `turn.complete` on the main loop
  moves `pending` to `shown`. A subagent's turn.complete is ignored for the
  band, but a subagent's calls still record into the main turn.
- `/clear` (`session.end` with reason `clear`) resets state; the new session id
  starts a new log.

## Writing to disk only when asked

`/assumptions write [path]` appends a dated section to `DECISIONS-log.md` (or
the path given). Appending was chosen over overwriting so several sessions
build one log. Nothing writes to disk otherwise.

## Drawing

- Steps aside while a survey holds the band or a turn is running, and draws
  what other mods draw beneath its own (`{below}` from `await next(e)`).
- `considered-not-done` is listed first, in yellow: it is the reason the mod
  exists.
- At most three items per kind, with "+N more: /assumptions". Every text line
  is `truncate-end`, so the band never grows past a few rows.
- No hotkeys on the **Do it** buttons. The engine lets a bare digit typed
  into an empty prompt press band Buttons (that is how surveys answer), so a
  person starting a prompt with "1" would have sent a follow-up and started
  a paid turn by accident. A click, or focusing the band, is required.

## Failure handling

Every `$` call that can reject goes through `quiet`, which logs to `$.ui.log`
and returns a fallback, and `/assumptions` catches anything left and prints
it as the command's output. Button handlers are `void`ed async functions that
catch everything. Invalid tool input returns `{ deny }`, which the model reads
as an error and can correct.

## Verified

- `claude plugin validate` passes.
- `tsc` (5.6, strict, `noUncheckedIndexedAccess`, with and without `skipLibCheck`) passes against the 2.1.286
  declarations, hooks and tests.
- `claude plugin test` passes `tests/ledger.test.tsx`: registration is
  byte-identical across two `session.start`s, the tool is pinned (`isDeferred:
  false`), invalid input is refused, the band stays hidden mid-turn and shows
  after it on terminal and desktop with the other mods' drawing beneath, **Do
  it** submits a prompt containing the item and removes it, Dismiss clears
  the band, `/assumptions` lists, `write` writes, `off` defers the tool and stops
  recording, and nothing reaches `$.ui.log`.

## Not verified

- In a live session: whether the model calls the tool unprompted, and how
  often. The description is a guess at the shortest wording that works.
- Whether the engine already lists plugin-registered tools in front (so the
  `tool.describe` pin is redundant) or defers them. The pin is harmless
  either way.
- The token figures in the README are estimates from character counts, not
  measured `usage` from a session.
- After `/clear`: the d.ts says no `session.start` fires, so the tool is not
  registered again. Whether a plugin's registered tool, and its `$.state`,
  carry over to the new session id was not checked.
- The `turn` counter lives in `$.state`, so a resumed session numbers its
  turns from 1 again while its `$.store` log keeps the old entries.
- `$.prompt.submit` with `asUser: true` from a button press in the desktop app.
  The test kit's submit was answered by the test, not the engine.
- That a hyphen in the plugin name gives exactly
  `mcp__assumption-ledger__register_assumption`. `claude plugin validate`
  accepted the matcher, and the test drove that name, but the test answered
  `tool.register` itself.
