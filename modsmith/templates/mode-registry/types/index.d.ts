// The mode-registry contract. Self-contained on purpose: /plugin-types copies
// this file into every dependent's .claude/types, so it imports nothing.

// One mode a plugin offers. Plain JSON: it crosses plugins through $.state,
// so it cannot carry a function. What a mode *does* stays in the plugin that
// offered it, which reads `active` and applies its own behaviour.
export type ModeSpec = {
  // Stable, lowercase, what `/mode <id>` takes. Prefix it if it might clash.
  id: string
  // Short, shown in the prompt footer and the picker.
  label: string
  // One line: what changes while it is active.
  description: string
  // The offering plugin's manifest name, so the picker can say who owns it.
  owner: string
}

declare module 'claude-code' {
  interface PluginState {
    'mode-registry': {
      // Every mode on offer. Owned by mode-registry; other plugins add theirs
      // by hooking state.set on this key and rewriting e.value.
      catalog: ModeSpec[]
      // The active mode's id, or null for none. Read it; never assume it is in
      // the catalog (its owner may have been unloaded).
      active: string | null
      // True while the /mode picker is open above the prompt.
      isPicking: boolean
    }
  }
}
