import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine, Plugin } from 'claude-code/testing'

// A stand-in for mode-registry: it owns the same two values and changes them
// on two commands. Inline plugins load from their register's source alone, so
// every literal is written inside it.
const registry: Plugin = {
  name: 'mode-registry',
  register: on => {
    on('command.run', { command: 'mode' }, async ($, e) => {
      await $.state.set({ plugin: 'mode-registry', key: 'active' }, e.args === 'off' ? null : e.args)
      return { text: e.args }
    })
    on('command.run', { command: 'catalog' }, async $ => {
      await $.state.set({ plugin: 'mode-registry', key: 'catalog' }, [])
      const { value = [] } = await $.state.get({ plugin: 'mode-registry', key: 'catalog' })
      return { text: value.map(m => `${m.id}:${m.owner}`).join(',') }
    })
  },
}

const command = ($: Engine, name: string, args = '') =>
  $.command.run({ command: name, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

// Runs one step to its end and answers what effort reached the bottom, where
// the engine would send the request.
const stepEffort = async ($: Engine, turnId: string, extra: { agentId?: string } = {}) => {
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 3, ...extra })
  let step = await stream.next()
  while (!step.done) step = await stream.next()
  return step.value.answer
}

const engine = (on: On) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: String(e.effort), toolUses: [], stopReason: null, usage: null }
  })
}

test('offers ui, api and review in the catalog', { plugins: [registry] }, async ($, on) => {
  engine(on)
  const { text } = await command($, 'catalog')
  expect(text).toBe('ui:effort-modes,api:effort-modes,review:effort-modes')
})

test('each mode sends its effort on the main thread', { plugins: [registry] }, async ($, on) => {
  engine(on)

  const cases = [['ui', 'low'], ['api', 'medium'], ['review', 'max'], ['off', 'medium']] as const

  for (const [mode, effort] of cases) {
    await command($, 'mode', mode)
    await $.turn.start({ text: 'go', turnId: `t-${mode}` })
    expect(await stepEffort($, `t-${mode}`)).toBe(effort)
  }
})

test('a switch mid-turn waits for the next turn', { plugins: [registry] }, async ($, on) => {
  engine(on)

  await command($, 'mode', 'review')
  await $.turn.start({ text: 'go', turnId: 't1' })
  await command($, 'mode', 'ui')

  expect(await stepEffort($, 't1')).toBe('max')

  await $.turn.start({ text: 'again', turnId: 't2' })
  expect(await stepEffort($, 't2')).toBe('low')
})

test('subagents keep their own effort', { plugins: [registry] }, async ($, on) => {
  engine(on)

  await command($, 'mode', 'review')
  await $.turn.start({ text: 'go', turnId: 't1' })

  expect(await stepEffort($, 't1', { agentId: 'a1' })).toBe('medium')
})

test('without mode-registry it changes nothing', async ($, on) => {
  engine(on)

  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await stepEffort($, 't1')).toBe('medium')
})
