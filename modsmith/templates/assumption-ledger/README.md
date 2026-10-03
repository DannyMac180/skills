# assumption-ledger

Claude gets a tool, `register_assumption`. While it works it uses the tool to
write down three kinds of thing:

- **assumption**: something it took for granted and did not check.
- **decision**: a fork in the road and the way it went.
- **considered-not-done**: a better or fuller fix it thought of and chose not
  to do. This is the one to watch. Models often see the right solution and
  then skip it, and you never find out.

When the turn ends, the list shows above the prompt, grouped by kind:

```
Ledger for this turn [ Dismiss ]
Considered, not done (1)
 · Add retry on 429 (out of scope)       [ Do it ]
Assumed (1)
 · Node 20 is the runtime
```

**Do it** sends Claude a follow-up asking it to do that item, or to say in one
line why it should stay undone. **Dismiss** clears the band. A new turn clears
it too.

## Commands

| Command | What it does |
| --- | --- |
| `/assumptions` | Prints every entry from this session, grouped by kind, with the turn each came from. |
| `/assumptions write [path]` | Appends the session's entries to `DECISIONS-log.md` (or `path`) in the working directory. Nothing is written to disk unless you run this. |
| `/assumptions off` | Stops recording and moves the tool behind ToolSearch, so the model stops seeing it. Remembered across sessions. |
| `/assumptions on` | Turns it back on. |

## What it costs

The mod makes **no model calls of its own**. Its cost is what the model
spends using the tool:

| When | Tokens | Notes |
| --- | --- | --- |
| Every request | about 200 input tokens | The tool's name, description and schema in the tool list. The description never changes, so after the first request this is a prompt-cache read (about a tenth of the price). |
| Each entry Claude records | about 40 to 80 output tokens, plus a 2-token result | One tool call. Claude often batches it with other tool calls in the same step; when it doesn't, the step after it re-reads the context from cache. |
| A turn where nothing was worth noting | 0 extra | The tool's description tells the model to skip the obvious. |
| `/assumptions off` and `on` | one cache rebuild each | Changing whether the tool is listed changes the tool list, which is part of the cached prefix. |
| **Do it** | one new turn | You are asking Claude to do more work, so that turn costs what the work costs. |

The band and the session log cost nothing in tokens. `/assumptions` prints
its list as a command-output row in the transcript; whether the model reads
that row on the next turn, as it does other command output, was not checked.

## Composes with

- **Anything drawing above the prompt.** The band draws whatever other mods
  draw there beneath its own list (`{await next(e)}`), and it steps aside while
  a survey holds the band or a turn is running.
- **A next-steps supervisor or quiz fork.** A fork that asks "did this solve
  the original goal, was it lazy?" can read this mod's state
  (`$.state.get({ plugin: 'assumption-ledger', key: 'pending' })`, which holds
  the current turn's entries until the next turn starts; `shown` is only
  filled once this mod's own `turn.complete` hook has run, so another mod's
  `turn.complete` may see it empty) and put the `considered-not-done` items
  in its question. That is cheaper and more honest
  than asking the fork to guess what was skipped.
- **A mode selector or model router.** A mode switches the ledger off by
  running `/assumptions off` through `$.command.run`: that stops recording,
  moves the tool behind ToolSearch and remembers the choice. Writing
  `{ plugin: 'assumption-ledger', key: 'isOff' }` through `state.set` alone
  only stops recording: the tool stays in the list (its `tool.describe`
  answer is cached until invalidated) and the choice is not remembered.
- **A shared project board.** `/assumptions write` gives a file another Claude
  or a dashboard can read.

## Install and load

```sh
claude --plugin-dir /path/to/assumption-ledger
```

Or copy the folder into your mods folder. Check it before loading:

```sh
claude plugin validate /path/to/assumption-ledger
claude plugin test /path/to/assumption-ledger
```

Built and checked against Claude Code 2.1.286.
