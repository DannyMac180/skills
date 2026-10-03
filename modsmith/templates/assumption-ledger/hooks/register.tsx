import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LedgerEntry, LedgerKind } from '../types'

const TOOL = 'mcp__assumption-ledger__register_assumption'
const COMMAND = 'assumptions'
const LOG_FILE = 'DECISIONS-log.md'
const KEEP_SESSIONS = 20
const MAX_TEXT = 400
const PER_GROUP = 3

// Byte-identical on every turn: the tool list is part of the cached prefix,
// so any change here costs a cache rebuild for everyone using the mod.
const DESCRIPTION =
  'Add one line to the ledger the user reads when your turn ends. Call it as it happens, one item per call, when you: ' +
  "assume something you did not check (kind 'assumption'); choose between real alternatives (kind 'decision'); " +
  "or consider a better or more complete fix and decide not to do it now (kind 'considered-not-done'), the one that matters most. " +
  'Skip the obvious. Keep text to one sentence.'

const SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['assumption', 'decision', 'considered-not-done'] },
    text: { type: 'string', description: 'One sentence.' },
    why: { type: 'string', description: 'Optional reason, one clause.' },
  },
  required: ['kind', 'text'],
  additionalProperties: false,
}

const KINDS: { kind: LedgerKind; title: string; color: string }[] = [
  { kind: 'considered-not-done', title: 'Considered, not done', color: 'yellow' },
  { kind: 'assumption', title: 'Assumed', color: 'cyan' },
  { kind: 'decision', title: 'Decided', color: 'green' },
]

const pending = atom({ plugin: 'assumption-ledger', key: 'pending' } as const, [] as LedgerEntry[])
const shown = atom({ plugin: 'assumption-ledger', key: 'shown' } as const, [] as LedgerEntry[])
const turn = atom({ plugin: 'assumption-ledger', key: 'turn' } as const, 0)
const isOff = atom({ plugin: 'assumption-ledger', key: 'isOff' } as const, false)

const isKind = (value: unknown): value is LedgerKind =>
  value === 'assumption' || value === 'decision' || value === 'considered-not-done'

const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text)

const sameEntry = (a: LedgerEntry, b: LedgerEntry) =>
  a.kind === b.kind && a.text === b.text && a.turn === b.turn

const quiet = <T, F = undefined>($: EngineInterface, what: string, p: Promise<T>, fallback?: F): Promise<T | F> =>
  p.catch((err: unknown) => {
    $.ui.log(`assumption-ledger: ${what} failed: ${err instanceof Error ? err.message : String(err)}`)
    return fallback as F
  })

// Store writes are read-modify-write; parallel tool calls would otherwise race.
let writes: Promise<unknown> = Promise.resolve()
const serial = <T,>(work: () => Promise<T>) => {
  const run = writes.then(work, work)
  writes = run.catch(() => undefined)
  return run
}

const logKey = (sessionId: string) => `log:${sessionId}`

const readLog = async ($: EngineInterface) => {
  const id = await quiet($, 'session id', $.session.id(), '')
  if (id === '') return []
  const stored = await quiet($, 'store read', $.store.get(logKey(id)))
  return Array.isArray(stored) ? (stored as LedgerEntry[]) : []
}

const appendLog = ($: EngineInterface, entry: LedgerEntry) =>
  serial(async () => {
    const id = await $.session.id()
    const log = await readLog($)
    await $.store.set(logKey(id), [...log, entry])

    // Keep the store well under its 4 MiB cap: only the last few sessions' logs.
    const known = await $.store.get('sessions')
    const sessions = (Array.isArray(known) ? (known as string[]) : []).filter(s => s !== id)
    const kept = [...sessions, id].slice(-KEEP_SESSIONS)
    for (const old of sessions.filter(s => !kept.includes(s))) {
      await $.store.delete(logKey(old))
    }
    await $.store.set('sessions', kept)
  }).catch((err: unknown) => $.ui.log(`assumption-ledger: log write failed: ${String(err)}`))

const followUp = (entry: LedgerEntry) =>
  `Earlier you considered this and decided not to do it: ${entry.text.replace(/[.\s]+$/, '')}` +
  (entry.why ? ` (your reason: ${entry.why})` : '') +
  '. Do it now, or tell me in one line why it should stay undone.'

// Submit the follow-up as a turn of its own; fall back to the prompt box,
// then the clipboard, so a press never does nothing.
const doIt = async ($: EngineInterface, entry: LedgerEntry, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']) => {
  try {
    await update($, shown, list => list.filter(e => !sameEntry(e, entry)))
    const text = followUp(entry)

    const submitted = await $.prompt.submit({ text, asUser: true }).then(() => true, () => false)
    if (submitted) return

    const filled = await quiet($, 'prompt fill', $.prompt.fill({ text }), { isFilled: false })
    if (filled.isFilled) return

    const copied = await quiet($, 'copy', $.ui.copy({ text, surface }), { isCopied: false as const, reason: 'no-surface' as const })
    $.ui.toast(copied.isCopied ? 'Follow-up copied: paste it into the prompt' : 'Could not send the follow-up: see /assumptions')
  } catch (err) {
    $.ui.log(`assumption-ledger: follow-up failed: ${String(err)}`)
  }
}

const asMarkdown = (entries: LedgerEntry[]) =>
  KINDS.map(({ kind, title }) => {
    const items = entries.filter(e => e.kind === kind)
    if (items.length === 0) return ''
    const lines = items.map(e => `- (turn ${e.turn}) ${e.text}${e.why ? ` _because ${e.why}_` : ''}`)
    return `### ${title}\n${lines.join('\n')}`
  })
    .filter(Boolean)
    .join('\n\n')

