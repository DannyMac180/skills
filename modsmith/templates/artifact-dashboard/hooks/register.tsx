import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { BoardLink, BoardView, Card } from '../types'

type Engine = EngineInterface

const view = atom({ plugin: 'artifact-dashboard', key: 'view' } as const, null as BoardView | null)
const isOff = atom({ plugin: 'artifact-dashboard', key: 'isOff' } as const, false)

const TOOL = 'ArtifactData'
const COMMAND = 'board'
const ORDER = ['backlog', 'todo', 'doing', 'review', 'blocked', 'done']
const STALE_MS = 2 * 60_000
const MAX_CARDS = 500
const WRITES = ['set', 'update', 'delete', 'str_replace', 'batch']

type Write = {
  op: string
  collection?: string
  doc_id?: string
  data?: {}
  file_path?: string
  field?: string
  old_str?: string
  new_str?: string
  replace_all?: boolean
}

// Module state is rebuilt lazily by ensure(), so a hot reload costs one store read.
let loading: Promise<BoardLink | null> | undefined
let cards: Record<string, Card> = {}
let readAt = 0
let isDirty = false
let lastMove: string | undefined
let note: string | undefined
let isCommandRegistered = false

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

const idOf = (url: string | undefined) => url?.match(/artifact\/([A-Za-z0-9_-]+)/)?.[1]

const asLink = (value: unknown): BoardLink | null => {
  if (!isObject(value) || !idOf(text(value.url))) return null
  return { url: String(value.url), collection: text(value.collection) ?? 'cards' }
}

const mirrorKey = (board: BoardLink) => `mirror:${idOf(board.url)}:${board.collection}`

const quietly = async <T,>($: Engine, what: string, work: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await work()
  } catch (err) {
    $.ui.log(`artifact-dashboard: ${what} failed: ${err}`)
    return undefined
  }
}

// A card is any document with a column; status and lane are accepted so a board
// Claude built with other field names still counts.
const toCard = (data: unknown, id: string): Card | undefined => {
  if (!isObject(data)) return undefined
  const column = text(data.column) ?? text(data.status) ?? text(data.lane)
  if (!column) return undefined
  const owner = text(data.owner) ?? text(data.assignee)
  return { title: text(data.title) ?? text(data.name) ?? id, column, ...(owner ? { owner } : {}) }
}

const docOf = (item: unknown) => {
  if (!isObject(item)) return undefined
  const id = text(item.doc_id) ?? text(item.id) ?? text(item.docId)
  if (!id) return undefined
  const card = toCard(isObject(item.data) ? item.data : item, id)
  return card ? { id, card } : undefined
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    const at = raw.indexOf('{')
    if (at === -1) return undefined
    try {
      return JSON.parse(raw.slice(at))
    } catch {
      return undefined
    }
  }
}

// Fallback for a result with no structured record: walk whatever JSON the text
// holds for arrays of documents instead of trusting one wrapper shape.
const parseDocs = (raw: string | undefined) => {
  const json = raw ? parseJson(raw) : undefined
  if (json === undefined) return undefined
  const found: Record<string, Card> = {}
  let isList = false
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      isList = true
      for (const item of node) {
        const doc = docOf(item)
        if (doc) found[doc.id] = doc.card
        else walk(item, depth + 1)
      }
      return
    }
    const single = depth === 0 ? docOf(node) : undefined
    if (single) {
      found[single.id] = single.card
      isList = true
      return
    }
    for (const value of Object.values(node)) walk(value, depth + 1)
  }
  walk(json, 0)
  return isList ? { cards: found, isPartial: /next_cursor"\s*:\s*"/.test(raw ?? '') } : undefined
}

// The declared record (BuiltinToolResults.ArtifactData, its db_read arm) first;
// the model-facing text only when a build answers without it.
const docsOf = (ran: ToolCallResult) => {
  const record = isObject(ran.result) ? ran.result.db_read : undefined
  // A record without docs (out_dir saved them to files, or a get found nothing)
  // says nothing about the cards; reading its text would empty the mirror.
  if (isObject(record) && !Array.isArray(record.docs)) return undefined
  if (isObject(record) && Array.isArray(record.docs)) {
    const cards: Record<string, Card> = {}
    for (const item of record.docs) {
      const doc = docOf(item)
      if (doc) cards[doc.id] = doc.card
    }
    return { cards, isPartial: typeof record.next_cursor === 'string' }
  }
  return parseDocs(ran.text)
}

