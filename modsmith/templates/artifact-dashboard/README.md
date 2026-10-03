# artifact-dashboard

A shared Kanban board for a project, with a live one-line summary of it above
the prompt.

The board is a claude.ai artifact with a database: one document per card,
`{ title, column, owner }`. Every Claude session working on the project reads
and writes the same cards, so the board is shared project state rather than one
session's notes. This mod draws a line like this above the prompt:

```
▦ board todo 4  doing 2  review 1  done 9  · read 14:32 · Fix login → done
```

## What it does

- **Reads the board itself.** It calls Claude Code's own `ArtifactData` tool
  through `$.tool.call` (`action: 'list'`) and counts the cards per column.
  That's a tool call, not a model call, so it costs no tokens.
- **Watches Claude's writes.** A `tool.call` hook on `ArtifactData` sees every
  card Claude adds, moves or deletes on the linked board, and updates the
  summary immediately. Until the next read confirms them, the line says
  `unconfirmed`. A write whose `if_version` pin missed (`db_write.committed: false`)
  is ignored.
- **Tells Claude the board exists.** Once per conversation it adds a short
  `projectBoard` block (about 130 tokens) to the first message: the board's URL,
  the card shape, and the rule to read before writing, pin every write with
  `if_version`, and only move its own task's cards.
- **Never opens a permission dialog unasked.** Before an automatic read it
  asks `$.tool.check`. If the answer isn't `allow`, it skips the read and the
  line says `reading needs approval: run /board refresh`.

## Cost per turn

| When | Model tokens | Other |
| --- | --- | --- |
| First message of a conversation | about 130 input tokens, once (the `projectBoard` block). It sits in the cached prefix after that. | none |
| `/board <url>` mid-session | about 130 input tokens, once (the same brief, as the command's context) | one `ArtifactData` list |
| Turn end, after Claude wrote to the board | 0 | one `ArtifactData` list, if reading is allowed |
| Turn end, mirror older than 2 minutes | 0 | one `ArtifactData` list, if reading is allowed |
| Any other turn end | 0 | nothing |
| Drawing the line | 0 | reads `$.state` only |

The mod never calls `$.model.*` or spawns an agent. When Claude moves a card,
that's Claude's own tool call and is billed like any other tool call. Turn the
mod off with `/board off`: the line and the automatic reads stop at once, at
session start too, and stay off after a restart. The brief is not taken back
from a conversation that already carries it (that would re-render the cached
first message); conversations started while the mod is off get no brief.

## Set up

1. Ask Claude for the board, for example: "Make a Kanban artifact with a shared
   database. Collection `cards`, one document per card with `title`, `column`
   (backlog, todo, doing, review, blocked, done) and `owner`." Claude builds the
   page with the artifact `db` capability.
2. Link it. You can do this per machine:
   `/board https://claude.ai/artifact/<id>` (optionally followed by a collection
   name), which is stored per project root in this mod's `$.store`.
   Or link it once for everyone by committing `.claude/board.json`:
   ```json
   { "url": "https://claude.ai/artifact/<id>", "collection": "cards" }
   ```
   The repo file wins over the stored link, so every session in the project
   finds the same board.
3. Optional: to let the mod read on its own, allow `ArtifactData` in your
   permission settings. Without that, run `/board refresh` when you want a read.
   An allow rule for `ArtifactData` also lets Claude write without asking, so
   choose deliberately.

## Commands

`/board` shows the status. The subcommands:

- `/board <url> [collection]` links a board.
- `/board refresh` reads it now, and may ask for permission.
- `/board off` and `/board on` turn the mod off and on.
- `/board forget` drops the stored link.

## Composes with

- **Any band mod** (token-weather and others). It draws `{await next(e)}`
  under its own line, so other mods' bands still show.
- **A next-steps supervisor or quiz mod.** The summary is plain `$.state`
  that any plugin can read:
  `$.state.get({ plugin: 'artifact-dashboard', key: 'view' })` gives
  `{ columns, total, readAt, isConfirmed, lastMove, note }`. A supervisor mod
  can put that in its fork's prompt and ask "did this turn move the card it
  should have?" without a board read of its own (a fork has no tools).
- **A mode selector.** Another plugin can hide the board for a mode by hooking
  `state.set` on `{ plugin: 'artifact-dashboard', key: 'isOff' }`.

## Load it

```sh
claude plugin validate templates/artifact-dashboard
claude plugin test templates/artifact-dashboard
claude --plugin-dir templates/artifact-dashboard
```

It needs a session where `ArtifactData` exists, meaning one signed in to
claude.ai with artifacts. Without it, the line shows the last stored mirror and
says the tool isn't available.

## What it cannot see

- Changes made from the artifact page or by another session show up only at
  the next read (a turn end after 2 minutes, or `/board refresh`). Nothing
  pushes them to the mod.
- It counts at most 1000 cards (one `list` page). Above that, the line says the
  counts are partial.
- A card is any document with a `column` (or `status`, or `lane`). Documents
  without one are not counted.
- Claude's reads with `out_dir` (documents saved to files) or a lowered
  `as_level` are ignored: neither shows the board as it stands. `profiles`
  lookups are ignored too.
