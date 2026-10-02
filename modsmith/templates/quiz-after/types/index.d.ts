export type QuizTag = 'terminology' | 'mechanism' | 'derivation' | 'transfer' | 'big-picture'

export type QuizQuestion = {
  q: string
  choices?: string[]
  answer: string
  why: string
  tag: QuizTag
}

export type QuizCost = { cached: number; input: number; output: number }

export type Quiz = {
  title: string
  questions: QuizQuestion[]
  revealed: number[]
  isSaved: boolean
  cost: QuizCost
}

export type QuizPhase = 'idle' | 'checking'

declare module 'claude-code' {
  interface PluginState {
    'quiz-after': { quiz: Quiz | null; phase: QuizPhase }
  }
}
