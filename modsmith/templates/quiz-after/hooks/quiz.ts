import type { Quiz, QuizQuestion, QuizTag } from '../types'

// Pure helpers: no $, so the parsing and the card shape can be tested anywhere.

const TAGS: QuizTag[] = ['terminology', 'mechanism', 'derivation', 'transfer', 'big-picture']
const MAX_QUESTIONS = 3
const MAX_FIELD = 400

export const forkPrompt = (isForced: boolean) =>
  [
    '[quiz-after] Step outside the task for this one reply. Do not call any tools.',
    isForced
      ? 'Treat the work done so far in this conversation as finished, and answer with "done": true.'
      : 'First decide: is the task the user most recently asked for now complete, actually implemented rather than planned, half-done or waiting on the user? If it is not, reply with exactly {"done": false} and nothing else.',
    'If it is complete, reply with one JSON object and nothing else, no prose and no code fence:',
    '{"done": true, "title": "<4 to 8 words naming what was built>", "questions": [{"q": "...", "choices": ["...", "..."], "answer": "...", "why": "...", "tag": "mechanism"}]}',
    'Write 2 or 3 questions about what was actually implemented in this conversation: why it was built this way, how the pieces connect, what would happen if something changed.',
    'Test understanding, not trivia: no file names, line numbers, flag spellings or identifiers to recall.',
    '"choices" is optional: 3 or 4 options, and "answer" must then be one of them word for word.',
    '"why" is one sentence. "tag" is one of terminology, mechanism, derivation, transfer, big-picture.',
    'Keep every string under 300 characters.',
  ].join('\n')

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, MAX_FIELD) : undefined

const toQuestion = (raw: unknown): QuizQuestion | undefined => {
  if (typeof raw !== 'object' || raw === null) return undefined
  const fields = raw as Record<string, unknown>
  const q = text(fields.q)
  const answer = text(fields.answer)
  if (q === undefined || answer === undefined) return undefined

  const tag = TAGS.find(t => t === fields.tag) ?? 'mechanism'
  const why = text(fields.why) ?? ''
  const choices = Array.isArray(fields.choices)
    ? fields.choices.map(text).filter((c): c is string => c !== undefined).slice(0, 4)
    : []

  // Choices that do not contain the answer would mark every option wrong; drop them.
  return choices.length >= 2 && choices.includes(answer)
    ? { q, choices, answer, why, tag }
    : { q, answer, why, tag }
}

export type Parsed =
  | { kind: 'not-done' }
  | { kind: 'quiz'; title: string; questions: QuizQuestion[] }
  | { kind: 'unreadable' }

// The fork answers in prose often enough that the object is cut out of whatever came back.
export const parseReply = (reply: string): Parsed => {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return { kind: 'unreadable' }

  let raw: unknown
  try {
    raw = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return { kind: 'unreadable' }
  }
  if (typeof raw !== 'object' || raw === null) return { kind: 'unreadable' }

  const fields = raw as Record<string, unknown>
  if (fields.done !== true) return { kind: 'not-done' }

  const questions = Array.isArray(fields.questions)
    ? fields.questions
        .map(toQuestion)
        .filter((q): q is QuizQuestion => q !== undefined)
        .slice(0, MAX_QUESTIONS)
    : []
  if (questions.length === 0) return { kind: 'unreadable' }

  return { kind: 'quiz', title: text(fields.title) ?? 'This session', questions }
}

// explain-this card schema, as scripts/sm2.ts `add` stores it.
export type Card = {
  id: string
  artifact: { title: string; source: string; explained: string }
  question: string
  answer: string
  type: 'recall' | 'transfer' | 'explain-back'
  tags: string[]
  state: { interval_days: number; ease: number; due: string; reps: number; lapses: number }
  history: { ts: string; result: 'hit' | 'partial' | 'miss'; mode: 'inline' | 'review' }[]
  status: 'active' | 'retired' | 'suspended'
}

// sm2.ts compares due dates as local YYYY-MM-DD strings.
export const localDate = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

export const toCards = (quiz: Quiz, source: string, nowMs: number): Card[] => {
  const today = localDate(nowMs)
  const stamp = nowMs.toString(36)

  // Free-text review grades against the answer, so the reason travels with it.
  return quiz.questions.map((q, i) => ({
    id: `card_quiz_${slug(quiz.title) || 'session'}_${stamp}_${i + 1}`,
    artifact: { title: quiz.title, source, explained: today },
    question: q.q,
    answer: q.why === '' ? q.answer : `${q.answer} (${q.why})`,
    type: q.tag === 'transfer' ? 'transfer' : 'recall',
    tags: [q.tag],
    state: { interval_days: 0, ease: 2.5, due: today, reps: 0, lapses: 0 },
    history: [],
    status: 'active',
  }))
}

// Appends to an existing JSONL body, skipping ids or questions already in the deck.
export const appendCards = (existing: string, cards: Card[]) => {
  const seen = new Set<string>()
  for (const line of existing.split('\n')) {
    try {
      const card = JSON.parse(line) as Partial<Card>
      if (typeof card.id === 'string') seen.add(card.id)
      if (typeof card.question === 'string') seen.add(card.question)
    } catch {
      // A line sm2.ts would reject is left exactly as it is.
    }
  }

  const fresh = cards.filter(c => !seen.has(c.id) && !seen.has(c.question))
  const head = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`
  const body = fresh.map(c => JSON.stringify(c)).join('\n')

  return { text: fresh.length === 0 ? existing : `${head}${body}\n`, added: fresh.length }
}
