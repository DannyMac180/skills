import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Quiz, QuizPhase } from '../types'
import { appendCards, forkPrompt, parseReply, toCards } from './quiz'

const quizAtom = atom({ plugin: 'quiz-after', key: 'quiz' } as const, null as Quiz | null)
const phaseAtom = atom({ plugin: 'quiz-after', key: 'phase' } as const, 'idle' as QuizPhase)

const BOOKKEEPING = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskStop', 'AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode', 'ToolSearch'])

const short = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${n}`)

const isOn = async ($: EngineInterface) => (await $.store.get('isOn').catch(() => true)) !== false

const say = ($: EngineInterface, line: string) => $.ui.log(`quiz-after: ${line}`, { to: 'debug' })

// Per-turn bookkeeping. Module variables are fine here: a reload mid-turn
// only costs one skipped quiz, and nothing draws from them.
let turnSeq = 0
let changes = 0
let isAsking = false

// One fork per call. Resolves a line for /quiz now; never rejects.
const ask = async ($: EngineInterface, isForced: boolean): Promise<string> => {
  if (isAsking) return 'A quiz check is already running.'
  isAsking = true
  const seq = turnSeq

  try {
    await update($, phaseAtom, () => 'checking')
    const reply = await $.model.fork({ prompt: forkPrompt(isForced) })

    if (!reply.isAnswered) {
      say($, `no quiz (${reply.reason})`)
      return `No quiz: the fork did not answer (${reply.reason}).`
    }

    // A new prompt went in while the fork ran: that quiz is about stale work.
    if (seq !== turnSeq && !isForced) return 'Skipped: a new turn started.'

    const parsed = parseReply(reply.text)
    const { usage } = reply
    const cost = {
      cached: usage.cache_read_input_tokens ?? 0,
      input: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0),
      output: usage.output_tokens,
    }

    if (parsed.kind === 'not-done') return 'The fork judged the task not finished yet, so no quiz.'
    if (parsed.kind === 'unreadable') {
      say($, `unreadable reply: ${reply.text.slice(0, 120)}`)
      return 'The fork answered, but not with a quiz this mod could read.'
    }

    const quiz: Quiz = { ...parsed, revealed: [], isSaved: false, cost }
    await update($, quizAtom, () => quiz)
    return `Quiz ready above the prompt: ${quiz.questions.length} questions.`
  } catch (err) {
    say($, `ask failed: ${err}`)
    return 'No quiz: the check failed (see the debug log).'
  } finally {
    isAsking = false
    await update($, phaseAtom, () => 'idle').catch(() => undefined)
  }
}

const saveToDeck = async ($: EngineInterface) => {
  try {
    const quiz = await read($, quizAtom)
    if (quiz === null || quiz.isSaved) return

    const home = (await $.env.get('EXPLAIN_THIS_HOME')) || `${(await $.env.get('HOME')) ?? '~'}/.explain-this`
    const memory = `${home}/memory`

    // explain-this owns that folder; a quiz never creates it.
    if (!(await $.fs.exists(memory))) {
      $.ui.toast(`No explain-this deck at ${memory}, so nothing was saved`, { timeoutMs: 6000 })
      return
    }

    const path = `${memory}/cards.jsonl`
    const existing = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
    const cards = toCards(quiz, await $.session.cwd(), await $.clock.now())
    const { text, added } = appendCards(existing, cards)

    if (added > 0) await $.fs.write(path, text)
    await update($, quizAtom, q => (q === null ? q : { ...q, isSaved: true }))
    $.ui.toast(added > 0 ? `Saved ${added} cards to your explain-this deck` : 'Those cards are already in your deck')
  } catch (err) {
    say($, `save failed: ${err}`)
    $.ui.toast('Could not save to the explain-this deck (see the debug log)')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    await $.command
      .register({ name: 'quiz', description: 'Quiz after finished tasks: on, off, or now (quiz-after)', argumentHint: '[on|off|now]' })
      .catch(err => say($, `/quiz not registered: ${err}`))

    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, quizAtom, () => null).catch(() => undefined)
    }

    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    turnSeq += 1
    changes = 0

    return next(e)
  })

  // A turn counts as having done something once a main-loop tool ran that was
  // not read-only. Subagents' own calls are skipped: delegating already shows
  // as the main loop's Agent call, and another mod's background agent is not
  // this task's work. Bookkeeping tools change no code, so they never pay a fork.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const isChange = result.deny === undefined && result.isReadOnly !== true && !BOOKKEEPING.has(e.tool)
    if (e.agentId === undefined && isChange) changes += 1

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const isWorthAsking = e.agentId === undefined && e.reason === 'answer' && changes > 0 && !isAsking

    // The fork runs on a timer so the turn ends at once instead of waiting on it.
    if (isWorthAsking && (await isOn($))) {
      $.clock.after(0, () => {
        void ask($, false)
      })
    }

    return result
  })

  on('command.run', { command: 'quiz' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'now') return { text: await ask($, true) }

    const turnOn = arg === 'on' ? true : arg === 'off' ? false : arg === '' ? !(await isOn($)) : undefined
    if (turnOn === undefined) return { text: 'Usage: /quiz [on|off|now]' }

    try {
      await $.store.set('isOn', turnOn)
      if (!turnOn) await update($, quizAtom, () => null)
    } catch (err) {
      return { text: `quiz-after: could not save the setting (${err})` }
    }

    return {
      text: turnOn
        ? 'quiz-after is on: after a turn that changed something, one forked check may draw a quiz.'
        : 'quiz-after is off: no forks until /quiz on. /quiz now still works.',
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const quiz = await read($, quizAtom)
    const phase = await read($, phaseAtom)
    const below = await next(e)

    if (e.props.hasSurvey || (quiz === null && phase === 'idle')) return below

    const { Box, Button, Text } = $.ui.resolve(e)

    if (quiz === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Quiz: checking whether that task is finished…</Text>
          {below}
        </Box>
      )
    }

    const reveal = (i: number) => () => {
      void update($, quizAtom, q => (q === null ? q : { ...q, revealed: [...q.revealed, i] })).catch(() => undefined)
    }
    const dismiss = () => {
      void update($, quizAtom, () => null).catch(() => undefined)
    }
    const { cached, input, output } = quiz.cost

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold color="cyan">
            Quiz
          </Text>
          <Text dimColor>
            {' '}
            · {quiz.title} · fork: {short(cached)} cached, {short(input)} new, {short(output)} out
          </Text>
        </Text>
        {quiz.questions.map((q, i) => (
          <Box flexDirection="column">
            <Text wrap="wrap">
              <Text bold>{i + 1}. </Text>
              {q.q}
            </Text>
            {(q.choices ?? []).map((c, j) => (
              <Text wrap="wrap" dimColor>
                {'   '}
                {String.fromCharCode(97 + j)}) {c}
              </Text>
            ))}
            {quiz.revealed.includes(i) ? (
              <Text wrap="wrap">
                <Text color="green">{'   '}→ {q.answer}</Text>
                {q.why === '' ? '' : <Text dimColor> {q.why}</Text>}
              </Text>
            ) : (
              <Button key={`reveal-${i}`} hotkey={String(i + 1)} label={`Reveal answer ${i + 1}`} dimColor onPress={reveal(i)} />
            )}
          </Box>
        ))}
        <Box>
          {quiz.isSaved ? (
            <Text dimColor>Saved to deck </Text>
          ) : (
            <Button key="save" hotkey="s" label="Save to deck" onPress={() => void saveToDeck($)} />
          )}
          <Text> </Text>
          <Button key="dismiss" hotkey="x" role="dismiss" label="Dismiss" onPress={dismiss} />
        </Box>
        {below}
      </Box>
    )
  })
}
