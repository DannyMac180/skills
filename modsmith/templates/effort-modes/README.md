# effort-modes

Three modes that set how hard Claude thinks, picked by the kind of work:

| Mode | Effort | For |
| --- | --- | --- |
| `ui` | low | layout, styling, copy, small UI changes |
| `api` | medium | endpoints, handlers, data work |
| `review` | max | code review and security |

Switch with `/mode ui`, `/mode api`, `/mode review` and `/mode off`. This
plugin needs **mode-registry**, which provides `/mode`, the picker and the
footer label. effort-modes lists mode-registry under `dependencies`, so
without the registry Claude Code doesn't load it at all and says why ("Dependency
"mode-registry" is not installed", in `claude --debug`; checked on 2.1.287 with
`--plugin-dir`). If the registry goes away mid-session, the hooks still pass
every request through unchanged (covered by a kit test, not tried live).

## How it works

On every model request of the **main thread**, while one of these modes is
active, the plugin rewrites the request's effort (`turn.step`,
`next({ ...e, effort })`). With no mode active, or a mode another plugin
offered, it passes the request on unchanged. It never touches:

- **subagents** (a step with `agentId`), which keep the effort they were
  started with and have caches of their own
- **models without an effort setting** (a step where `e.effort` is absent)
- **a turn already running.** The mode is read once at `turn.start`, so a
  picker press mid-turn takes effect on the next turn and one turn never
  changes effort between its steps.

## What it costs

effort-modes makes **no model calls of its own**. Switching modes is not
free, though, and you should know where the cost lands.

**Changing effort breaks the messages part of the prompt cache, once.** Effort
is a top-level request parameter. Anthropic's caching docs say a change to it
invalidates the cached conversation (the system prompt and tools stay cached
on most models). The next request re-writes the whole conversation to the
cache at the cache-write rate instead of reading it at the cache-read rate.
After that, the cache is warm again at the new effort.

Measured on Claude Code 2.1.287, `claude-opus-5-5`, one headless session of
about 37k tokens (a probe plugin beneath effort-modes logged each request's
effort and usage):

| Turn | Effort sent | Cache read | Cache write |
| --- | --- | --- | --- |
| 2 (no switch, control) | medium | 33,323 | 3,406 |
| 3 (after `/mode review`) | **max** | **23,387** | **13,528** |
| 4 (same mode) | max | 36,915 | 115 |
| 5 (after `/mode off`) | medium | 37,030 | 176 |

Turn 3 is the switch: about 10k tokens that were cached had to be written
again (the conversation; the system prompt and tools stayed cached). The
session's cost grew about $0.11 on that turn, against about $0.009 for a
steady turn like turn 4. At Opus 5.5's list prices ($4/MTok input, cache writes
1.25x, cache reads $0.20/MTok) the cache part of that is about
10k x ($5.00 - $0.20)/MTok, roughly $0.05; the rest is max effort's extra
thinking and output. The cache part scales with the conversation's length:
switching at 200k tokens re-writes about 200k, roughly $1 at those prices
(arithmetic, not measured).

Turn 5, switching back down, did **not** miss in this run. A likely reason,
not verified: cache entries are keyed by the effort they were written at, and
turn 2's medium-effort entry was still inside its 5-minute lifetime, so going
back to medium found it. If that is right, returning to an effort you used in
the last few minutes is cheap and anything else is a rebuild. Don't rely on
it: plan on one rebuild per switch in either direction.

Two more costs to keep in mind:

- **`review` at max effort thinks more**, which costs more output tokens on
  every turn while it's on. That's the point of the mode, but leave it when
  the review is done.
- **Fork-based mods may lose their cache hit while a mode is on.**
  `$.model.fork` reuses the main thread's cache "as the main thread last sent
  it". Whether a fork also sends the rewritten effort has not been checked.
  If it doesn't, a fork (quiz, supervisor) would miss the conversation cache
  while a mode is active. Check `usage.cache_read_input_tokens` on your fork's
  result.

**What to do with this:** switch at task boundaries ("now review this
branch"), not every prompt. Don't wire an auto-router that flips effort
turn by turn: each flip is a full conversation re-write.

**The cheaper route this mod can't use.** The API has a beta per-message
effort (`mid-conversation-output-config-2026-07-01`). It changes effort from a
point in the conversation without breaking the cache, on Opus 5 / 5.5, Sonnet
5.5 (with thinking on) and Fable 5.1. A mod would need to append a system
message with `output_config` and empty content. `$.session.append` only
appends text blocks in this release, and `turn.step` only exposes the
top-level `effort`. If the engine ever exposes it, switch to it.

**Why not prompt guidance instead of effort?** Adding a "think harder about
security" note costs nothing extra in cache terms if it's *appended* (a
user-role row through `$.session.append`), and a lot if it's put in the system
prompt, which sits ahead of the whole conversation. But a note doesn't change
how much the model thinks. Effort does, and the engine lets a mod set it, so
this mod sets effort and adds no prompt text.

## Composes with

- **mode-registry**: required, and listed under `dependencies` in
  `plugin.json`. effort-modes offers its modes by hooking `state.set` on the
  registry's catalog, and reads `mode-registry.active`. Because of that
  dependency, the engine writes mode-registry's contract into
  `.claude-plugin/types/mode-registry/` when it loads this plugin from your
  folder, so `tsc -p tsconfig.json` type-checks `e.value` and `active` with no
  copied types. Before the first load (or without the dependency) tsc reports
  them as `unknown`/`never`.
- **Other mode offerers.** effort-modes only acts on its own three ids, so a
  `router` or `artifact` mode from another plugin passes straight through.
  Only one mode is active at a time.
- **Other `turn.step` hooks.** effort-modes passes the stream on with
  `yield* next(...)` and never reads or rewrites a chunk. A model router
  hooking the same event composes with it: whichever is registered first
  (outermost) sees the original request, and the one beneath sees the rewrite.
  If both rewrite `effort`, the inner one wins.

## Install / load

```sh
claude plugin validate templates/effort-modes
claude plugin test templates/effort-modes            # 5 tests
claude --plugin-dir templates/mode-registry --plugin-dir templates/effort-modes
```

Function hooks are early access. If your build doesn't load hooks modules by
default, set `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. That setting loads every
installed plugin's hooks module.
