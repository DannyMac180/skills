import type { EngineInterface, ModelEffort, Register } from 'claude-code'

// Three modes offered through mode-registry's contract. The effort is ours:
// the registry only stores ids, so what a mode does stays in this file.
const MODES = [
  { id: 'ui', label: 'UI', effort: 'low', description: 'Low effort, for layout, styling and copy changes' },
  { id: 'api', label: 'API', effort: 'medium', description: 'Medium effort, for endpoints, handlers and data work' },
  { id: 'review', label: 'Review', effort: 'max', description: 'Max effort, for code review and security' },
] as const satisfies readonly { id: string; label: string; effort: ModelEffort; description: string }[]

const effortOf = (id: string | null) => MODES.find(m => m.id === id)?.effort

// The mode a turn started in, by turnId. A switch mid-turn (a picker press)
// waits for the next turn, so one turn never changes effort between steps:
// each change of effort costs a messages-cache rebuild (see README).
const latched = new Map<string, ModelEffort | undefined>()

const activeEffort = async ($: EngineInterface) => {
  try {
    const { value = null } = await $.state.get({ plugin: 'mode-registry', key: 'active' })
    return effortOf(value)
  } catch (err) {
    $.ui.log(`effort-modes: could not read the active mode: ${err}`)
    return undefined
  }
}

export const register: Register = on => {
  // Offer our modes: every time the registry writes its catalog, add ours.
  // Filtering by id first keeps it idempotent if the write passes us twice.
  on('state.set', { plugin: 'mode-registry', key: 'catalog' }, ($, e, next) => {
    const ours = MODES.map(({ id, label, description }) => ({ id, label, description, owner: 'effort-modes' }))
    const ids = new Set<string>(MODES.map(m => m.id))

    return next({ ...e, value: [...e.value.filter(m => !ids.has(m.id)), ...ours] })
  })

  on('turn.start', async ($, e, next) => {
    latched.set(e.turnId, await activeEffort($))
    // A turn that never completes (a crash, a reload) must not grow the map.
    if (latched.size > 8) latched.delete(latched.keys().next().value ?? '')

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    latched.delete(e.turnId)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // Subagents keep their own effort: their loops have caches of their own
    // and were started at an effort someone chose for them.
    if (e.agentId !== undefined || e.effort === undefined) return yield* next(e)

    const effort = latched.has(e.turnId) ? latched.get(e.turnId) : await activeEffort($)

    if (effort === undefined || effort === e.effort) return yield* next(e)

    return yield* next({ ...e, effort })
  })
}