const writeLogFile = async ($: EngineInterface, path: string, entries: LedgerEntry[]) => {
  const id = await $.session.id()
  const when = new Date(await $.clock.now()).toISOString()
  const before = (await $.fs.exists(path)) ? await $.fs.read(path) : '# Decisions log\n'
  await $.fs.write(path, `${before.trimEnd()}\n\n## Session ${id.slice(0, 8)}, ${when}\n\n${asMarkdown(entries)}\n`)
}

const setOff = async ($: EngineInterface, value: boolean) => {
  await quiet($, 'state write', update($, isOff, () => value))
  await quiet($, 'store write', $.store.set('isOff', value))
  // Moves the tool behind ToolSearch (off) or back into the list (on): one cache rebuild.
  $.ui.invalidate('tool.describe')
}

const runCommand = async ($: EngineInterface, args: string) => {
  const [verb = '', ...rest] = args.trim().split(/\s+/)

  if (verb === 'off' || verb === 'on') {
    await setOff($, verb === 'off')
    return { text: verb === 'off' ? 'Assumption ledger off: the tool is moved behind ToolSearch.' : 'Assumption ledger on.' }
  }

  const entries = await readLog($)
  if (entries.length === 0) {
    return { text: 'No assumptions, decisions or skipped fixes recorded this session.' }
  }

  if (verb === 'write') {
    const path = rest.join(' ') || LOG_FILE
    try {
      await writeLogFile($, path, entries)
      return { text: `Wrote ${entries.length} entries to ${path}.` }
    } catch (err) {
      return { text: `Could not write ${path}: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  return { text: `## Assumption ledger (${entries.length})\n\n${asMarkdown(entries)}` }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await quiet($, 'store read', $.store.get('isOff'))
    await quiet($, 'state write', update($, isOff, () => stored === true))

    await quiet($, 'tool register', $.tool.register({ name: 'register_assumption', description: DESCRIPTION, inputSchema: SCHEMA }))
    await quiet(
      $,
      'command register',
      $.command.register({
        name: COMMAND,
        description: "This session's assumptions, decisions and skipped fixes",
        argumentHint: '[write [path] | off | on]',
      }),
    )

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await quiet($, 'reset', Promise.all([update($, pending, () => []), update($, shown, () => []), update($, turn, () => 0)]))
    }

    return next(e)
  })

  on('tool.describe', { tool: TOOL }, async ($, e, next) => {
    const base = await next(e)
    const off = await read($, isOff)

    return { ...base, description: DESCRIPTION, isDeferred: off }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    if (await read($, isOff)) {
      return { result: 'The ledger is off for this session. Carry on.' }
    }

    const { kind, text, why } = e as { kind?: unknown; text?: unknown; why?: unknown }
    if (!isKind(kind) || typeof text !== 'string' || text.trim() === '') {
      return { deny: "register_assumption needs kind ('assumption' | 'decision' | 'considered-not-done') and a non-empty text." }
    }

    const entry: LedgerEntry = {
      kind,
      text: clip(text.trim()),
      ...(typeof why === 'string' && why.trim() !== '' ? { why: clip(why.trim()) } : {}),
      turn: await read($, turn),
    }

    await quiet($, 'state write', update($, pending, list => [...list, entry]))
    void appendLog($, entry)

    return { result: 'Noted.' }
  })

  on('turn.start', async ($, e, next) => {
    await quiet(
      $,
      'state write',
      Promise.all([update($, turn, n => n + 1), update($, pending, () => []), update($, shown, () => [])]),
    )

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      const entries = await read($, pending)
      if (entries.length > 0) {
        await quiet($, 'state write', update($, shown, () => entries))
      }
    }

    return result
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    try {
      return await runCommand($, e.args)
    } catch (err) {
      return { text: `assumption-ledger: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const entries = await read($, shown)

    if (e.props.hasSurvey || e.props.isWorking || entries.length === 0) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const below = await next(e)

    const groups = KINDS.map(({ kind, title, color }) => {
      const items = entries.filter(x => x.kind === kind)
      if (items.length === 0) return null
      const more = items.length - PER_GROUP

      return (
        <Box key={kind} flexDirection="column">
          <Text color={color} bold>
            {title} ({items.length})
          </Text>
          {items.slice(0, PER_GROUP).map((item, i) => (
              <Box key={`${kind}-${i}`}>
                <Text wrap="truncate-end">
                  <Text> · {item.text}</Text>
                  {item.why ? <Text dimColor> ({item.why})</Text> : null}
                </Text>
                {kind === 'considered-not-done' ? (
                  // No digit hotkey: a bare digit typed into an empty prompt presses
                  // band Buttons, and this one starts a paid turn.
                  <Button
                    key={`do-${i}`}
                    label="Do it"
                    onPress={press => void doIt($, item, press.surface)}
                  />
                ) : null}
              </Box>
          ))}
          {more > 0 ? <Text dimColor>   +{more} more: /assumptions</Text> : null}
        </Box>
      )
    })

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>Ledger for this turn </Text>
          <Button
            key="dismiss"
            label="Dismiss"
            role="dismiss"
            onPress={() => void quiet($, 'dismiss', update($, shown, () => []))}
          />
        </Box>
        {groups}
        {below}
      </Box>
    )
  })
}
