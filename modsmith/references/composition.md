# Composition: mods that play well with others

A mod is never alone. Someone installs yours next to a model router, a token
gauge and a quiz mod they found on GitHub, and every one of them hooks the
same handful of events. This file covers the rules that keep all of them
working, and what a person can expect when two mods hook the same thing. The
worked example is `templates/mode-registry` + `templates/effort-modes`.

The API itself (event shapes, `$` nouns) is in the engine's declarations and
Claude Code's own plugin-authoring skill. This file is about judgment.

## 1. Pass the chain on

`next(e)` is everyone beneath you: other plugins, then the engine. A hook
that returns without calling it has **replaced** all of them for that
dispatch.

- Not acting? `return next(e)`, first thing, before any `await` that could
  fail.
- Acting on part of the input? `return next({ ...e, changed })`, never a
  hand-built `e`. Fields you didn't think about are someone else's.
- Answering for yourself (your own command, your own tool) is the one place
  you don't call `next`. Narrow with a matcher (`{ command: 'mode' }`,
  `{ tool: 'mcp__me__x' }`) so you only ever answer your own.
- On a streaming event (`turn.step`): `return yield* next(e)` passes;
  `return yield* next({ ...e, effort })` rewrites the request. Read or rewrite
  chunks only if that's your feature. Never `yield` before `next` unless you
  mean to answer alone.

*Symptom when broken:* "installing your mod makes my other mod stop working",
or a tool that silently never runs.

## 2. Draw with others, not over them

Every drawing site has room for several plugins if each one keeps the others
in its tree.

- **Tree sites** (`AbovePrompt`, `Pane`): put `{await next(e)}` in your tree,
  usually after your own rows. When you have nothing to show, `return next(e)`.
- **Prop sites** (`SessionMode`, `PromptHint`): change the prop and pass it on.
  `next({ ...e, props: { ...e.props, modes: [...e.props.modes, 'review mode'] } })`
  adds a footer label next to everyone else's. Filtering `modes` removes one,
  so only do that to your own.
- **Yield to the engine's own claims:** `e.props.hasSurvey` on `AbovePrompt`
  means a survey holds the band. Return `next(e)`.

## 3. Own your state; let others change it only through `state.set`

`$.state` is the shared memory between mods, and its rules are what make
composition safe:

- **Only the owner writes.** `$.state.set` on another plugin's value is
  refused. Don't work around it.
- **Anyone reads.** `$.state.get({ plugin: 'mode-registry', key: 'active' })`
  works from any plugin (verified in the test kit and live). An unowned or
  never-written value reads `undefined` at version 0, which is how a dependent
  survives the owner not being installed.