// db_write.committed is false when an if_version pin missed: nothing was written.
const isCommitted = (ran: ToolCallResult) => {
  const record = isObject(ran.result) ? ran.result.db_write : undefined
  return !(isObject(record) && record.committed === false)
}

const columnsOf = (all: Card[]) => {
  const counts = new Map<string, number>()
  for (const card of all) counts.set(card.column, (counts.get(card.column) ?? 0) + 1)
  const rank = (name: string) => {
    const at = ORDER.indexOf(name.toLowerCase())
    return at === -1 ? ORDER.length : at
  }
  return [...counts]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }))
}

const brief = (board: BoardLink) =>
  [
    `This project's shared task board is the artifact ${board.url}, database collection "${board.collection}".`,
    'Each card is one document: { title, column, owner }, column one of backlog, todo, doing, review, blocked, done.',
    'Other Claude sessions read and write the same board. Use the ArtifactData tool: read before you write,',
    'pin every write with if_version, and only move or add the cards your own task touches.',
    'When you start a task that has a card, move it to doing; when you finish, move it to review or done.',
  ].join(' ')

const publish = async ($: Engine, board: BoardLink | null) => {
  if (!board) {
    await update($, view, () => null)
    return
  }
  const all = Object.values(cards)
  const next: BoardView = {
    columns: columnsOf(all),
    total: all.length,
    readAt,
    isConfirmed: !isDirty,
    ...(lastMove ? { lastMove } : {}),
    ...(note ? { note } : {}),
  }
  await update($, view, () => next)
  await $.store
    .set(mirrorKey(board), { cards: trimmed(cards), readAt })
    .catch(err => $.ui.log(`artifact-dashboard: saving the mirror failed: ${err}`))
}

// The store outlives this code: re-check each saved card rather than trust its shape.
const restored = (saved: Record<string, unknown>) => {
  const out: Record<string, Card> = {}
  for (const [id, data] of Object.entries(saved)) {
    const card = toCard(data, id)
    if (card) out[id] = card
  }
  return out
}

const trimmed = (all: Record<string, Card>) => Object.fromEntries(Object.entries(all).slice(-MAX_CARDS))

// The repo file wins so every session in the project, on any machine, finds the
// same board without anyone running /board.
const loadLink = async ($: Engine) => {
  const root = await $.session.root()
  const fromRepo = await $.fs
    .read(`${root}/.claude/board.json`)
    .then(raw => asLink(parseJson(raw)))
    .catch(() => null)
  if (fromRepo) return fromRepo
  return asLink(await $.store.get(`board:${root}`).catch(() => undefined))
}

const ensure = ($: Engine): Promise<BoardLink | null> => {
  loading ??= (async () => {
    // $.state lives for the session; the off switch has to outlive it.
    if ((await $.store.get('isOff').catch(() => undefined)) === true) await update($, isOff, () => true)
    const board = (await quietly($, 'loading the board link', () => loadLink($))) ?? null
    if (board) {
      const saved = await $.store.get(mirrorKey(board)).catch(() => undefined)
      if (isObject(saved) && isObject(saved.cards)) {
        cards = restored(saved.cards)
        readAt = typeof saved.readAt === 'number' ? saved.readAt : 0
      }
    }
    await quietly($, 'drawing the mirror', () => publish($, board))
    return board
  })()
  // A failed load is retried on the next call instead of being cached for the session.
  const current = loading
  current.catch(() => {
    if (loading === current) loading = undefined
  })
  return current
}

const relink = async ($: Engine, board: BoardLink | null) => {
  loading = Promise.resolve(board)
  cards = {}
  readAt = 0
  isDirty = false
  lastMove = undefined
  note = undefined
  if (board) {
    const saved = await $.store.get(mirrorKey(board)).catch(() => undefined)
    if (isObject(saved) && isObject(saved.cards)) cards = restored(saved.cards)
  }
  await publish($, board)
}

const failure = (ran: ToolCallResult) => {
  if (ran.deny !== undefined) return `refused: ${ran.deny}`
  if (ran.isError) return `failed: ${(ran.text ?? '').slice(0, 120)}`
  return undefined
}

