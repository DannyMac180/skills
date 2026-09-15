# Testing a mod

```sh
claude plugin test .          # run this mod's tests/
claude plugin validate .      # marketplace manifest
claude plugin validate .claude-plugin/plugin.json   # hooked events, $ calls, surface modules
```

## How the kit is wired

A test gets the engine's own `$` and the plugin's `on`. Every call on `$` is
one the engine really makes, through every hook of the mod as it ships. The
hooks the *test* registers with `on` sit **beneath** the mod — where the rest
of the world would be — and nothing is beneath them. A call the test leaves
unanswered throws, naming its event. That is the design: you cannot
accidentally test against a stub you forgot to write.

## Layout

A test file is named for what it covers under `hooks/` — `register.test.ts`
beside `hooks/register.ts`, `git.test.ts` beside `hooks/git/` — and holds its
imports, the tier the mod loads in, and one `describe` titled with that name.
Shared fixtures live in `tests/fixtures/`, one export per file.

```ts
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

describe('register', () => {
  test('the command answers without touching the model', async ($, on) => {
    mock.clock(on)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const { text } = await $.command.run({
      command: 'my-command',
      args: '',
      origin: { kind: 'composer' },
    })

    expect(text).toContain('expected')
  })
})
```

## `mock`

Answers the world beneath the mod from memory, noun by noun. Each member is a
plain function over `on` that registers hooks where you call it.

| Call | Provides |
| --- | --- |
| `mock.env(on, variables)` | `$.env` |
| `mock.store(on, entries)` | `$.store` |
| `mock.clock(on)` | `$.clock`, with `advance(ms)` |

`clock.advance(ms)` resolves every wait the mod asked for — `$.clock.sleep`,
`after`, `every` — as the clock crosses it.

To inspect a dispatch *before* it answers: start it unawaited, `await
clock.settle()`, then look. The clock stays where it was.

`$.ui.press({ plugin, key })` presses a `Button` the test rendered, exactly as
a click in the terminal does.

## Testing across mods

A mod that calls another's noun seats a provider for it in the test: an inline
plugin whose `engine.create` hook adds the noun, answering calls the way it
answers the engine's.

```ts
on('telemetry.log', ($, e) => ({ value: undefined }))
```

With no provider loaded, the `$` build refuses the hook and names the noun
nobody provides.
