# Decisions

## The mod reads the board through Claude's own tool

`ArtifactData` is a built-in tool in this build. It appears in
`BuiltinToolInputs`, and its result record is in `BuiltinToolResults`: the
`db_read` arm holds `docs: { id, data, version }[]` and `next_cursor`, and the
`db_write` arm holds `committed`. `$.tool.call` raises the same `tool.call`
event the model's calls do, so a hooks module can list a collection directly.
No route is more direct than this.

Rejected:

- **`$.http.fetch` with `$.session.authorize()` against claude.ai.** The auth
  handle reaches first-party hosts, but the artifact database endpoint is not
  declared anywhere. Building on a private URL would break silently on the next
  release.
- **`$.mcp.call`.** The artifact tools are built-in tools, not an MCP server's.
- **`$.model.fork` / `$.agent.spawn` / `$.process.run('claude -p')`.** A fork has
  no tools. A spawn or a child session would spend model tokens to do what a
  plain tool call does for free.
- **Asking Claude to read the board every turn.** That costs tokens on every
  turn and fills the context with board rows.

## Mirror plus read, not read alone

The `tool.call` observer applies Claude's writes from the call's own input,
inline `data` or the `file_path` JSON, the moment they commit. The summary moves
when Claude moves a card, not two minutes later. Those counts are marked
`unconfirmed` until a whole `list` lands, because the input is what Claude asked
for, not what the database holds. The mod skips any write whose
`db_write.committed` is `false`.

## Never a surprise dialog

An automatic read happens only when `$.tool.check` already answers `allow`.
Otherwise the line asks for `/board refresh`, which may open the dialog because
the person asked for it. A plugin's `$.tool.call` goes through the permission
check and its dialog. A dialog popping up at turn end with no visible cause
would be worse than a stale count.

## Gating

There is no model call, so the gate is about network and permission noise. The
mod reads at turn end only after a write needs confirming, or once the mirror is
older than 2 minutes, and never in a subagent's turn. It does not poll on a
timer: a timer would read while nobody is looking, and the docs do not say
whether a plugin's tool call from a timer can open a dialog.

## Telling Claude about the board

`prompt.context` adds one `projectBoard` block, once per conversation. It sits
in the first message, so it is part of the cached prefix and costs about 130
input tokens once. Rejected: `prompt.section`, which goes into the system prompt
and gets re-rendered whenever it is invalidated, and a per-turn reminder, which
would cost tokens every turn. A board linked mid-session gets the brief as the
`/board` command's `context` instead. Invalidating `prompt.context` would
re-render the first message and break the cache.

## Where the link lives

`.claude/board.json` in the repo comes first, so every Claude in the project,
on any machine, finds the same board. That is the point of shared state.
`$.store` keyed by project root comes second, for personal use. The mod never
writes the repo file itself.

## State shape

`view` is a small derived summary (column counts, freshness, last move). The
cards are not in it, so other mods can read it cheaply and the band redraws
only when it changes. The cards live in module memory and in `$.store` (capped
at 500), so a reload or a new session starts from the last mirror.

## Fixed in the independent check

- `/board off` did not stop the read at session start: `refresh` is now a no-op
  for every unasked read while the mod is off (test: "/board off also stops the
  read at session start").
- A `list` Claude ran with `out_dir` answers with file paths, not documents; the
  text fallback then found an empty array and wiped the mirror to zero. Reads
  with `out_dir` or `as_level` are now ignored, and a `db_read` record without
  `docs` is never re-parsed from text.
- A `profiles` lookup was treated as a write and marked the mirror dirty,
  costing a needless read at turn end. Only `set`, `update`, `delete`,
  `str_replace` and `batch` count as writes now.
- A write whose `file_path` could not be read aborted the rest of a batch
  before the mirror was marked dirty; the read now fails soft.
- A failed first load (`ensure`) was cached for the whole session; it now
  retries on the next call. Cards restored from `$.store` are re-checked
  rather than cast.

## Assumptions I could not verify

- That a plugin's `$.tool.call({ tool: 'ArtifactData', ... })` works in a live
  session. It works in the test kit, where the test answers beneath, and it
  type-checks against the 2.1.286 declarations. I have not run it against a
  real artifact.
- That a deferred tool (`ArtifactData` is deferred behind ToolSearch in the
  session I built this in) can be called by a plugin without the model loading
  it first. The mod treats a rejected call as "not available here" rather than
  gating on `$.tool.list()`.
- That a plugin's own tool call stays out of the model's context. The types say
  its result `context` is "none on a plugin's own `$.tool.call`" and that core's
  messages "stay on the host side", but I have not seen it in a transcript.
- That a real `db_read.docs[].data` holds the fields the page wrote, top level.
  The text fallback walks any JSON for document arrays in case a build answers
  without the record.
- That `$.tool.check` for `ArtifactData` answers `allow` under an allow rule
  named `ArtifactData`. The rule syntax for this tool is not documented.
- That a batch which commits "one at a time" (no pinned entry) reports partial
  success in a way `committed` captures. The mod marks the mirror unconfirmed
  either way, so the next read corrects it.
- That `session.start` runs again after a hot reload. In case it doesn't, the
  command also registers lazily at the next turn end.
