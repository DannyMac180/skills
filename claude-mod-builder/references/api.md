# API reference

Generated from the `claude-code.d.ts` that ships with Claude Code 2.1.272
(`mods/types/claude-code.d.ts` in `anthropics/claude-code`). Run
`/plugin-types` in your own session for the authoritative copy — it reflects
your build, this file reflects one build.

## Hookable events

Pass any of these to `on(event, [matcher], handler)`. `'*'` hooks every event,
including other plugins' calls on `$`. Glob matching works: `on('classic.*')`.

### Lifecycle
| Event | Fires |
| --- | --- |
| `engine.create` | The `$` fold. Add a noun here. |
| `plugin.register` | A plugin registers; carries its static-analysis metadata. |
| `session.start` | Session begins. Register commands here. |
| `session.attach` / `session.detach` | A surface attaches or leaves. |
| `session.receive` | A message arrives. |
| `session.compact` | Context compaction. |

### Turn and model
| Event | Fires |
| --- | --- |
| `turn.start` / `turn.complete` | A model turn's boundaries. |
| `turn.step` | **Streaming.** Takes an async generator, not a callback. The only hook that may yield. |
| `prompt.submit` | A prompt is submitted. Direct text only. |
| `prompt.section` / `prompt.context` / `prompt.fill` / `prompt.suggest` | Prompt assembly. |
| `skill.prompt` | A skill's prompt is assembled. |
| `attribution.text` | Attribution lines. |

### Tools and agents
| Event | Fires |
| --- | --- |
| `tool.call` | A tool runs. **You own calling it.** Covers MCP and non-MCP tools, and tool calls inside subagents. |
| `tool.check` | The permission check, before the call. Parallelisable — prefer it for guards. |
| `tool.describe` | How a tool is described to the model. |
| `agent.spawn` / `agent.offer` | Subagent lifecycle. |

### Commands and config
| Event | Fires |
| --- | --- |
| `command.run` / `command.describe` | A slash command runs or is described. |
| `config.set` / `config.describe` | Configuration. |

### UI
| Event | Fires |
| --- | --- |
| `ui.render` | A component draws. Narrow with `{ component: 'AbovePrompt' \| 'Pane' \| … }`. |
| `ui.press` | A Button is pressed — same event in terminal and desktop. |
| `ui.input` / `ui.select` / `ui.focus` / `ui.scroll` | Interaction. |
| `ui.message` | A surface module posts to its hooks module. |
| `ui.resolve` | Element-kit resolution. |

### Compatibility
`classic.PreToolUse` and friends wrap your existing shell hooks 1:1, same
in/out data interface.

## `$` inventory

Every affordance, by noun. All are async.

| Noun | Members |
| --- | --- |
| `$.fs` | `read` `write` `exists` `list` `stat` `ancestors` |
| `$.http` | `fetch` |
| `$.process` | `run` — the escape hatch to other languages |
| `$.clock` | `now` `sleep` `after` `every` — **`now()` returns a Promise** |
| `$.store` | `get` `set` `delete` `keys` — per-plugin persistence |
| `$.env` | `get` `set` |
| `$.settings` | `read` |
| `$.session` | `id` `cwd` `model` `repo` `surface` `surfaces` `messages` `turns` `usage` `authorize` |
| `$.command` | `register` `list` |
| `$.tool` | `register` `list` |
| `$.agent` | `list` |
| `$.model` | `complete` `classify` `fork` |
| `$.mcp` | `call` |
| `$.turn` | `abort` |
| `$.ui` | `log` `toast` `notice` `status` `open` `close` `invalidate` `blit` |
| `$.audio` | `play` `speak` |
| `$.telemetry` | `log` `mark` — only where the `telemetry` mod is loaded |

Nouns a mod adds in the `engine.create` fold are owned by that mod, which
keeps their types in its own `types/index.d.ts` and declares them on
`EngineInterface`. A mod calling another's noun reads that same file — never
copies it.

## Tiers

Outermost first: `prepend` → `user` → `append` → `builtin` → `core`.

- `prepend` — org-managed. Wraps everything, so it cannot be escaped.
- `user` — what a person installs. Order within the tier comes from plugins'
  declared dependencies, topo-sorted; not install time.
- `append` — org-managed, sits *beneath* user plugins. This is the position for
  redaction: whatever you remove here, nothing above can put back.
- `builtin` — Anthropic features shipped as mods.
- `core` — the actual side-effecting engine.

`next.to(e, tier)` skips ahead. When several hooks in a tier name different
targets, the engine takes the lowest.

## Renderable components

`AskUserQuestion` `UserMessage` `AssistantMessage` `ToolUse` `ToolResult`
`ToolGroup` `CommandOutput` `Spinner` `TurnDuration` `InfoNotice` `SessionMode`
`PromptHint` `AbovePrompt` `Pane`

The permission-request component is deliberately **not** hookable: a surface
declares what is hookable, and that one isn't.

### `AbovePrompt` props
| Prop | Meaning |
| --- | --- |
| `hasSurvey` | A survey holds the band — yield to it. |
| `isWorking` | A model turn is running. |
| `maxRows` | Rows you may take. A taller tree scrolls. |
| `bodyColumns` | Cells across. Size to this, not `viewport.columns`. |
| `scroll` | Engine-owned window over a taller tree. |
