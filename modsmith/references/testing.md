# Testing a mod

```sh
claude plugin validate <mod>     # manifest, hooks module source, state and types it declares
claude plugin test <mod>         # every *.test.ts / *.test.tsx under <mod>
```

The kit's API is in the generated declarations (`declare module
'claude-code/testing'`). This file is what the templates learned using it.
Working tests to copy: `templates/*/tests/`.

## How the kit is wired

A test gets the engine's own `$` and an `on` whose hooks sit **beneath**
every plugin, where the engine would be. Nothing is beneath them: a call the
test leaves unanswered throws, naming its event. Plugins load at the test's
first call on `$`, so register the test's hooks first.

```ts
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

describe('register', () => {
  test('the command answers', async ($, on) => {
    mock.store(on)
    // answer whatever else the mod calls, then drive it through $
  })
})
```

- `mock.clock(on)`, `mock.store(on, entries)`, `mock.env(on, vars)` answer
  those nouns from memory. The clock moves only on `advance(ms)` /
  `set(ms)`; `settle()` resolves what is due now without moving it.
- `test(name, { plugins, options, timeoutMs }, body)`: inline plugins beside
  yours, your `userConfig` values, a timeout (5000 ms default).
- `$.ui.mount({ plugin, surface, component, props })` draws a component
  through the plugin on a named surface; act on it by key (`press`, `input`,
  `find`) and `unmount()` it. Loop over `['terminal', 'desktop'] as const`.
  It checks the tree against each surface's element table, never the paint.

## Traps the templates hit

- **Inline plugins are loaded from their `register` function's source
  alone.** They can't close over constants in the test file; write literals
  inside. *Symptom:* `hooks module did not load: X is not defined`.
- **The test's own `$` has no `state` noun.** Read state through an inline
  probe plugin that returns it as a command's text.
- **Streaming events:** drive `$.turn.step(...)` with `.next()` until `done`
  and read `value`; after a `for await` loop, `stream.result` resolved
  `undefined` on this build.
- **Fields only the engine sets** (`isReadOnly` on a `tool.call` result)
  arrive exactly as the test's hook answers them. Set them deliberately,
  and remember that proves nothing about real tools.
- **Model calls are whatever the test answers.** A test that hooks
  `model.fork` proves your gating and parsing, not the fork's real cost or
  cache behaviour. Measure those live (`references/cost-review.md`).

## What a passing kit run does not prove

That the band looks right on screen, that real tools report what you
assumed, or what a model call really costs. Put each of those in the mod's
`DECISIONS.md` until someone has run it in a session.
