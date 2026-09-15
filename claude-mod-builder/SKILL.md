---
name: claude-mod-builder
description: >
  Build, test, and ship a Claude Mod — a Claude Code plugin whose behaviour
  lives in a function-hooks module, hooking the engine's events as TypeScript
  functions ($, e, next). Scaffolds the plugin layout, picks the right event
  and tier, writes the hook, wires drawing above the prompt or in a pane, and
  runs the plugin test kit. USE WHEN: build a claude mod, write a function
  hook, claude code plugin that draws, hook tool.call, hook ui.render,
  AbovePrompt band, plugin-types, claude plugin test, mod tiers, next.to,
  engine.create, add a noun to $, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS. NOT FOR:
  classic shell-command hooks in settings.json (PreToolUse etc. — those need
  no module), writing a plain skill or slash command, or MCP server authoring.
---

# Claude Mod Builder

A **mod** is an ordinary Claude Code plugin that ships a *hooks module*: one
`register(on, options)` entry that hooks the engine's events as functions
`($, e, next)`. Function hooks are Express/Koa middleware for the CLI itself.

> **Early access.** Hooks modules load only where function hooks are enabled,
> and the API can change between releases without notice. Requires Claude Code
> **2.1.269+** for drawing above the prompt, and
> `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.

## The model in four facts

1. **`$` is the only way out.** No ambients. A Bun Worker wraps the plugin
   realm and each plugin gets a `node:vm` wrapper, so `import fs` is
   mechanically impossible. Every side effect is a call on `$`, which is what
   makes admin audit, allowlist and deny possible.
2. **Registration order is nesting.** First registered wraps the rest — an
   onion. Prepend for control, append for defaults. Five tiers, outermost
   first: `prepend → user → append → builtin → core`.
3. **`next` is the continuation.** Call it to pass down, don't call it to stop,
   call it twice to retry, don't `await` it to run concurrently with the chain
   below. `next.to(e, "core")` skips tiers.
4. **The engine fails open.** Throw, overrun the time budget, or return the
   wrong shape and the engine logs it and routes *around* you, as if you had
   never registered. Fail-closed is something you construct, never something
   you declare.

## Before writing anything

Establish these three, in order. Do not guess any of them.

| Question | How to answer it |
| --- | --- |
| Which event? | `references/api.md` → event inventory. Pick the narrowest one. |
| Which tier? | User plugin → `user`. Policy that must not be escapable → managed `prependPlugins`. Redaction that must win → appended, so it sits *beneath* everything. |
| What on `$`? | Run `/plugin-types` in a session with hooks on; it writes the real `claude-code.d.ts`. Read it. |

`/plugin-types` is the source of truth. This skill's reference is a map, not
the territory — when they disagree, the generated declarations are right.

## Build

### 1. Scaffold

Copy `templates/minimal/` and rename. The layout is fixed:

```
my-mod/
  .claude-plugin/plugin.json    # name, version, description, author
  hooks/hooks.json              # { "description": "...", "modules": ["./register.ts"] }
  hooks/register.ts             # export const register: Register = on => { ... }
```

Use `register.tsx` and a `/* @jsx h */` pragma if the mod draws.

### 2. Write the hook

The whole contract is one function per event:

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (isDangerous(e.input.command)) return { deny: 'blocked by policy' }
    return next(e)
  })
}
```

Three semantics that are load-bearing, and that people get wrong:

- **On `tool.call` you are responsible for calling the tool.** Not calling
  `next(e)` is what stops it. `deny` only tells the *model* what happened; the
  engine's check is literally `result.deny === undefined`.
- **A second argument narrows.** `on('tool.call', { tool: 'Bash' }, fn)` and
  `on('ui.render', { component: 'AbovePrompt' }, fn)`. Narrow at registration,
  not with an `if` inside the hook.
- **Always pass the chain on when you are not acting.** A hook that returns
  without calling `next(e)` has silently replaced everything beneath it,
  including other people's plugins and the engine's own behaviour.

### 3. Draw (optional)

Two sites: the `AbovePrompt` band (terminal only, ~half the terminal height)
and a `Pane` beside the transcript. Resolve the element kit from the event:

```tsx
on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
  if (e.props.hasSurvey || e.surface !== 'terminal') return next(e)
  const { Box, Text } = await $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Text dimColor>hello from a mod</Text>
      {await next(e)}
    </Box>
  )
})
```

`{await next(e)}` in the tree is how you draw *with* other plugins instead of
over them. `e.props.isWorking` is true while a model turn runs;
`e.props.maxRows` and `e.props.bodyColumns` are your budget. Redraw with
`$.ui.invalidate('ui.render')` — the render result is cached otherwise.

For anything needing keys or the mouse, put it in a **surface module** and
mount it with `<Client module="./boards/thing.tsx" … />`. See
`references/gotchas.md` first — surface modules have two rules that will
silently break your mod.

### 4. Test and validate

```sh
claude plugin validate .claude-plugin/plugin.json   # lists hooked events, $ calls, surface modules
claude plugin test .                                # the test kit
claude --plugin-dir .                               # load from source for one session
```

The kit hands a test the engine's real `$` and an `on` that registers
*beneath* the mod, where the rest of the world would be. Nothing is beneath
that: an unanswered call throws, naming its event. `references/testing.md` has
the shape.

### 5. Ship

A repo can be its own marketplace:

```sh
claude plugin marketplace add <owner>/<repo>
claude plugin install <plugin>@<marketplace>
```

Enable function hooks in `~/.claude/settings.json` (this also loads the hooks
module of every *other* installed plugin that ships one — say so when telling
someone to set it):

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

## Gotchas

Read `references/gotchas.md` before debugging anything. The short list:

- **Never name a local variable `h`** in a file that draws. Every JSX tag
  compiles to a call of `h`; a local `h` breaks the tree at its first draw.
- **`Client` module paths must be string literals.** The engine reads them off
  the source, so a computed path resolves to nothing.
- **`$.clock.now()` returns a `Promise<number>`.** Await it. Published examples
  in the wild get this wrong and silently produce `NaN` arithmetic.
- **A `$.store` failure must not reject into the engine.** An unhandled
  rejection unmounts the whole module. Catch and `$.ui.log`.
- **The band is ~half the terminal and redraws ~10×/second.** Budget for it.
- **Nothing draws in `claude -p`**, the desktop app, or mobile. Gate on
  `e.surface !== 'terminal'`.

## Reference

- `references/api.md` — event inventory, `$` noun inventory, tier semantics
- `references/gotchas.md` — the undocumented traps, with symptoms
- `references/testing.md` — the plugin test kit and `mock`
- `templates/minimal/` — a complete, valid, do-nothing mod to copy

## Sources

Design RFC and semantics: [anthropics/claude-code#91870](https://github.com/anthropics/claude-code/issues/91870).
First-party mod source: [`mods/`](https://github.com/anthropics/claude-code/tree/main/mods)
(`telemetry` is the smallest complete example; `diff` is a real feature).
