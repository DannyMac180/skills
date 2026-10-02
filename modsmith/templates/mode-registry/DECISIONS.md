# mode-registry: decisions

## The contract is `$.state`, not a noun on `$`

**Chosen:** three `$.state` values owned by `mode-registry` (`catalog`,
`active`, `isPicking`), declared in `types/index.d.ts` under `PluginState`.
Other plugins offer a mode by hooking `state.set` on `catalog` and rewriting
`e.value`. They read `active` with `$.state.get`, and they can veto a switch
by hooking `state.set` on `active`.

**Rejected: a `$.modes` noun added in `engine.create`** (`register`,
`active`, `set`, declared on `EngineInterface`). It reads nicely, but:

- The noun's methods are closures built inside `engine.create`, where `$` is
  `NoEngineInterface` (every property `never`). A method can't call
  `$.state.set` or `$.ui.invalidate`, so the registry would end up in a module
  variable. A hot reload wipes module variables, and nothing redraws when they
  change.
- Each dependent would have to call `$.modes.register(...)` at a time when the
  registry is guaranteed to exist, and guard `$.modes` being absent when the
  registry isn't installed. With `$.state`, a missing registry reads as
  `undefined` at version 0 and the dependent's `state.set` hook simply never
  fires. Nothing to guard.
- reference.md ("Drawing: ui.render") names `state.set` hooks as *the* way
  another plugin changes a value it doesn't own. The noun route would invent a
  second way.

**Rejected: dependents hook `state.get` to append their mode on every read.**
That would also work as a fold, but it runs on every read, including the
footer's redraws. The `state.set` fold runs only when the catalog is rewritten
(session start, each `/mode`).

**Verified** by `tests/registry.test.tsx` (`claude plugin test`, 4/4 pass):
an inline plugin's `state.set` hook folds its mode into the catalog; a second
plugin reads the registry's values with `$.state.get`; a third plugin's
`state.set` hook on `active` vetoes a switch; and a read in the same dispatch
right after `$.state.set` sees the value that landed, including a vetoed one.
Also verified live: `claude -p --plugin-dir mode-registry --plugin-dir
effort-modes "/mode list"` lists effort-modes' three modes.

## Refresh = write the empty list

The registry never merges offers itself. It writes `[]`, and whatever lands is
every offerer's hook applied in chain order. This also means a plugin that was
unloaded disappears from the catalog on the next refresh, with no unregister
call. Refresh points are `session.start` and every `/mode`. **Not handled:**
an offerer that hot-reloads mid-session stays stale until the next `/mode`.
The footer label then falls back to the raw id, which is good enough.

## Display: the `SessionMode` footer, plus a picker only on request

- **Footer label** (`SessionMode`, rewriting `e.props.modes`): this is the
  engine's own place for mode labels, one row tall, beside `focus` and
  `memory paused`. It composes by construction because each hook appends to the
  array and passes it on. Rejected: `$.ui.status` (one line per plugin, meant
  for transient state) and a permanent `AbovePrompt` band (costs vertical space
  every turn for one word).
- **Picker** (`AbovePrompt`, only while `isPicking`): buttons with hotkeys
  `1`-`9` and `0` for off, plus a `role="dismiss"` Close. It draws
  `{await next(e)}` beneath itself, so other bands still show.
- **No global hotkey.** A Button's `hotkey` works only while its site holds
  the keyboard (ctrl+x tab or a click). A chord from the prompt needs a Button
  whose `action` names one of the engine's own keybinding actions, and there is
  no "switch mode" action to borrow. Assumption, not verified: there is no API
  for a plugin to add a keybinding action.

## `/mode` is not `immediate`

A switch typed mid-turn waits for the turn to end. A mode that changes request
parameters (effort, model) would otherwise change them between steps of one
turn. A picker press can still land mid-turn, which is why effort-modes
latches the mode at `turn.start`. Other offerers that change request
parameters should do the same.

## A picker press is silent to the model

The picker's buttons write `active` directly (`update`), so a press adds no
transcript line and the model isn't told the mode changed, and a veto shows
only as the footer not changing. Rejected for now: having the press call
`$.command.run({ command: 'mode', args })`, which would give it the same line
and veto report as typing it. It queues until the session is idle, which would
also fix the mid-turn case, but `$.command.run` skips "the calling hook" and it
is not verified whether a press handler drawn by this plugin counts as calling
this plugin's own `command.run` hook. The README says to use `/mode <id>` when
the model should know.

## The command's output goes to the model

`command.run`'s `{ text }` is a transcript row the model also reads. That is
deliberate: the model learns "Mode: Review. Max effort, for code review and
security", so it can say why its behaviour changed. It's a few tokens,
appended, and it doesn't break the cache. The bare `/mode` answers with one
short line, because the picker is the real answer there.

## Assumptions not verified

- `/mode` doesn't clash with a built-in command name in every build. It
  registered and ran under 2.1.287 (headless). A clash would make
  `$.command.register` reject; the registry logs that and carries on.
- Whether a registry hot-reload keeps `/mode` registered. The 2.1.286
  declarations say `session.start` fires again "once per fresh load" of a
  plugin, a reload included, so the registry re-registers `/mode` and
  refreshes the catalog then. Not tried live.
- Picker rendering on desktop was checked only through the test kit's
  `mount` (the tree validates on `terminal` and `desktop`), not by eye.
- `$.state` across `/clear`.
