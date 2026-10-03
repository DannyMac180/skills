import { expect, test } from 'claude-code/testing'

import { appendCards, parseReply, toCards } from '../hooks/quiz'

const reply = (body: unknown) => `Here you go:\n${JSON.stringify(body)}\nDone.`

test('a fork that says not done draws no quiz', async () => {
  expect(parseReply('{"done": false}').kind).toBe('not-done')
  expect(parseReply('I think it is finished.').kind).toBe('unreadable')
})

test('questions are cut out of prose, cleaned and capped at three', async () => {
  const parsed = parseReply(
    reply({
      done: true,
      title: 'Retry queue',
      questions: [
        { q: 'Why back off?', answer: 'To shed load', why: 'Retries pile up', tag: 'mechanism' },
        { q: 'Which?', choices: ['a', 'b'], answer: 'c', why: '', tag: 'nope' },
        { q: 'Third', answer: 'x', why: 'y', tag: 'transfer' },
        { q: 'Fourth', answer: 'x', why: 'y' },
      ],
    }),
  )

  expect(parsed.kind).toBe('quiz')
  if (parsed.kind !== 'quiz') return
  expect(parsed.questions.length).toBe(3)
  expect(parsed.questions[1]?.choices).toBeUndefined()
  expect(parsed.questions[1]?.tag).toBe('mechanism')
})

test('cards carry the explain-this shape and are not saved twice', async () => {
  const quiz = {
    title: 'Retry queue',
    questions: [{ q: 'Why back off?', answer: 'To shed load', why: 'Retries pile up', tag: 'mechanism' as const }],
    revealed: [],
    isSaved: false,
    cost: { cached: 0, input: 0, output: 0 },
  }
  const cards = toCards(quiz, '/work/app', Date.UTC(2026, 9, 2, 12))
  const card = cards[0]

  expect(card?.state).toEqual({ interval_days: 0, ease: 2.5, due: card?.artifact.explained, reps: 0, lapses: 0 })
  expect(card?.status).toBe('active')
  expect(card?.answer).toBe('To shed load (Retries pile up)')

  const first = appendCards('', cards)
  expect(first.added).toBe(1)
  expect(appendCards(first.text, cards).added).toBe(0)
})
