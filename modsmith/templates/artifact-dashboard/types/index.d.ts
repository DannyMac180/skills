export type Card = { title: string; column: string; owner?: string }

export type BoardLink = { url: string; collection: string }

export type BoardColumn = { name: string; count: number }

// isConfirmed is false while the counts include writes this session observed
// but has not yet read back from the artifact.
export type BoardView = {
  columns: BoardColumn[]
  total: number
  readAt: number
  isConfirmed: boolean
  lastMove?: string
  note?: string
}

declare module 'claude-code' {
  interface PluginState {
    'artifact-dashboard': { view: BoardView | null; isOff: boolean }
  }
}
