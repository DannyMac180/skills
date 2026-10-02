import { expect, mock, test } from 'claude-code/testing'

const TOOL = 'mcp__assumption-ledger__register_assumption'
// The kit's command.run input types origin and presentation, which the engine stamps.
const assumptions = ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, args: string) =>
  $.command.run({ command: 'assumptions', args } as never)

const props = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 19 }, view: {} }

test('records, draws, follows up, lists, writes, turns off', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 0 })
  const logs: string[] = []
  const submitted: string[] = []
  const written: Record<string, string> = {}
  const descriptions: string[] = []
  on('session.id', () => ({ value: 'sess-1' }))
  on('ui.log', (_$, e) => { logs.push(e.text); return { value: undefined } })
  on('ui.invalidate', () => ({ value: undefined }))
  on('tool.register', (_$, e) => { descriptions.push(e.description); return { value: { tool: `mcp__assumption-ledger__${e.name}` } } })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_$, e) => { written[e.path] = e.text; return { value: undefined } })
  on('prompt.submit', (_$, e) => { submitted.push(e.text); return { text: e.text } as never })
  on('command.run', () => ({ text: 'engine' }))
  on('tool.describe', (_$, e) => ({ description: e.description }))
  on('session.start', () => ({ cwd: '/' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', { component: 'AbovePrompt' }, (_$, _e) => {
    const { Text } = _$.ui.resolve(_e)
    return <Text>below</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(descriptions.length).toBe(2)
  expect(descriptions[0]).toBe(descriptions[1])

  const described = await $.tool.describe({ tool: TOOL, description: 'x', provider: { plugin: 'assumption-ledger', tier: 'user' } as never })
  expect(described.isDeferred).toBe(false)

  await $.turn.start({ text: 'go', turnId: 't1' })
  const bad = await $.tool.call({ tool: TOOL, kind: 'nope', text: 'x' })
  expect(bad.isError === true || bad.deny !== undefined).toBe(true)
  await $.tool.call({ tool: TOOL, kind: 'considered-not-done', text: 'Add retry on 429', why: 'out of scope' })
  await $.tool.call({ tool: TOOL, kind: 'assumption', text: 'Node 20 is the runtime' })

  const busy = await $.ui.mount({ plugin: 'assumption-ledger', surface: 'terminal', component: 'AbovePrompt', props: { ...props, isWorking: true } })
  expect(await busy.find({ type: 'Text', text: /Add retry/ })).toBeUndefined()
  await busy.unmount()

  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'assumption-ledger', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ type: 'Text', text: /Add retry on 429/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /below/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'assumption-ledger', surface: 'terminal', component: 'AbovePrompt', props })
  await ui.press({ key: 'do-0' })
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Add retry on 429')
  expect(await ui.find({ type: 'Text', text: /Add retry on 429/ })).toBeUndefined()
  await ui.press({ key: 'dismiss' })
  expect(await ui.find({ type: 'Text', text: /Node 20/ })).toBeUndefined()
  await ui.unmount()

  const listed = await assumptions($, '')
  expect(listed.text ?? '').toContain('Add retry on 429')
  expect(listed.text ?? '').toContain('Node 20 is the runtime')

  const w = await assumptions($, 'write')
  expect(w.text).toContain('Wrote 2')
  const file = Object.keys(written).find(k => k.endsWith('/DECISIONS-log.md')) ?? ''
  expect(written[file] ?? '').toContain('Considered, not done')
  expect(written[file] ?? '').toContain('Add retry on 429')

  await assumptions($, 'off')
  const offDescribed = await $.tool.describe({ tool: TOOL, description: 'x', provider: { plugin: 'assumption-ledger', tier: 'user' } as never })
  expect(offDescribed.isDeferred).toBe(true)
  const offCall = await $.tool.call({ tool: TOOL, kind: 'decision', text: 'Ignored' })
  expect(offCall.text ?? JSON.stringify(offCall.result)).toContain('off')

  expect(logs).toEqual([])
})
