export type LedgerKind = 'assumption' | 'decision' | 'considered-not-done'

export type LedgerEntry = {
  kind: LedgerKind
  text: string
  why?: string
  turn: number
}

declare module 'claude-code' {
  interface PluginState {
    'assumption-ledger': {
      pending: LedgerEntry[]
      shown: LedgerEntry[]
      turn: number
      isOff: boolean
    }
  }
}
