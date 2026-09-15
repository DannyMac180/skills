# Gotchas

Each entry is a real trap with its symptom, so you can search by what you see.

## Drawing

**A local variable named `h` breaks the board at its first draw.**
Every JSX tag compiles to a call of `h`. Shadow it and the tree dies.
*Symptom:* one line naming your plugin and module where the tree should be.

**`Client` module paths must be string literals.**
The engine reads them off the source, statically. A computed or imported path
resolves to nothing.
*Symptom:* the Client region draws empty, no error.

**The render result is cached.**
Props, viewport width, and plugin load invalidate it. Nothing else does.
*Symptom:* state changes, display doesn't. *Fix:* `$.ui.invalidate('ui.render')`.

**`{await next(e)}` belongs in your tree.**
Omit it and you have replaced every other plugin's drawing at that site.
*Symptom:* installing your mod makes another one disappear.

**Nothing draws outside an interactive terminal.**
`claude -p`, the desktop app and mobile draw their own band.
*Fix:* `if (e.surface !== 'terminal') return next(e)`.

**The band is about half the terminal and redraws ~10×/second.**
Budget your work per draw accordingly; a surface module runs under a per-call
time budget and an overrun unmounts the instance.

## Async

**`$.clock.now()` returns `Promise<number>`.** Await it.
*Symptom:* `NaN` in arithmetic, timestamps that are `[object Promise]`.
Published examples in the wild get this wrong.

**An unhandled rejection unmounts the whole module.**
`$.store` reads and writes can fail. Catch every one.
```ts
const stored = (k: string) =>
  $.store.get(k).catch(err => { $.ui.log(`store read failed: ${err}`); return undefined })
```

**Not awaiting `next(e)` is how you get concurrency.**
Kick it off, do your own work, then return it. You are forced to await only
when you must transform the result.

## Semantics

**`deny` does not stop a tool.** Not calling `next(e)` stops it. `deny` is the
message to the *model*. The engine's test is `result.deny === undefined`.

**The engine fails open.** Throw, overrun, or return the wrong shape and you
are skipped — the chain proceeds as if you had never registered. The three
skip causes are all within your control to prevent. For fail-closed, construct
it: a `Promise.race` against `$.clock.sleep`, or a `.catch` on the hook.

**The model sees what it asked to write, not what you rewrote.**
This is for prompt-caching reasons. If you changed a tool's input, say so via
the `context` attribute on the `tool.call` return, or Claude will be confused.

**`next(e)` twice runs the chain below twice.** Intended, for retry and
backoff. Don't do it by accident.

**A hook cannot reorder itself.** Order is the admin's and the dependency
graph's. There is no way to move yourself down the chain.

## Environment

**Enabling function hooks is global.** Setting
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` loads the hooks module of *every*
installed plugin that ships one, not just yours. Tell people that when you ask
them to set it.

**Type checking needs generated types.** `/plugin-types` writes them (commonly
into a git-ignored `.claude/types/`). Point your tsconfig at that, then
`tsc -p .`.

**Edits hot-reload into a running session.** If a reload fails partway the
transcript says so; restart the session rather than debugging a half-loaded
module.
