import type { Solved, Verdict } from '../types'

// Past this the final reply costs more full-price input than it adds; the
// claims a supervisor checks ("tests pass", "done") sit near its end anyway.
const ANSWER_CHARS = 4000

// The fork replays the main thread's last request, and the final reply is that
// request's response, so it is most likely not in what the fork sees. Quote it,
// or the supervisor never reads the claims it is meant to check. No tools:
// every fork tool is denied.
export const forkPrompt = (answer: string) =>
  [
    'Pause the work. You are now a supervisor reviewing the conversation above, not continuing it.',
    'Do not call tools. Judge the most recent task against what the user originally asked for.',
    ...(answer.trim() === ''
      ? []
      : [
          '',
          'The assistant\'s final reply to the user for this task (it may not appear above) was:',
          '<final-reply>',
          answer.length > ANSWER_CHARS ? `…${answer.slice(-ANSWER_CHARS)}` : answer,
          '</final-reply>',
        ]),
    '',
    'Answer with one JSON object and nothing else:',
    '{"goal": string, "solved": "yes" | "partly" | "no", "gaps": string[], "shortcuts": string[], "needsApproval": string[], "next": string[]}',
    '',
    '- goal: the user\'s original goal for this task, in one sentence.',
    '- solved: did the work as it stands actually achieve that goal?',
    '- gaps: parts of the goal still not met.',
    '- shortcuts: where the work was lazy: verification skipped, tests not run, code stubbed or left TODO, a claim made without checking, a simpler fix chosen over the correct one.',
    '- needsApproval: things done or proposed that the user should have approved first (destructive commands, pushes, new dependencies, work outside the request).',
    '- next: at most 2 next steps, each written as a prompt the user could send as is.',
    '',
    'Use empty arrays when there is nothing to say. Be specific and brief: each item under 20 words. Do not flatter.',
  ].join('\n')

const SOLVED: readonly Solved[] = ['yes', 'partly', 'no']

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const strings = (value: unknown, max: number) =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .slice(0, max)
        .map(v => clip(v.trim(), 240))
    : []

// Models wrap JSON in fences or a sentence often enough that a strict parse
// would drop good verdicts; take the outermost braces and validate the shape.
export const parseVerdict = (text: string): Omit<Verdict, 'cost'> | null => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }

  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const solved = SOLVED.find(s => s === o.solved)
  if (solved === undefined) return null

  return {
    goal: typeof o.goal === 'string' ? clip(o.goal.trim(), 240) : '',
    solved,
    gaps: strings(o.gaps, 3),
    shortcuts: strings(o.shortcuts, 3),
    needsApproval: strings(o.needsApproval, 3),
    next: strings(o.next, 2),
  }
}

// One line is enough when there is nothing for the person to act on.
export const isClean = (v: Pick<Verdict, 'solved' | 'gaps' | 'shortcuts' | 'needsApproval'>) =>
  v.solved === 'yes' && v.gaps.length === 0 && v.shortcuts.length === 0 && v.needsApproval.length === 0
