export type Solved = 'yes' | 'partly' | 'no'

export type Cost = { cached: number; input: number; output: number }

export type Verdict = {
  goal: string
  solved: Solved
  gaps: string[]
  shortcuts: string[]
  needsApproval: string[]
  next: string[]
  cost: Cost
}

export type Phase = 'idle' | 'checking'

declare module 'claude-code' {
  interface PluginState {
    'next-steps-supervisor': { verdict: Verdict | null; phase: Phase }
  }
}
