# Artifact dashboard: shared project state in an artifact database

The idea: a dashboard artifact, typically a Kanban board, whose database
serves as persistent project state. Several Claude sessions read and write it,
and a mod shows a one-line summary of it above the prompt. Working template:
`templates/artifact-dashboard/`.

Do not re-teach the API here. This note covers what is true on this engine
(2.1.286 declarations) and the judgment calls.

## Facts, with where they come from

| Question | Answer | Source |
| --- | --- | --- |
| Can a hooks module reach the artifact database? | **Yes, through Claude's own tool.** `ArtifactData` is a built-in tool (`BuiltinToolInputs.ArtifactData`), and `$.tool.call({ tool: 'ArtifactData', action: 'list', url, collection })` raises the same `tool.call` event a model call does. | `claude-code.d.ts`: `$.tool.call`, `BuiltinToolInputs` |
| Is the read result typed? | Yes. `BuiltinToolResults.ArtifactData` is a union whose `db_read` arm has `docs: { id, data, version, updatedAt }[]` and `next_cursor`, and whose `db_write` arm has `committed`. Read `ran.result.db_read`, not the text. | `BuiltinToolResults` |
| Does a plugin's call skip permissions? | No. It goes through every other hook, the permission check and its dialog. `$.tool.check` answers the decision without running anything. | `$.tool.call`, `$.tool.check` docs |
| Can the mod see Claude's own board writes? | Yes. Hook `tool.call` with `{ tool: 'ArtifactData' }`, `await next(e)`, and read `e.action`, `e.doc_id`, `e.data` / `e.file_path` and `e.writes`. | `ToolCallInput` |
| `$.mcp.call`? | No. The artifact tools are not an MCP server's. | `$.mcp` takes a server name from `/mcp` |
| `$.http.fetch` with `$.session.authorize()`? | The handle reaches first-party hosts, but no artifact database endpoint is declared. **Do not build on a private URL.** | `$.http`, `SessionAuthorization` |
| `$.model.fork`? | Tool-less, so it cannot read the board. It can only reason over what the transcript already holds. | `$.model.fork` docs |
| Does the page push changes to the mod? | No. Nothing connects an open artifact page to a hooks module. The mod sees changes only when it reads. | (absence in the d.ts and reference.md) |
| Is it available everywhere? | Only where the session has the claude.ai artifact tools. Without them, `$.tool.call` rejects. | runtime |

## The pattern that works

1. **The board is an artifact with the `db` capability.** One collection
   (`cards`), one document per card: `{ title, column, owner }`. Claude builds
   the page. The mod does not ship HTML.
2. **Claude writes, through `ArtifactData`.** Its first message carries a
   short brief (`prompt.context`, once per conversation, in the cached prefix):
   read before writing, pin every write with `if_version`, and move only your
   own task's cards. The `if_version` pin keeps several Claudes from overwriting
   each other.
3. **The mod mirrors and reads.** A `tool.call` observer applies Claude's
   writes the moment they commit (skip `db_write.committed === false`) and
   marks them unconfirmed. Ignore reads that do not show the board as it
   stands: `out_dir` (files, not documents) and a lowered `as_level`; treat
   only `set`/`update`/`delete`/`str_replace`/`batch` as writes. A `list` at
   turn end confirms them, but only after a
   write or once the mirror is stale, and only when `$.tool.check` already
   says `allow`.
4. **The summary is `$.state`.** The band reads it, and so can any other mod.
   Keep the cards themselves out of state, and persist the mirror in `$.store`.
5. **The link lives in the repo** (`.claude/board.json`), so every session in
   the project finds the same board. A per-machine `/board <url>` is the
   fallback.

## Cost judgment

- Reading the board is a tool call, not a model call: **zero tokens**. Gate it
  for permission noise and network, not for tokens.
- The brief costs about 130 tokens, once per conversation, in the cached
  prefix. Don't put it in `prompt.section` or invalidate `prompt.context`
  mid-session; both re-render cached text. Linking mid-session sends the brief
  as the command's `context` instead.
- Never ask the model to read the board for the mod. That costs tokens on
  every turn and fills the context with rows.

## Limits, stated plainly

- **Freshness is pull-only.** Another session's or the page's changes appear
  at this session's next read: a turn end after the stale window, or
  `/board refresh`.
- **A silent read needs an allow rule.** Without one, the mod asks the person
  to run `/board refresh`, and that refresh may open the dialog. An allow rule
  for `ArtifactData` also lets Claude write without asking.
- **One page of 1000 cards.** Above that, the counts are partial and the line
  says so.
- **`/board off` cannot take back the brief** from a conversation whose first
  message already carries it; doing so would re-render the cached prefix.
- **Unverified live.** The template passes `claude plugin validate`, `tsc`
  against the 2.1.286 declarations, and `claude plugin test` (9 tests) with the
  engine answered beneath. It has not been run against a real artifact.
  `templates/artifact-dashboard/DECISIONS.md` lists each assumption.

## Composition

- Draw `{await next(e)}` under the line, so other bands survive.
- A supervisor or quiz mod can read
  `{ plugin: 'artifact-dashboard', key: 'view' }` and put it in its fork's
  prompt (a fork has no tools) to ask whether the turn moved the card it
  should have, without a board read of its own.
- A mode selector can hide the board for a mode by hooking `state.set` on
  `isOff`.
