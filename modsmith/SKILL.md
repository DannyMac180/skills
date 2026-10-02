---
name: modsmith
description: >
  Patterns, cost review and ready templates for Claude Mods (Claude Code
  plugins whose behaviour is a function-hooks module). Adds what the built-in
  mod authoring does not: proven designs (fork-check-draw, tool + ledger, mode
  registry, artifact-backed state), prompt-cache and token-cost review, a
  vetting pass for someone else's mod, and rules for mods that compose. USE
  WHEN: build a mod, make a claude mod, mod templates, quiz me after each
  turn, assumptions tool / register_assumption, supervisor that checks the
  turn, next-steps check, mode selector / mode registry, effort by domain,
  model router that keeps the cache, prompt cache cost of a mod, what does
  this mod cost per turn, review or vet someone's mod before installing, mods
  that work together, Kanban artifact as shared project state. NOT FOR:
  classic shell-command hooks in settings.json (PreToolUse etc.), a plain
  skill or slash command, MCP server authoring, or looking up the hooks API
  itself (use the engine's plugin-authoring guidance and generated types).
---

# ModSmith

Claude Code ships its own mod authoring: the `plugin-authoring` skill and the
generated declarations (`claude-code.d.ts`, written beside every mod as
`.claude-plugin/types/claude-code/index.d.ts` and by `/plugin-types`). Those
are the API. This skill does not re-teach it. It adds four things on top:

1. **Patterns** that work, as complete templates you copy and change.
2. **Cost and prompt-cache review**: what a mod costs per turn, what breaks
   the cache, and how to vet someone else's mod before installing it.
3. **Composition**: how mods share a site, state and the cache.
4. **Decision notes**: every mod ships a `DECISIONS.md` of what was chosen,
   what was rejected and what is still unverified.

Harnesses go out of date fast. When anything here disagrees with the
generated declarations for the running build, the declarations win. Load the
built-in `plugin-authoring` skill for any API question.

## Step 1: Surface the unknowns

Before writing code, ask the few questions that decide the design. Use the
question tool (AskUserQuestion) when it is available, one round, and skip any
question the request already answers.

| Question | Why it decides the design |
| --- | --- |
| What should it show or change, and where? (band above the prompt, footer label, pane, a tool Claude calls, a rewrite of what runs) | Picks the event and the site |
| What triggers it? (every turn, turns that changed files, a slash command, a timer) | Picks the gate |
| May it spend tokens per turn, and roughly how many? (none / one cached fork on qualifying turns / more) | Fork, complete or no model call at all |
| Which mods must it work with? (quiz, supervisor, mode registry, token gauge...) | Shared sites, state contracts, hotkey clashes |

Say what you will assume for anything left unanswered, and record it in the
mod's `DECISIONS.md`.

## Step 2: Pick a pattern

| People ask for | Pattern | Template | Cost per turn |
| --- | --- | --- | --- |
| "Quiz me after each turn" | fork-check-draw | `templates/quiz-after` | 0 on chat/read-only/subagent turns; one cached fork after a main turn that changed something |
| "Check the work: goal met, lazy, needed approval?" | fork-check-draw | `templates/next-steps-supervisor` | 0 on chat/read-only turns; one cached fork after a turn that changed something or made 8+ calls |
| "Make Claude list its assumptions / what it skipped" | tool + ledger | `templates/assumption-ledger` | No model calls; ~200 cached input tokens for the tool definition; ~40-80 output per entry Claude records |
| "A mode switch other plugins can join", "effort by domain" | registry | `templates/mode-registry` + `templates/effort-modes` | No model calls; each effort switch costs one cache rebuild (measured ~10k tokens in a 37k session) |
| "A shared board several Claudes update" | artifact-backed state | `templates/artifact-dashboard` + `references/artifact-dashboard.md` | 0 model tokens (reads are tool calls); ~130 tokens once per conversation |
| Anything else | minimal | `templates/minimal` | 0 |

Figures are the templates' own estimates unless marked measured; each
template's README has the detail.

## Step 3: Build from the template

Copy the template folder, rename the plugin in `.claude-plugin/plugin.json`
(and its `PluginState` key in `types/index.d.ts`), then change behaviour.
The layout:

```
my-mod/
  .claude-plugin/plugin.json   name, version, description, author, license,
                               "types": "./types/index.d.ts" when it keeps $.state
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           export const register: Register = (on, options) => { ... }
  types/index.d.ts             declare module 'claude-code' { interface PluginState { 'my-mod': {...} } }
  tests/*.test.ts(x)           claude plugin test
  README.md                    what it does in plain words, cost per turn, composes with, install
  DECISIONS.md                 chosen / rejected / unverified
```

Rules every template follows, and yours should too:

- Call `next(e)` when not acting; answer without `next` only for your own
  command or tool, narrowed by a matcher.
- At a tree site, draw `{await next(e)}` beside your own tree; step aside
  when `e.props.hasSurvey`.
- Gate anything that costs tokens, and give it a slash command that turns it
  off (stored in `$.store`).
- Catch every `$` promise you don't return. Parse model JSON defensively.
- Never claim something works that you didn't verify. It goes in
  `DECISIONS.md` under "not verified".

## Step 4: Cost and cache review

Follow `references/cost-review.md`. In short:

```sh
claude plugin validate <mod>                  # what the engine sees it hook and call
bun scripts/audit-mod.ts <mod>                # cost, cache and reach heuristics
# or: node --experimental-strip-types --no-warnings scripts/audit-mod.ts <mod>
```

Read every hook the audit flags, then show the user the short report from
the end of `cost-review.md` (risk, tokens per turn, cache impact, off switch,
what it can touch). Mark estimates as estimates; measure with the snippets in
that file when it matters.

**Vetting someone else's mod before installing.** Same pass, stricter: read
the whole hooks module and everything it imports (including `Client`
modules), run validate and the audit on the folder, check each capability in
the vetting table in `cost-review.md` (`$.process`, `$.fs.write`,
`$.mcp.call`, `tool.check` allows, prompt rewrites are the ones to question
hardest), then load it alone in a scratch project with
`claude --debug --plugin-dir <dir>`. Give the user the report and let them
decide; don't install it for them.

## Step 5: Composition check

Per `references/composition.md`:

- Does it pass the chain on everywhere it isn't the answer?
- Does it draw with others (`{await next(e)}`, prop sites changed and passed
  on) and yield to surveys?
- Does it own its state and let others change it only by hooking
  `state.set`? Is the contract in `types/index.d.ts` and named in
  `plugin.json`?
- Do its hotkeys clash with mods it will sit beside? (quiz-after uses `1-3`,
  `s`, `x`; next-steps-supervisor `n`, `m`; mode-registry `0-9` in its
  picker.) A bare digit typed into an empty prompt presses a band Button.
- Does it change what the main thread sends (effort, model, system prompt)?
  Then it changes every fork-based mod's bill too: say so in the README.

## Step 6: Validate, test, load, share

```sh
claude plugin validate <mod>          # add --strict in CI
claude plugin test <mod>              # runs tests/*.test.ts(x) against the engine
claude --plugin-dir <mod>             # load from source; saving a file hot-reloads it
```

Type-check against the generated declarations with the `tsconfig.json` from
the d.ts header (the engine writes one beside a mod it loads from a folder).
`references/testing.md` covers the test kit's traps.

Share: a repo can be its own marketplace.

```sh
claude plugin marketplace add <owner>/<repo>
claude plugin install <plugin>@<marketplace>
```

Tell people what it costs per turn and how to turn it off, in the README's
first screen.

## Gotchas (checked against 2.1.286)

- **Don't declare, import or take a parameter named `h` or `Fragment`, and
  don't add a `@jsx` pragma.** JSX compiles to the global `h`; the engine
  prepends the pragma itself.
- **`Client` module paths are string literals.** A variable is refused at
  load.
- **`$.clock.now()` returns `Promise<number>`.** Await it.
- **Drawing above the prompt works on the terminal and the desktop app.**
  `AbovePrompt` is raised on those two surfaces; test both with the kit's
  `$.ui.mount` over `['terminal', 'desktop']`.
- **A render hook never writes state.** `$.state.set` while drawing is
  denied; write from a press handler or another event. State a drawing reads
  belongs in `$.state` (a hot reload loses module variables).
- **The band is capped at half the terminal's rows**, and redraws fold to ten
  a second (thirty for the band and the shown pane).
- **A hook has a 10 s budget**; `$` calls in flight don't count against it,
  but `$.clock.sleep` does. A failing hook is skipped and the chain goes on
  (fail open).
- **Headless runs:** a `claude -p` run reports a module that did not load on
  stderr, including when the function-hooks switch is off there; set
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in that process if so. Interactive
  sessions on this build needed no flag.

More, with symptoms: `references/gotchas.md`.

## Files

| Path | What |
| --- | --- |
| `references/cost-review.md` | Cache breakers, fork vs complete, per-turn gates, timers, growth, vetting table, measuring, the report |
| `references/composition.md` | Chain, shared sites, `$.state` contracts, ordering, cache etiquette, testing with inline plugins |
| `references/artifact-dashboard.md` | Artifact database as shared project state: what a mod can reach, the pattern, limits |
| `references/gotchas.md` | Traps by symptom |
| `references/testing.md` | `claude plugin test` and its traps |
| `scripts/audit-mod.ts` | Static cost/cache/reach audit of a mod folder |
| `templates/*` | Seven mods; each has README.md and DECISIONS.md |

## Where the ideas come from

The patterns follow Thariq Shihipar (Anthropic) on the Latent.Space podcast:
shareable mods that warn you about prompt-cache costs, forked subagents as the
cheap way to ask questions about a turn, a quiz after the turn, an assumptions
tool, a next-steps supervisor, mods that compose through a mode selector, and
artifact dashboards as shared project state.
