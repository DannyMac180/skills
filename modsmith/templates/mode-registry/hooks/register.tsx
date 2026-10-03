import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModeSpec } from '../types'

// The contract, in three values this plugin owns. Other plugins read them and
// change them only through state.set hooks (see README: "Offering a mode").
const CATALOG = { plugin: 'mode-registry', key: 'catalog' } as const
const ACTIVE = { plugin: 'mode-registry', key: 'active' } as const
const PICKING = { plugin: 'mode-registry', key: 'isPicking' } as const

const catalog = atom(CATALOG, [] as ModeSpec[])
const active = atom(ACTIVE, null)
const isPicking = atom(PICKING, false)

const OFF = new Set(['off', 'none', 'clear'])

const log = ($: EngineInterface, what: string) => (err: unknown) => {
  $.ui.log(`mode-registry: ${what}: ${err}`)
}

// Writing the empty list is the whole refresh: every plugin that offers a mode
// hooks this write and adds its own, so what lands is the fold of all offers.
const refresh = async ($: EngineInterface) => {
  await $.state.set(CATALOG, []).catch(log($, 'catalog refresh failed'))
  return read($, catalog).catch(() => [] as ModeSpec[])
}

const labelOf = (modes: ModeSpec[], id: string) => modes.find(m => m.id === id)?.label ?? id

const listing = (modes: ModeSpec[], current: string | null) => {
  if (modes.length === 0) return 'No plugin offers a mode yet.'

  const rows = modes.map(m => `${m.id === current ? '*' : ' '} ${m.id}  ${m.label}: ${m.description} (${m.owner})`)

  return [`Modes (current: ${current ?? 'off'}):`, ...rows, '/mode <id> to switch, /mode off to clear.'].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    await $.command
      .register({ name: 'mode', description: 'Switch mode (any plugin can offer one)', argumentHint: '[id|off|list]' })
      .catch(log($, '/mode not registered'))
    await refresh($)

    return result
  })

  // Our own command: answered here, never passed on.
  on('command.run', { command: 'mode' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const modes = await refresh($)
    const current = await read($, active).catch(() => null)

    if (arg === '') {
      await $.state.set(PICKING, true).catch(log($, 'picker failed to open'))
      return { text: 'Pick a mode above the prompt, or /mode list.' }
    }

    if (arg === 'list') return { text: listing(modes, current) }

    if (OFF.has(arg)) {
      await $.state.set(ACTIVE, null).catch(log($, 'mode not cleared'))
      return { text: 'Mode off.' }
    }

    const spec = modes.find(m => m.id === arg)

    if (!spec) return { text: `No mode "${arg}".\n${listing(modes, current)}` }

    await $.state.set(ACTIVE, spec.id).catch(log($, 'mode not set'))

    // Another plugin may have rewritten the write (a veto), so report what landed.
    const landed = await read($, active).catch(() => current)

    if (landed !== spec.id) return { text: `Another plugin kept ${spec.label} from switching on; mode is ${landed ?? 'off'}.` }

    return { text: `Mode: ${spec.label}. ${spec.description}` }
  })

  // The compact display: one dim label in the prompt footer, beside the
  // engine's own and any other plugin's, never instead of them.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const id = await read($, active)

    if (id === null) return next(e)

    const label = labelOf(await read($, catalog), id).toLowerCase()

    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, `${label} mode`] } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isPicking))) return next(e)

    const [modes, current] = await Promise.all([read($, catalog), read($, active)])
    const { Box, Button, Text } = $.ui.resolve(e)

    // Handlers write; a render never does. Each catches, so a failed write
    // logs instead of rejecting into the engine.
    const choose = (id: string | null) => () => {
      void Promise.all([update($, active, () => id), update($, isPicking, () => false)]).catch(log($, 'pick failed'))
    }
    const close = () => {
      void update($, isPicking, () => false).catch(log($, 'picker failed to close'))
    }
    const hotkey = (i: number) => (i < 9 ? { hotkey: String(i + 1) } : {})

    return (
      <Box flexDirection="column">
        <Box flexDirection="column">
          <Text bold>Mode: {current === null ? 'off' : labelOf(modes, current)}</Text>
          {modes.length === 0 ? <Text dimColor>No plugin offers a mode yet.</Text> : null}
          {modes.map((m, i) => (
            <Box key={`row-${m.id}`}>
              <Button key={`mode-${m.id}`} label={m.label} {...hotkey(i)} variant={m.id === current ? 'primary' : 'secondary'} onPress={choose(m.id)} />
              <Text dimColor wrap="truncate-end"> {m.description}</Text>
            </Box>
          ))}
          <Box>
            <Button key="mode-off" label="Off" hotkey="0" onPress={choose(null)} />
            <Button key="mode-close" label="Close" role="dismiss" onPress={close} />
          </Box>
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
