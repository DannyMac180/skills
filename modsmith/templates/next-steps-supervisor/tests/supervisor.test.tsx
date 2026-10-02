import { expect, mock, test } from 'claude-code/testing'

import { isClean, parseVerdict } from '../hooks/verdict'

const PLUGIN = 'next-steps-supervisor'
// The kit's command.run input types origin and presentation, which the engine stamps.
const supervisor = ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, args: string) =>
  $.command.run({ command: 'supervisor', args } as never)

const props = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 19 }, view: {} }

const REPLY = JSON.stringify({
  goal: 'Add retry with backoff to the API client',
  solved: 'partly',
  gaps: ['No retry on 429 responses'],
  shortcuts: ['Tests were written but never run'],
  needsApproval: [],
  next: ['Run the client tests and fix failures', 'Handle 429 with Retry-After'],
})

const usage = { input_tokens: 40, output_tokens: 120, cache_read_input_tokens: 48000, cache_creation_input_tokens: 0 }

test('parses fenced and malformed replies', async () => {
  expect(parseVerdict('```json\n' + REPLY + '\n```')?.solved).toBe('partly')
  expect(parseVerdict('{"solved": "maybe"}')).toBeNull()
  expect(parseVerdict('not json')).toBeNull()
  const many = parseVerdict(JSON.stringify({ solved: 'yes', next: ['a', 'b', 'c'], gaps: 'x' }))
  expect(many?.next.length).toBe(2)
  expect(many?.gaps.length).toBe(0)
  expect(isClean({ solved: 'yes', gaps: [], shortcuts: [], needsApproval: [] })).toBe(true)
  expect(isClean({ solved: 'yes', gaps: [], shortcuts: ['skipped tests'], needsApproval: [] })).toBe(false)
})

test('gates the fork, draws the verdict with what is below, sends a next step', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  const forks: string[] = []
  const submitted: string[] = []
  const logs: string[] = []
  on('ui.log', (_$, e) => { logs.push(e.text); return { value: undefined } })
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('model.fork', (_$, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: REPLY, usage } } as never
  })
  on('prompt.submit', (_$, e) => { submitted.push(e.text); return { text: e.text } as never })
  on('command.run', () => ({ text: 'engine' }))
  on('tool.call', () => ({ result: 'ok', isReadOnly: false }) as never)
  on('session.start', () => ({ cwd: '/' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', { component: 'AbovePrompt' }, (_$, _e) => {
    const { Text } = _$.ui.resolve(_e)
    return <Text>below</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  // A turn that only talked: no fork.
  await $.turn.start({ text: 'what is a monad?', turnId: 't1' })
  await $.turn.complete({ answer: 'a monoid in…', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(10)
  expect(forks.length).toBe(0)

  // A turn that edited: one fork, and only one even if the turn completes twice.
  await $.turn.start({ text: 'add retry', turnId: 't2' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'u1', file_path: '/a.ts', old_string: 'a', new_string: 'b' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.advance(10)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.advance(10)
  expect(forks.length).toBe(1)
  // The final reply rides in the question: the replayed request predates it.
  expect(forks[0]).toContain('<final-reply>\ndone\n</final-reply>')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props })
    expect(await ui.find({ type: 'Text', text: /Partly solved/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /never run/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /below/ })).toBeDefined()
    await ui.unmount()
  }

  const survey = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { ...props, hasSurvey: true } })
  expect(await survey.find({ type: 'Text', text: /Partly solved/ })).toBeUndefined()
  await survey.unmount()

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props })
  await ui.press({ key: 'supervisor-next-0' })
  expect(submitted).toEqual(['Run the client tests and fix failures'])
  expect(await ui.find({ type: 'Text', text: /Partly solved/ })).toBeUndefined()
  await ui.unmount()

  // Off: an editing turn forks nothing; /supervisor now still does.
  expect((await supervisor($, 'off')).text).toContain('off')
  await $.turn.start({ text: 'again', turnId: 't3' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'u2', file_path: '/b.ts', content: 'x' } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
  await clock.advance(10)
  expect(forks.length).toBe(1)
  expect((await supervisor($, 'now')).text).toContain('partly solved')
  expect(forks.length).toBe(2)

  expect(logs).toEqual([])
})

test('a turn that ends while an older fork is out is checked once that fork returns', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  const forks: string[] = []
  let release = () => {}
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('model.fork', async (_$, e) => {
    forks.push(e.prompt)
    // The first fork hangs until released, standing in for a slow reply.
    if (forks.length === 1) await new Promise<void>(resolve => { release = resolve })
    return { value: { isAnswered: true, text: REPLY, usage } } as never
  })
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('session.start', () => ({ cwd: '/' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', { component: 'AbovePrompt' }, (_$, _e) => {
    const { Text } = _$.ui.resolve(_e)
    return <Text>below</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const id of ['t1', 't2']) {
    await $.turn.start({ text: id, turnId: id })
    await $.tool.call({ tool: 'Write', tool_use_id: id, file_path: '/b.ts', content: 'x' } as never)
    await $.turn.complete({ answer: `answer ${id}`, durationMs: 1, isAborted: false, turnId: id, reason: 'answer' })
    await clock.advance(10)
  }
  expect(forks.length).toBe(1)

  release()
  await clock.advance(10)
  await clock.advance(10)
  expect(forks.length).toBe(2)
  expect(forks[1]).toContain('answer t2')

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ type: 'Text', text: /Partly solved/ })).toBeDefined()
  await ui.unmount()
})
