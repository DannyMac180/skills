# claude-mod-builder

A skill for building **Claude Mods** — Claude Code plugins whose behaviour
lives in a function-hooks module, hooking the engine's events as TypeScript
functions `($, e, next)`.

Function hooks are Express/Koa middleware for the CLI itself: `$` is the only
way out of the sandbox, registration order is nesting, and `next` is the
continuation.

## What's here

| Path | |
| --- | --- |
| `SKILL.md` | The skill: the model, the build steps, the gotchas that matter most |
| `references/api.md` | Event inventory, `$` noun inventory, tier semantics |
| `references/gotchas.md` | The undocumented traps, indexed by symptom |
| `references/testing.md` | The plugin test kit and `mock` |
| `templates/minimal/` | A complete, valid, do-nothing mod to copy |

## Requirements

- Claude Code **2.1.269+** (first build whose function hooks draw above the prompt)
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`

Function hooks are in **early access**. The API can change between releases
without notice. Run `/plugin-types` for the authoritative type declarations for
your build; the reference here reflects 2.1.272.

## Sources

- Design RFC: [anthropics/claude-code#91870](https://github.com/anthropics/claude-code/issues/91870)
- First-party mod source: [`mods/`](https://github.com/anthropics/claude-code/tree/main/mods)

## License

MIT
