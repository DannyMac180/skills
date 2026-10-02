# mode-registry

One `/mode` switch that every plugin can offer a mode to. You install the
registry once; a model router, an "artifact mode", or the effort modes beside
this template each add their own mode to it. You see the active mode as a dim
label in the prompt footer (`review mode`, beside `focus` and the others) and
switch with `/mode`.

This is the "mods composing" pattern: the registry doesn't know what any mode
does. It keeps the list and the current choice. Each plugin reads the choice
and changes its own behaviour.

## What you can do

| You type | What happens |
| --- | --- |
| `/mode` | Opens a picker above the prompt: one button per mode (hotkeys `1`-`9`, `0` for off) and Close. Click it or press ctrl+x tab to give it the keys. |
| `/mode review` | Switches to the mode with id `review`. The footer reads `review mode`. |
| `/mode off` | Clears the mode (`none` and `clear` work too). |
| `/mode list` | Prints every mode on offer, the plugin that offers it, and which one is on. |

The active mode lives in `$.state` for the session and isn't saved between
sessions (to save it, write it to `$.store` as well). The registry doesn't
reset it on `/clear`. Whether the engine keeps `$.state` across a `/clear` has
not been checked.

## What it costs

**No model calls, ever.** The footer label and the picker are UI only and
never enter the context. Each `/mode` command adds one short line to the
transcript, which the model reads (about 10-20 tokens; `/mode list` is about
15 tokens per mode). A press in the picker adds nothing: it switches the mode
silently, so the model isn't told (use `/mode <id>` when you want it to know). That line is appended after the cached prefix, so it never
breaks the prompt cache. Whatever a *mode* costs is up to the plugin that
offers it. For example, effort-modes' switch costs one cache rebuild (see its
README).

## Offering a mode from your plugin

The contract is `types/index.d.ts`. It has three values this plugin owns:

- `mode-registry.catalog`: `ModeSpec[]`, every mode on offer
- `mode-registry.active`: `string | null`, the active mode's id
- `mode-registry.isPicking`: `boolean`, whether the picker is open

Only the registry writes them. You offer a mode by hooking the registry's
write to `catalog` and adding yours:

```ts
on('state.set', { plugin: 'mode-registry', key: 'catalog' }, ($, e, next) =>
  next({
    ...e,
    value: [
      ...e.value.filter(m => m.id !== 'router'),
      { id: 'router', label: 'Router', description: 'Picks the model per turn', owner: 'my-router' },
    ],
  }),
)
```

Then read the active mode wherever your behaviour lives:

```ts
const { value: active = null } = await $.state.get({ plugin: 'mode-registry', key: 'active' })
if (active !== 'router') return next(e)
```

Some details that matter:

- **Filter your own id before adding it.** The registry rewrites the catalog at
  session start and on every `/mode`. Filtering first keeps your offer from
  appearing twice.
- **Read `active` in the hook that acts.** Don't copy it into a module variable
  you keep across turns: a hot reload wipes module variables, and a value read
  inside a `ui.render` subscribes you to redraws.
- **If the registry isn't installed, nothing breaks.** `active` reads as
  `undefined` at version 0, your `state.set` hook never fires, and your plugin
  runs its default behaviour.
- **To switch modes from code** (an auto-router that flips to `review` when it
  sees a diff), call `$.command.run({ command: 'mode', args: 'review' })`. It
  goes through the same path and the same vetoes as the person typing it. It
  queues until the session is idle.
- **To refuse or redirect a switch**, hook `state.set` on
  `{ plugin: 'mode-registry', key: 'active' }` and pass `next` another `value`.
  `/mode` reports what actually landed, so the person sees the veto.

For type-checking, list the registry in your `plugin.json`:
`"dependencies": ["mode-registry"]`. The engine then writes this contract into
your plugin's `.claude-plugin/types/mode-registry/` when it loads it from your
folder, and your `tsconfig.json` picks it up (effort-modes does this). The
catch: a plugin with that dependency doesn't load at all without the registry.
If yours should also work alone, leave the dependency out and run
`/plugin-types` in a session where mode-registry is enabled instead. Never
copy the file into your plugin by hand.

## Composes with

- **effort-modes** (beside this template): offers `ui`, `api` and `review`.
- Any plugin that draws in the `SessionMode` footer or the `AbovePrompt` band.
  The registry adds its label to `e.props.modes` and passes the rest on, and
  draws `{await next(e)}` under its picker.

## Install / load

```sh
claude plugin validate templates/mode-registry
claude plugin test templates/mode-registry           # 4 tests, incl. a veto from a third plugin
claude --plugin-dir templates/mode-registry --plugin-dir templates/effort-modes
```

Function hooks are early access. If your build doesn't load hooks modules by
default, set `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. That setting loads the
hooks module of every installed plugin that ships one, not only this one.