- **Others change your value by hooking your write.**
  `on('state.set', { plugin: 'owner', key: 'k' }, ($, e, next) => next({ ...e, value }))`.
  This one mechanism gives you three patterns:
  - *contribute*: the owner writes a base value (`[]`) and each hook folds
    its piece in (mode-registry's catalog)
  - *veto or redirect*: a hook rewrites the value to something else (a policy
    mod that refuses `yolo` mode)
  - *observe*: a hook that passes `e` unchanged and reacts
- **Report what landed, not what you asked for.** After your own
  `$.state.set`, read the value back in the same dispatch (it reflects the
  write, vetoes included; verified). Tell the person if someone overruled them.
- `plugin` and `key` must be **string literals at the call site** (or in a
  `const` in the same file). The engine reads them off the source so
  `claude plugin validate` can list what you read and write. A computed key
  fails to load.

## 4. Order: what happens when two mods hook the same event

Order is nesting: **first registered is outermost.** Across plugins the tiers
go `prepend → user → append → builtin → core`, and within a tier plugins go
in load order. `--plugin-dir A --plugin-dir B` put B beneath A in one live run
(a probe loaded after effort-modes saw the effort effort-modes had rewritten).
Within one plugin, its own `on(...)` calls nest in the order written.

What a person can expect:

| Both mods... | Result |
| --- | --- |
| pass `next(e)` | both run; the outer one sees the inner one's result |
| rewrite the input (`effort`, `command`, `value`) | the inner one's rewrite is what reaches the engine: inner wins on the way down |
| rewrite the result (`turn.complete`'s `text`) | the outer one's rewrite is what's shown: outer wins on the way up |
| draw with `{await next(e)}` | both drawings show, outer above inner (or wherever the outer one put `next`) |
| one answers without `next` | everything beneath it is gone for that dispatch |
| one throws or overruns its budget | it's skipped as if it never registered; the rest carry on (fail open) |

A mod can't reorder itself. If your mod's correctness depends on its position
("must be the last word on effort"), say so in its README and note the conflict
it would have. Don't try to fight for position.

## 5. Publish a contract others can import

If another plugin is meant to read your state or call your noun, the types
are the contract:

- One **self-contained** `types/index.d.ts`, with no imports or references. It
  exports your types at top level and declares what you own:
  `declare module 'claude-code' { interface PluginState { 'my-mod': { ... } } }`
  for state, `interface EngineInterface { myNoun: MyNoun }` for a noun added in
  `engine.create`. Lead the exported names with your noun's or plugin's name
  (`ModeSpec`, `TopoRun`).
- Name it in `plugin.json`: `"types": "./types/index.d.ts"`. `claude plugin
  validate` then prints what it declares (`declares state: mode-registry.catalog, ...`).
- **Dependents never copy it.** Two ways to get it typed:
  - List the owner in the dependent's `plugin.json`:
    `"dependencies": ["mode-registry"]`. When the engine loads the dependent
    from a folder, it writes the owner's contract into
    `.claude-plugin/types/<owner>/` beside its own declarations, and the
    `tsconfig.json` it writes there includes it. effort-modes does this
    (verified on 2.1.287: `tsc -p tsconfig.json` fails without the field and
    passes with it). The cost: a plugin with an unmet dependency doesn't load
    at all ("Dependency ... is not installed" in the debug log). Use it when
    your mod is pointless without the owner.
  - Leave the dependency out and run `/plugin-types` in a session where the
    owner is enabled: it copies every enabled plugin's contract into
    `.claude/types/claude-code-plugins/`. Use this when your mod should also
    run alone.

  Either way, `claude plugin validate` on a dependent says "state of other
  plugins, not checked" unless it runs in a session with the owner enabled,
  which is expected.
- **Change it additively.** Add optional fields and new keys. Renaming or
  retyping a key breaks dependents without warning at load. Bump the major
  version and say so in the README.
- Document the contract in prose in the README too: who writes, who may hook,
  what `null` means, what happens when you're not installed.

**Choosing between a `$.state` contract and a noun on `$`:** reach for
state first. A noun's methods are built in `engine.create`, where `$` is
empty, so they can't call `$.state` or redraw, and dependents must guard the
noun being absent. A noun earns its place when the contract is an *action*
with a result (`$.topo.run(...)`), not shared data. mode-registry's
DECISIONS.md walks through this choice.

## 6. Never let a rejection escape

A rejection nobody catches fails the hook that started it (the engine skips
it and the chain goes on without you), and a fire-and-forget promise has no
hook to land in at all, so your feature quietly stops for that dispatch.

- `.catch` every `$` promise you don't return: `$.command.register(...)`,
  writes in `onPress` handlers (`void update(...).catch(log)`), timers.
- In a hook, a thrown error is caught by the engine (you're skipped), but
  you've lost your behaviour for that dispatch. Wrap reads you can live
  without and fall back to pass-through.
- `on(...).catch(handler)` answers in place of a failed hook when failing
  open is wrong for you.

## 7. Cache etiquette between mods

Mods share one prompt cache, the main thread's, and forks (`$.model.fork`)
read it too. A mod that changes what the main thread sends changes everyone's
cache bill:

- **Changing request parameters** (`effort` or `model` on `turn.step`, the
  system prompt via `prompt.section`) re-writes the cached conversation on the
  next request. effort-modes measured about 10k tokens re-written on one
  switch in a 37k-token session. Do it at task boundaries, never per turn, and
  latch the value at `turn.start` so it can't change mid-turn.
- **Adding context:** append it (a user-role row through `$.session.append`, a
  command's `context`). An append never invalidates what came before. Text
  spliced into the system prompt invalidates everything after it.
- **Say it in your README.** "Costs one cache rebuild per switch" is the
  sentence that lets someone install your mod next to a fork-based one without
  a surprise bill.

## 8. Testing composition

`claude plugin test` loads **inline plugins** beside yours:
`test(name, { plugins: [other] }, async ($, on) => ...)`. Use them to stand in
for the mods yours composes with: an offerer, a vetoer, a fake owner of the
state you read. That's how `templates/mode-registry/tests` proves the
fold, the veto and the cross-plugin read.

Two traps:

- **An inline plugin is loaded from its `register` function's source alone.**
  It can't close over constants in the test file. Write every literal
  (`{ plugin: 'mode-registry', key: 'catalog' }`) inside it.
  *Symptom:* `hooks module did not load: CATALOG is not defined`.
- **The test's own `$` has no `state` noun.** To read state from a test, have
  an inline probe plugin read it in a command hook and return it as text.
- To drive a streaming event from a test, iterate `$.turn.step(...)` with
  `.next()` until `done` and read `value`. In this build, `stream.result`
  resolved `undefined` after a `for await` loop.

## Worked example: the mode registry

`templates/mode-registry` is a `/mode` switch any plugin can offer a mode to.
`templates/effort-modes` offers three. Here is how each rule above shows up:

| Rule | In the code |
| --- | --- |
| Own your state | the registry owns `catalog`, `active`, `isPicking`; nobody else writes them |
| Contribute via `state.set` | effort-modes hooks the catalog write: `next({ ...e, value: [...e.value.filter(notOurs), ...ours] })` |
| Veto via `state.set` | any plugin can hook `active`; `/mode` reads back what landed and reports the veto |
| Survive absence | effort-modes declares the registry as a dependency, so it isn't loaded without it; and if `active` reads `undefined` anyway, every step passes through |
| Draw with others | the footer label is appended to `e.props.modes`; the picker draws `{await next(e)}` beneath it |
| Answer only your own | `command.run` matched on `{ command: 'mode' }` answers without `next`; everything else passes |
| Pass the chain on | effort-modes' `turn.step` is `return yield* next(...)`, rewriting `effort` only for its own modes, only on the main thread |
| Cache etiquette | effort is latched at `turn.start`; the README tables the measured cost of a switch |
| Publish a contract | `types/index.d.ts` declares `PluginState['mode-registry']` and exports `ModeSpec`; `plugin.json` names it |
| Switch from code | an auto-router calls `$.command.run({ command: 'mode', args: 'review' })`, the same path and vetoes as a person |

The behaviour of a mode never lives in the registry. The registry stores an
id; the plugin that offered the mode reads it and acts. That is what lets
any number of strangers' plugins share one switch.
