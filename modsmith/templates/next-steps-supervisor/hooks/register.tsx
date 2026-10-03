import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase, Verdict } from '../types'
import { forkPrompt, isClean, parseVerdict } from './verdict'

const verdictAtom = atom({ plugin: 'next-steps-supervisor', key: 'verdict' } as const, null as Verdict | null)
const phaseAtom = atom({ plugin: 'next-steps-supervisor', key: 'phase' } as const, 'idle' as Phase)

// A turn earns a check when it changed something, or ran long enough that
// "did it actually finish?" is a real question.
const MANY_TOOL_CALLS = 8

// quiz-after takes 1-3, s and x in the same band; these stay clear of them.
const NEXT_HOTKEYS = ['n', 'm']

const short = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${n}`)

const isOn = async ($: EngineInterface) => (await $.store.get('isOn').catch(() => true)) !== false

const say = ($: EngineInterface, line: string) => $.ui.log(`next-steps-supervisor: ${line}`, { to: 'debug' })

// Per-turn bookkeeping. Module variables are fine: a reload mid-turn costs
// one skipped check, and nothing draws from them.
let turnSeq = 0
let checkedSeq = -1
let tools = 0
let changes = 0
let isChecking = false
let lastAnswer = ''
// A qualifying turn that ended while an older fork was still out; checked when it returns.
let queuedSeq = -1

// One fork. Resolves a line for /supervisor now; never rejects.
const check = async ($: EngineInterface, isForced: boolean): Promise<string> => {
  if (isChecking) return 'A supervisor check is already running.'
  isChecking = true
  const seq = turnSeq
  checkedSeq = seq

  try {
    await update($, phaseAtom, () => 'checking')
    const reply = await $.model.fork({ prompt: forkPrompt(lastAnswer) })

    if (!reply.isAnswered) {
      say($, `no verdict (${reply.reason})`)
      return `No verdict: the fork did not answer (${reply.reason}).`
    }

    // A new turn started while the fork ran: this verdict is about stale work.
    if (seq !== turnSeq) return 'Skipped: a new turn started.'
    // Turned off while the fork ran: honour that for the automatic check.
    if (!isForced && !(await isOn($))) return 'Skipped: the supervisor was turned off.'

    const parsed = parseVerdict(reply.text)
    if (parsed === null) {
      say($, `unreadable reply: ${reply.text.slice(0, 120)}`)
      return 'The fork answered, but not with a verdict this mod could read.'
    }

    const { usage } = reply
    const cost = {
      cached: usage.cache_read_input_tokens ?? 0,
      input: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0),
      output: usage.output_tokens,
    }
    await update($, verdictAtom, () => ({ ...parsed, cost }))

    return `Supervisor: ${parsed.solved === 'yes' ? 'solved' : parsed.solved === 'partly' ? 'partly solved' : 'not solved'}. Verdict above the prompt.`
  } catch (err) {
    say($, `check failed: ${err}`)
    return 'No verdict: the check failed (see the debug log).'
  } finally {
    isChecking = false
    await update($, phaseAtom, () => 'idle').catch(() => undefined)
    if (queuedSeq === turnSeq && checkedSeq !== turnSeq) {
      $.clock.after(0, () => {
        void check($, false)
      })
    }
  }
}

const dismiss = ($: EngineInterface) => () => {
  void update($, verdictAtom, () => null).catch(() => undefined)
}

// Clear first so the band does not show a verdict about the turn being replaced.
const send = ($: EngineInterface, text: string) => () => {
  void (async () => {
    try {
      await update($, verdictAtom, () => null)
      await $.prompt.submit({ text, asUser: true })
    } catch (err) {
      say($, `submit failed: ${err}`)
      $.ui.toast('Could not send that next step (see the debug log)')
    }
  })()
}

const LABEL = { yes: 'Solved', partly: 'Partly solved', no: 'Not solved' } as const
const COLOR = { yes: 'green', partly: 'yellow', no: 'red' } as const
const ICON = { yes: '✓', partly: '◐', no: '✗' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    await $.command
      .register({
        name: 'supervisor',
        description: 'Turn-end supervisor: on, off, or now (next-steps-supervisor)',
        argumentHint: '[on|off|now]',
      })
      .catch(err => say($, `/supervisor not registered: ${err}`))

    return result
  })

  // A /clear raises no session.start, only this; the old verdict must go with it.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, verdictAtom, () => null).catch(() => undefined)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    turnSeq += 1
    tools = 0
    changes = 0
    lastAnswer = ''
    await update($, verdictAtom, () => null).catch(() => undefined)
    // An older fork still out is about the replaced turn; stop saying "checking".
    await update($, phaseAtom, () => 'idle').catch(() => undefined)

    return next(e)
  })

  // Only the main loop's calls count: a subagent's work is judged through the
  // main thread's account of it.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      tools += 1
      if (result.deny === undefined && result.isReadOnly !== true) changes += 1
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) lastAnswer = e.answer

    const isWorthChecking =
      e.agentId === undefined &&
      e.reason === 'answer' &&
      checkedSeq !== turnSeq &&
      (changes > 0 || tools >= MANY_TOOL_CALLS)

    if (!isWorthChecking || !(await isOn($))) return result

    // The fork runs on a timer so the turn ends at once instead of waiting on it.
    if (isChecking) {
      queuedSeq = turnSeq
      return result
    }

    $.clock.after(0, () => {
      void check($, false)
    })

    return result
  })

  on('command.run', { command: 'supervisor' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'now') return { text: await check($, true) }

    const turnOn = arg === 'on' ? true : arg === 'off' ? false : arg === '' ? !(await isOn($)) : undefined
    if (turnOn === undefined) return { text: 'Usage: /supervisor [on|off|now]' }

    try {
      await $.store.set('isOn', turnOn)
      if (!turnOn) await update($, verdictAtom, () => null)
    } catch (err) {
      return { text: `next-steps-supervisor: could not save the setting (${err})` }
    }

    return {
      text: turnOn
        ? 'Supervisor is on: after a turn that changed something or ran 8+ tools, one forked check draws a verdict.'
        : 'Supervisor is off: no forks until /supervisor on. /supervisor now still works.',
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const verdict = await read($, verdictAtom)
    const phase = await read($, phaseAtom)
    // Whatever other mods (quiz-after, token-weather...) draw goes under ours.
    const below = await next(e)

    if (e.props.hasSurvey || (verdict === null && phase === 'idle')) return below

    const { Box, Button, Text } = $.ui.resolve(e)

    if (verdict === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Supervisor: checking whether that turn met the goal…</Text>
          {below}
        </Box>
      )
    }

    const { cached, input, output } = verdict.cost
    const color = COLOR[verdict.solved]
    const buttons = (
      <Box>
        {verdict.next.map((step, i) => (
          <Box key={`supervisor-step-${i}`}>
            <Button
              key={`supervisor-next-${i}`}
              hotkey={NEXT_HOTKEYS[i]}
              label={step.length > 60 ? `${step.slice(0, 59)}…` : step}
              variant={i === 0 ? 'primary' : undefined}
              onPress={send($, step)}
            />
            <Text> </Text>
          </Box>
        ))}
        <Button key="supervisor-dismiss" role="dismiss" label="Dismiss" dimColor onPress={dismiss($)} />
      </Box>
    )

    if (isClean(verdict)) {
      return (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text color={color} bold>
              {ICON.yes} Supervisor: {LABEL.yes}
            </Text>
            <Text dimColor> · {verdict.goal}</Text>
          </Text>
          {buttons}
          {below}
        </Box>
      )
    }

    const section = (title: string, items: string[], tint?: string) =>
      items.length === 0 ? null : (
        <Box flexDirection="column">
          <Text bold color={tint}>
            {title}
          </Text>
          {items.map((item, i) => (
            <Text key={`supervisor-${title}-${i}`} wrap="wrap">
              {'  '}· {item}
            </Text>
          ))}
        </Box>
      )

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={color} bold>
            {ICON[verdict.solved]} Supervisor: {LABEL[verdict.solved]}
          </Text>
          <Text dimColor>
            {' '}
            · fork: {short(cached)} cached, {short(input)} new, {short(output)} out
          </Text>
        </Text>
        {verdict.goal === '' ? null : <Text wrap="wrap">Goal: {verdict.goal}</Text>}
        {section('Gaps', verdict.gaps, 'yellow')}
        {section('Shortcuts taken', verdict.shortcuts, 'magenta')}
        {section('Needs your OK', verdict.needsApproval, 'red')}
        {buttons}
        {below}
      </Box>
    )
  })
}
