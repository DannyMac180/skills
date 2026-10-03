# Gotchas

Traps with their symptoms, so you can search by what you see. Each was
checked against the 2.1.286 declarations and the built-in `reference.md`;
when your build's generated declarations say otherwise, they win.

## Drawing

**Nothing named `h` or `Fragment`, and no `@jsx` pragma.**
JSX compiles to bare `h(...)` calls against the global factory, and the
engine prepends the pragma. A local `h`, an import of one, or your own pragma
points JSX away from it, and `<Client>` tags written under another factory
are not found.
*Symptom:* the tree never draws, or a Client region is missing.

**`Client` module paths are string literals.**
The engine reads `module: './thing.tsx'` off the source. A variable there is
refused at load, as is a path outside the plugin or naming no file.

**A tree that doesn't validate isn't drawn.**
An element the surface lacks, a prop it doesn't take, or a child where none
goes: the engine draws its own instead and logs
`ui.render (<Component>): a hook returned a tree that does not validate`.
Element tables differ per surface (`$.ui.resolve(e)`), so mount the tree in
a test on each surface you claim.
*Symptom:* your band is simply absent. Run with `claude --debug`.

**`{await next(e)}` belongs in your tree.**
Omit it and you replace every other plugin's drawing at that site.
*Symptom:* installing your mod makes another one disappear.

**A render hook can't write state.**
`$.state.set` while drawing is denied. Write from a press handler (`update`
from `claude-code`, which retries on a version miss) or another event. A
`$.state.get` while drawing subscribes the instance, so a later `set` redraws
it with no `$.ui.invalidate`.
*Symptom:* a press seems to do nothing, or two quick presses lose one.

**Module variables don't survive a hot reload.** Saving a file re-runs
`register` in a fresh environment and drops its timers. Keep what the
drawing needs in `$.state`, and what must outlive the session in `$.store`.

**Hotkeys on a band are live from an empty prompt.**
A bare digit typed into an empty prompt presses a band Button with that
hotkey. A digit hotkey that starts a paid turn will fire by accident.
*Fix:* letters for anything costly, or no hotkey.

**The band is capped at half the terminal's rows.** A taller tree scrolls
(`e.props.maxRows`, `scroll.bodyRows`). Size width to `e.props.bodyColumns`,
not `viewport.columns`. Redraws fold to ten a second, thirty for the band
and the shown pane.

## Async and failure

**`$.clock.now()` returns `Promise<number>`.** Await it.
*Symptom:* `NaN` arithmetic, `[object Promise]` timestamps.

**Catch every `$` promise you don't return.** A hook that fails is skipped
(before `next`) or loses its work (after `next`), and a fire-and-forget
rejection has no hook to land in. `$.store.set` rejects once the store passes
4 MiB of JSON.

**A hook has a 10 s budget.** `$` calls in flight don't count against it;
`$.clock.sleep` does. Past the budget the hook is treated as absent and the
chain goes on (its `.catch` handler answers, if it registered one).

**Not awaiting `next(e)` is how you run concurrently** with the chain below.
`next(e)` twice runs the chain below twice: intended for retry, a bug by
accident.

## Semantics

**On `tool.call`, not calling `next(e)` is what stops the tool.** `{ deny }`
is what the model receives, as an error result. Returning `deny` after you
already called `next` doesn't un-run anything.

**The model sees what it asked for, not your rewrite.** If you change a
tool's input, say so in the result's `context` so the model isn't confused.

**A hook can't reorder itself.** Order comes from tiers, load order and
declared dependencies. Document position-sensitive behaviour instead. The
tiers, outermost first: `prepend` (admin-managed), `user` (what a person
installs), `append` (admin-managed, beneath user plugins: the place for
redaction nothing above can undo), `builtin`, `core`. `next.to(e, tier)`
skips ahead.

## Environment

**Function hooks are early access.** Interactive sessions on 2.1.286/2.1.287
loaded hooks modules with no flag. A `claude -p` run reports a module that
did not load on stderr, the switch being off included; set
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in that process's environment then. It
loads every installed plugin's hooks module, not only yours.

**Types are generated, not copied.** The engine writes the declarations and
a `tsconfig.json` beside a mod it loads from a folder
(`.claude-plugin/types/`, gitignored); `/plugin-types [dir]` writes them
elsewhere. Regenerate after an update rather than edit.

**A plugin with an unmet `dependencies` entry doesn't load at all.**
*Symptom:* `Dependency "x" is not installed` in `claude --debug`.
