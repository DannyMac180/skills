import { expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'

// Inline plugins load as modules of their own, from their register's source,
// so everything they use is written inside it: no consts from this file.
// A stand-in for any plugin that offers a mode, written exactly as the README
// tells a real one to: hook the registry's catalog write and add yourself.
const offerer: Plugin = {
  name: 'offerer',
  register: on => {
    on('state.set', { plugin: 'mode-registry', key: 'catalog' }, ($, e, next) =>
      next({
        ...e,
        value: [
          ...e.value.filter(m => m.id !== 'focus'),
          { id: 'focus', label: 'Focus', description: 'Fewer interruptions', owner: 'offerer' },
        ],
      }),
    )
  },
}

// The test's own $ has no state noun, so a second stand-in reads the
// registry's values the way any dependent would, and reports them.
const probe: Plugin = {
  name: 'probe',
  register: on => {
    on('command.run', { command: 'probe' }, async $ => {
      const { value: modes = [] } = await $.state.get({ plugin: 'mode-registry', key: 'catalog' })
      const { value: active = null } = await $.state.get({ plugin: 'mode-registry', key: 'active' })
      return { text: JSON.stringify({ ids: modes.map(m => m.id), active }) }
    })
  },
}

const PLUGINS = { plugins: [offerer, probe] }

const seen = async ($: Engine) => {
  const { text = '{}' } = await $.command.run({ ...run(''), command: 'probe' })
  return JSON.parse(text) as { ids: string[]; active: string | null }
}

const run = (args: string) => ({
  command: 'mode',
  args,
  origin: { kind: 'composer' } as const,
  presentation: { isFullscreen: false, columns: 80 },
})

test('an offered mode lands in the catalog and /mode switches to it', PLUGINS, async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'mode' } }))

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  expect(await seen($)).toEqual({ ids: ['focus'], active: null })

  const set = await $.command.run(run('focus'))
  expect(set.text).toBe('Mode: Focus. Fewer interruptions')
  expect((await seen($)).active).toBe('focus')

  const unknown = await $.command.run(run('nope'))
  expect(unknown.text).toContain('No mode "nope"')
  expect((await seen($)).active).toBe('focus')

  await $.command.run(run('off'))
  expect((await seen($)).active).toBe(null)
})

test('the footer gains a label beside the ones already there', PLUGINS, async ($, on) => {
  let drawn: readonly string[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'mode' } }))
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    drawn = e.props.modes
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.modes.join(' & ')}</Text>
  })

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run(run('focus'))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'mode-registry', surface, component: 'SessionMode', props: { modes: ['memory paused'] } })
    expect(drawn).toEqual(['memory paused', 'focus mode'])
    await ui.unmount()
  }
})

test('the picker draws the offered modes and a press switches', PLUGINS, async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'mode' } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run(run(''))

  const BAND = {
    plugin: 'mode-registry',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 19 }, view: {} },
  } as const

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ key: 'mode-focus' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'mode-focus' })
  await ui.unmount()

  expect((await seen($)).active).toBe('focus')
})

// A plugin that does not own `active` can still overrule a switch: it hooks the
// write and rewrites the value, which is the contract's only way in.
const guard: Plugin = {
  name: 'guard',
  register: on => {
    on('state.set', { plugin: 'mode-registry', key: 'active' }, ($, e, next) =>
      next(e.value === 'focus' ? { ...e, value: null } : e),
    )
  },
}

test('another plugin can veto a switch through a state.set hook', { plugins: [offerer, probe, guard] }, async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'mode' } }))

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const { text } = await $.command.run(run('focus'))

  expect(text).toContain('kept Focus from switching on')
  expect((await seen($)).active).toBe(null)
})