// Reads the whole collection with Claude's own tool. Unasked, it never opens a
// permission dialog: it reads only where the check already says allow.
const refresh = async ($: Engine, isAsked: boolean): Promise<string> => {
  const board = await ensure($)
  if (!board) return 'No board linked. Run /board <artifact url>, or commit .claude/board.json.'
  // Every unasked read (session start, turn end) honours /board off.
  if (!isAsked && (await read($, isOff))) return 'Board summary is off; run /board on.'
  const input = { action: 'list' as const, url: board.url, collection: board.collection, query: { limit: 1000 } }
  const stop = async (why: string) => {
    note = why
    await publish($, board)
    return why
  }
  // $.tool.list is no gate: a deferred tool may be missing from it and still
  // callable, so a rejected check or call is what says the tool is not here.
  try {
    if (!isAsked && (await $.tool.check({ tool: TOOL, input })).decision !== 'allow') {
      return await stop('reading needs approval: run /board refresh')
    }
  } catch {
    return await stop(`${TOOL} is not available here; showing the last mirror`)
  }
  const ran = await $.tool.call({ tool: TOOL, ...input }).catch(() => undefined)
  if (!ran) return await stop(`${TOOL} is not available here; showing the last mirror`)
  const why = failure(ran)
  const docs = why ? undefined : docsOf(ran)
  if (!docs) return await stop(why ? `read ${why}` : 'could not parse the list result; showing the last mirror')
  cards = docs.cards
  readAt = await $.clock.now()
  isDirty = false
  note = docs.isPartial ? 'more than 1000 cards; counts are partial' : undefined
  await publish($, board)
  return `Read ${Object.keys(cards).length} cards from the board.`
}

const writeData = async ($: Engine, write: Write) => {
  if (isObject(write.data)) return write.data
  if (!write.file_path) return undefined
  const raw = await $.fs.read(write.file_path).catch(() => undefined)
  return raw === undefined ? undefined : parseJson(raw)
}

const move = (id: string, before: Card | undefined, after: Card | undefined) => {
  if (after && after.column !== before?.column) lastMove = `${after.title} → ${after.column}`
  if (after) cards[id] = after
  else delete cards[id]
}

const applyWrite = async ($: Engine, board: BoardLink, write: Write) => {
  const id = write.doc_id
  if (!id || write.collection !== board.collection) return
  const before = cards[id]
  if (write.op === 'delete') return move(id, before, undefined)
  if (write.op === 'str_replace') {
    if (!before || !write.field || !write.old_str) return
    const field = write.field as keyof Card
    const old = before[field]
    if (typeof old !== 'string') return
    const swapped = write.replace_all
      ? old.split(write.old_str).join(write.new_str ?? '')
      : old.replace(write.old_str, write.new_str ?? '')
    return move(id, before, { ...before, [field]: swapped })
  }
  const data = await writeData($, write)
  if (!isObject(data)) return
  if (write.op === 'set') return move(id, before, toCard(data, id))
  // An update merges; a field written as { __delete__: true } is removed.
  const merged: Record<string, unknown> = { ...(before ?? {}) }
  for (const [key, value] of Object.entries(data)) {
    if (isObject(value) && value.__delete__ === true) delete merged[key]
    else merged[key] = value
  }
  move(id, before, toCard(merged, id))
}

// Sees every ArtifactData call that reaches the engine: the model's, and this
// mod's own reads. Writes become unconfirmed until the next read lands.
const observe = async ($: Engine, e: Record<string, unknown>, ran: ToolCallResult) => {
  const board = await ensure($)
  if (!board || failure(ran) || idOf(text(e.url)) !== idOf(board.url)) return
  const action = String(e.action)
  if (action === 'list' || action === 'query' || action === 'get') {
    // out_dir answers with file paths, and a lowered as_level reads refused
    // documents as missing: neither is the board as it stands.
    if (e.collection !== board.collection || e.out_dir !== undefined || e.as_level !== undefined) return
    const docs = docsOf(ran)
    if (!docs) return
    const query = isObject(e.query) ? e.query : {}
    const isWhole = action === 'list' && !docs.isPartial && !query.cursor
    cards = isWhole ? docs.cards : { ...cards, ...docs.cards }
    if (isWhole) {
      readAt = await $.clock.now()
      isDirty = false
    }
  } else if (WRITES.includes(action)) {
    if (!isCommitted(ran)) return
    const writes = action === 'batch' ? (Array.isArray(e.writes) ? (e.writes as Write[]) : []) : [{ ...e, op: action } as Write]
    for (const write of writes) await applyWrite($, board, write)
    isDirty = true
  } else {
    return
  }
  await publish($, board)
}

