import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const URL = 'https://claude.ai/artifact/AbCdEf123'

const DOCS = [
  { id: 'c1', version: 1, data: { title: 'Login', column: 'todo' } },
  { id: 'c2', version: 3, data: { title: 'API', column: 'doing' } },
]

type Answer = { result: unknown; text: string }

// The structured record the declarations give ArtifactData's reads and writes.
const LISTED: Answer = { result: { db_read: { op: 'list', collection: 'cards', docs: DOCS } }, text: JSON.stringify(DOCS) }
const WROTE: Answer = { result: { db_write: { op: 'update', collection: 'cards', doc_id: 'c1', version: 2, committed: true } }, text: 'ok' }

const world = (on: On, listed = LISTED, wrote = WROTE) => {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, { 'board:/repo': { url: URL, collection: 'cards' } })
  on('session.root', () => ({ value: '/repo' }))
  on('fs.read', () => Promise.reject(new Error('no .claude/board.json')))
  on('tool.check', () => ({ decision: 'allow' as const }))
  // Hand-shaped answers stand for the engine's; the cast skips re-declaring its union.
  on('tool.call', { tool: 'ArtifactData' }, (_$, e) => (e.action === 'list' ? listed : wrote) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
}

// As if typed at the prompt: the engine-side call takes the whole input.
const typed = async ($: Engine, args: string) =>
  (await $.command.run({ command: 'board', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })).text ?? ''

// The test's $ has no state noun, so the board is read back through /board.
const board = ($: Engine) => typed($, '')

test('a write Claude makes shows at once, unconfirmed', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'ArtifactData', action: 'update', url: URL, collection: 'cards', doc_id: 'c1', data: { title: 'Login', column: 'done' }, if_version: 1 })
  const text = await board($)
  expect(text).toContain('done 1')
  expect(text).toContain('never read, with writes not yet read back')
  expect(text).toContain('Last move: Login → done')
})

test('a whole list replaces the mirror and confirms it', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'ArtifactData', action: 'list', url: URL, collection: 'cards' })
  const text = await board($)
  expect(text).toContain('todo 1, doing 1')
  expect(text).not.toContain('not yet read back')
  expect(text).toContain('last read')
})

test('calls on another artifact are ignored', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'ArtifactData', action: 'set', url: 'https://claude.ai/artifact/Other999', collection: 'cards', doc_id: 'x', data: { column: 'todo' } })
  expect(await board($)).toContain('no cards yet')
})

test('a write whose version pin missed changes nothing', async ($, on) => {
  world(on, LISTED, { result: { db_write: { op: 'update', collection: 'cards', doc_id: 'c1', version: 4, committed: false } }, text: 'conflict' })
  await $.tool.call({ tool: 'ArtifactData', action: 'update', url: URL, collection: 'cards', doc_id: 'c1', data: { column: 'done' }, if_version: 1 })
  expect(await board($)).toContain('no cards yet')
})

test('/board refresh falls back to the text when no record comes back', async ($, on) => {
  world(on, { result: undefined, text: JSON.stringify([{ id: 'c9', title: 'Docs', status: 'review' }]) })
  expect(await typed($, 'refresh')).toBe('Read 1 cards from the board.')
  expect(await board($)).toContain('review 1')
})

const turnEnds = ($: Engine) =>
  $.turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })

test('a turn end reads the board only where reading is already allowed', async ($, on) => {
  let reads = 0
  let decision: 'allow' | 'ask' = 'ask'
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, { 'board:/repo': { url: URL, collection: 'cards' } })
  on('session.root', () => ({ value: '/repo' }))
  on('fs.read', () => Promise.reject(new Error('no .claude/board.json')))
  on('tool.check', () => ({ decision }))
  on('tool.call', { tool: 'ArtifactData' }, () => {
    reads += 1
    return LISTED as never
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: 'done' }))

  await turnEnds($)
  expect(reads).toBe(0)
  expect(await board($)).toContain('no cards yet')

  decision = 'allow'
  await turnEnds($)
  expect(reads).toBe(1)
  expect(await board($)).toContain('todo 1, doing 1')

  // Fresh and clean: the next turn end costs nothing.
  await turnEnds($)
  expect(reads).toBe(1)
})

test('/board off outlives the session and stops the reads', async ($, on) => {
  let reads = 0
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, { 'board:/repo': { url: URL, collection: 'cards' }, isOff: true })
  on('session.root', () => ({ value: '/repo' }))
  on('fs.read', () => Promise.reject(new Error('no .claude/board.json')))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', { tool: 'ArtifactData' }, () => {
    reads += 1
    return LISTED as never
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: 'done' }))

  await turnEnds($)
  expect(reads).toBe(0)
  expect(await typed($, 'on')).toBe('Board summary back on.')
  await turnEnds($)
  expect(reads).toBe(1)
})

test('/board off also stops the read at session start', async ($, on) => {
  let reads = 0
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, { 'board:/repo': { url: URL, collection: 'cards' }, isOff: true })
  on('session.root', () => ({ value: '/repo' }))
  on('fs.read', () => Promise.reject(new Error('no .claude/board.json')))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', { tool: 'ArtifactData' }, () => {
    reads += 1
    return LISTED as never
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
  expect(reads).toBe(0)
})

test('a list saved to files, or a profiles lookup, leaves the mirror alone', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'ArtifactData', action: 'list', url: URL, collection: 'cards' })
  await $.tool.call({ tool: 'ArtifactData', action: 'list', url: URL, collection: 'cards', out_dir: '/tmp/x' })
  await $.tool.call({ tool: 'ArtifactData', action: 'profiles', url: URL, ids: ['u_x'] })
  const text = await board($)
  expect(text).toContain('todo 1, doing 1')
  expect(text).not.toContain('not yet read back')
})
