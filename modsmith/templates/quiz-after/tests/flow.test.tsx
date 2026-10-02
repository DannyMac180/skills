import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'quiz-after'
// The kit's command.run input types origin and presentation, which the engine stamps.
const quiz = ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, args: string) =>
  $.command.run({ command: 'quiz', args } as never)

const props = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 19 }, view: {} }
const usage = { input_tokens: 350, output_tokens: 420, cache_read_input_tokens: 48000, cache_creation_input_tokens: 0 }

const QUIZ = JSON.stringify({
  done: true,
  title: 'Retry queue with backoff',
  questions: [
    { q: 'Why back off instead of retrying at a fixed rate?', answer: 'To shed load', why: 'Retries pile up.', tag: 'mechanism' },
    { q: 'Where does a job go after the last retry?', choices: ['Dropped', 'Dead-letter list'], answer: 'Dead-letter list', why: '', tag: 'transfer' },
  ],
})

test('gates the fork, draws the quiz over what is below, reveals, saves and dismisses', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/home/me' })
  const clock = mock.clock(on, { now: 0 })
  const forks: string[] = []
  const replies: string[] = []
  const files: Record<string, string> = {}
  const logs: string[] = []

  on('ui.log', (_$, e) => { logs.push(e.text); return { value: undefined } })
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('model.fork', (_$, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: replies.shift() ?? '{"done": false}', usage } } as never
  })
  on('fs.exists', (_$, e) => ({ value: e.path === '/home/me/.explain-this/memory' || e.path in files }) as never)
  on('fs.read', (_$, e) => ({ value: files[e.path] ?? '' }) as never)
  on('fs.write', (_$, e) => { files[e.path] = e.text; return { value: undefined } as never })
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('command.run', () => ({ text: 'engine' }))
  on('tool.call', (_$, e) => (e.tool === 'Read' ? { result: 'x', isReadOnly: true } : { result: 'ok' }) as never)
  on('session.start', () => ({ cwd: '/' }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', { component: 'AbovePrompt' }, (_$, _e) => {
    const { Text } = _$.ui.resolve(_e)
    return <Text>below</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const turn = async (id: string, tools: string[]) => {
    await $.prompt.submit({ text: id } as never)
    for (const tool of tools) {
      await $.tool.call({ tool, tool_use_id: `${id}-${tool}`, file_path: '/a.ts', old_string: 'a', new_string: 'b' } as never)
    }
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: id, reason: 'answer' })
    await clock.advance(10)
  }

  // Chat-only, read-only and bookkeeping-only turns: no fork.
  await turn('t1', [])
  await turn('t2', ['Read', 'TodoWrite'])
  expect(forks.length).toBe(0)

  // An edit the fork judges unfinished: one fork, nothing drawn.
  await turn('t3', ['Edit'])
  expect(forks.length).toBe(1)
  const empty = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props })
  expect(await empty.find({ type: 'Text', text: /Quiz/ })).toBeUndefined()
  expect(await empty.find({ type: 'Text', text: /below/ })).toBeDefined()
  await empty.unmount()

  // An edit the fork judges done: the quiz draws on both surfaces, above the rest of the chain.
  replies.push(`Sure:\n${QUIZ}`)
  await turn('t4', ['Edit'])
  expect(forks.length).toBe(2)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props })
    expect(await ui.find({ type: 'Text', text: /fixed rate/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /48k cached/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /below/ })).toBeDefined()
    await ui.unmount()
  }

  const survey = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { ...props, hasSurvey: true } })
  expect(await survey.find({ type: 'Text', text: /fixed rate/ })).toBeUndefined()
  await survey.unmount()

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props })
  expect(await ui.find({ type: 'Text', text: /To shed load/ })).toBeUndefined()
  await ui.press({ key: 'reveal-0' })
  expect(await ui.find({ type: 'Text', text: /To shed load/ })).toBeDefined()

  await ui.press({ key: 'save' })
  const deck = files['/home/me/.explain-this/memory/cards.jsonl'] ?? ''
  const cards = deck.trim().split('\n').map(line => JSON.parse(line))
  expect(cards.length).toBe(2)
  expect(cards[1].type).toBe('transfer')
  expect(cards[0].artifact.source).toBe('/work')
  expect(await ui.find({ type: 'Text', text: /Saved to deck/ })).toBeDefined()

  await ui.press({ key: 'dismiss' })
  expect(await ui.find({ type: 'Text', text: /fixed rate/ })).toBeUndefined()
  await ui.unmount()

  // Off: an editing turn forks nothing; /quiz now still does, and it survives as a setting.
  expect((await quiz($, 'off')).text).toContain('off')
  await turn('t5', ['Write'])
  expect(forks.length).toBe(2)
  replies.push(QUIZ)
  expect((await quiz($, 'now')).text).toContain('Quiz ready')
  expect(forks.length).toBe(3)
  expect((await quiz($, '')).text).toContain('on')
  expect((await quiz($, 'maybe')).text).toContain('Usage')

  expect(logs.filter(l => !l.includes('no quiz'))).toEqual([])
})

test('Save to deck creates nothing when explain-this has no memory folder', async ($, on) => {
  mock.store(on)
  mock.env(on, { EXPLAIN_THIS_HOME: '/nowhere' })
  const clock = mock.clock(on, { now: 0 })
  const writes: string[] = []
  const toasts: string[] = []

  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('model.fork', () => ({ value: { isAnswered: true, text: QUIZ, usage } }) as never)
  on('fs.exists', () => ({ value: false }) as never)
  on('fs.write', (_$, e) => { writes.push(e.path); return { value: undefined } as never })
  on('command.run', () => ({ text: 'engine' }))
  on('session.start', () => ({ cwd: '/' }))
  on('ui.render', { component: 'AbovePrompt' }, (_$, _e) => {
    const { Text } = _$.ui.resolve(_e)
    return <Text>below</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await quiz($, 'now')).text).toContain('Quiz ready')
  await clock.advance(10)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props })
  await ui.press({ key: 'save' })
  expect(writes).toEqual([])
  expect(toasts.some(t => t.includes('/nowhere/memory'))).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'save' })).toBeDefined()
  await ui.unmount()
})