const clock = (at: number) => {
  const time = new Date(at)
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}

const registerCommand = async ($: Engine) => {
  if (isCommandRegistered) return
  await $.command.register({
    name: COMMAND,
    description: 'Shared Kanban artifact: /board <url> [collection] | refresh | off | on | forget',
    argumentHint: '[url | refresh | off | on | forget]',
  })
  isCommandRegistered = true
}

const status = async ($: Engine) => {
  const board = await ensure($)
  if (!board) return 'No board linked. Run /board <artifact url> [collection].'
  const shown = await read($, view)
  const counts = shown?.columns.map(c => `${c.name} ${c.count}`).join(', ') || 'no cards yet'
  const when = readAt ? `last read ${clock(readAt)}` : 'never read'
  const pending = isDirty ? ', with writes not yet read back' : ''
  const moved = lastMove ? ` Last move: ${lastMove}.` : ''
  return `Board ${board.url} (${board.collection}): ${counts}; ${when}${pending}.${moved}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await quietly($, 'registering /board', () => registerCommand($))
    await quietly($, 'reading the board', () => refresh($, false))
    return result
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [word = '', extra] = e.args.trim().split(/\s+/)
    const answer = await quietly($, `/board ${word}`, async () => {
      if (word === '') return { text: await status($) }
      if (word === 'refresh') return { text: await refresh($, true) }
      if (word === 'off' || word === 'on') {
        await update($, isOff, () => word === 'off')
        await $.store.set('isOff', word === 'off')
        return { text: word === 'off' ? 'Board summary hidden; no more reads.' : 'Board summary back on.' }
      }
      const root = await $.session.root()
      if (word === 'forget') {
        await $.store.delete(`board:${root}`)
        await relink($, null)
        return { text: 'Board link forgotten for this project (.claude/board.json, if any, still wins).' }
      }
      const board = asLink({ url: word, collection: extra })
      if (!board) return { text: `Not an artifact link: ${word}` }
      await $.store.set(`board:${root}`, board)
      await relink($, board)
      const outcome = await refresh($, true)
      // Mid-session the first message's context is already sent, so the brief
      // rides on this command's output instead of invalidating that context.
      return { text: `Linked ${board.url} (${board.collection}). ${outcome}`, context: [brief(board)] }
    })
    return answer ?? { text: '/board failed; see the debug log.' }
  })

  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const board = await quietly($, 'loading the board link', () => ensure($))
    if (!board || (await read($, isOff))) return result
    return { ...result, blocks: [...result.blocks, { name: 'projectBoard', text: brief(board) }] }
  })

  on('tool.call', { tool: TOOL }, async ($, e, next) => {
    const ran = await next(e)
    await quietly($, 'mirroring a board call', () => observe($, e as unknown as Record<string, unknown>, ran))
    return ran
  })

  // No model call ever: a turn end reads the board only after a write needs
  // confirming or once the mirror is older than STALE_MS.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    await quietly($, 'registering /board', () => registerCommand($))
    const board = await quietly($, 'loading the board link', () => ensure($))
    if (!board || (await read($, isOff))) return result
    const now = await $.clock.now()
    if (isDirty || now - readAt > STALE_MS) await quietly($, 'reading the board', () => refresh($, false))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const board = await read($, view)
    if (e.props.hasSurvey || board === null || (await read($, isOff))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const columns = board.columns.length ? board.columns : [{ name: 'empty', count: 0 }]
    const freshness = board.isConfirmed
      ? board.readAt
        ? `read ${clock(board.readAt)}`
        : 'not read yet'
      : 'unconfirmed'

    return (
      <Box flexDirection="column">
        <Box>
          <Text wrap="truncate-end">
            <Text bold color="cyan">
              ▦ board{' '}
            </Text>
            {columns.map(c => (
              <Text key={c.name}>
                {c.name} <Text bold>{c.count}</Text>
                {'  '}
              </Text>
            ))}
            <Text dimColor>· {freshness}</Text>
            {board.lastMove ? <Text dimColor> · {board.lastMove}</Text> : null}
            {board.note ? <Text color="yellow"> · {board.note}</Text> : null}
          </Text>
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
