# effort-modes: decisions

## Effort is set on `turn.step`, not by prompt guidance

The declarations (`TurnStepInput.effort`, 2.1.286) say a `turn.step` hook
"rewrites `model` or `effort` going down". That is a real API effort
parameter, not a hint. **Verified live:** with a probe plugin loaded beneath
effort-modes, `/mode review` changed the main thread's request from `medium`
to `max` on `claude-opus-5-5` (Claude Code 2.1.287, headless, stream-json).
The tests check the same thing in the kit for every mode.

**Rejected: changing the session's effort with `$.config.set`.** It would also
break the cache once per switch. But it writes into the person's settings, so
the change outlives the mode and the session, and `/mode off` would have to
remember and restore the old value.

**Rejected: prompt guidance** ("be thorough, think about security"). Appended
as a user row it's cache-safe, but it doesn't change how much the model
thinks. The task said to fall back to guidance only if effort can't be set,
and it can.

## Main thread only

Steps with `agentId` pass through untouched. A subagent was spawned at an
effort chosen by whoever spawned it (often `low` on purpose), and its loop has
its own cache. Rewriting it would multiply the rebuild cost by the number of
subagents. Alternative considered: apply `review`'s `max` to subagents too, on
the theory that a security review delegated to a subagent should also think
hard. Rejected for the cache cost and because it would overrule a deliberate
choice. A `review-agents` variant could add it.

## Latched per turn

The mode is read at `turn.start` and held in a small `Map` by `turnId`, so
every step of one turn sends the same effort. Each change of effort costs a
messages-cache rebuild, and a picker press mid-turn would otherwise cause one
mid-turn. A `Map` in module memory is fine here: a hot reload loses it, and
`turn.step` then falls back to reading `active` directly. The worst case is
one turn that switches between its steps. The map is capped at 8 entries in
case a turn never completes.

## Pass-through when the effort already matches

If the effort the engine was going to send equals the mode's effort, the hook
calls `next(e)` unchanged. The request is byte-identical either way, so the
rewrite would add nothing.

## The levels

`ui` → `low`, `api` → `medium`, `review` → `max`, as specified. Note that
`medium` is Opus 5.5's own default, so `api` mode on Opus 5.5 is "the default,
pinned". It becomes a real change on a model whose default is `high` (Sonnet
5.5, Opus 5) or after the person raised their own effort.

## Cache behaviour: what is measured and what is assumed

- **From the API docs (claude-api skill, `shared/prompt-caching.md`,
  "Invalidation hierarchy"):** a top-level `effort` change always invalidates
  the messages cache and, on some models, tools and system too. The
  cache-preserving form is a per-message effort system message (beta
  `mid-conversation-output-config-2026-07-01`). A mod has no way to send one:
  `$.session.append` takes text blocks only, and `turn.step` exposes only the
  top-level `effort`.
- **Measured (one run, about 37k-token session):** medium → max cost one
  rebuild (cache read fell from 33.3k to 23.4k, write rose to 13.5k), then
  the cache was warm again at max. max → medium did not miss. Likely, but
  unverified: the API docs say effort is rendered into the prompt, so a cache
  entry belongs to one effort, and turn 2's medium entry was still inside its
  5-minute lifetime. The README tells people to plan on a rebuild per switch
  anyway.
- **Not verified:** whether `$.model.fork` sends the main thread's rewritten
  effort. If it sends the session's own, every fork while a mode is active
  misses the conversation cache. That matters for any fork-based mod (quiz,
  supervisor) installed alongside.

## Not handled

- A model that ignores effort: we pass through when `e.effort` is absent,
  which is how the declarations say such models appear.
- A person who switches every prompt: the README warns about it. A cooldown
  or a confirmation for long contexts was considered and left out to keep the
  template small. The README's cost table is the guard.

## Declared as a dependency of mode-registry

`plugin.json` lists `"dependencies": ["mode-registry"]`. The engine's
declarations say a mod it loads from a folder gets one type root per listed
dependency, holding that plugin's contract. **Verified:** after one headless
load with both `--plugin-dir`s, `.claude-plugin/types/mode-registry/` existed
and `tsc -p tsconfig.json` passed in place. Without the dependency it failed
(the catalog's `e.value` typed `unknown`). `claude plugin validate --strict`
accepts the field.

The trade: with the dependency, effort-modes loaded alone by `--plugin-dir`
does not load at all (debug log: `dependency-unsatisfied`, "Dependency
"mode-registry" is not installed"; checked on 2.1.287). That is the right
behaviour for a plugin whose only job is to offer modes to the registry, and
it gives the person a clear reason instead of a silent no-op. The hooks still
read a missing `active` as "no mode" (the kit test "without mode-registry it
changes nothing"), which covers the registry being disabled mid-session.
Rejected: leaving the dependency out to keep the silent no-op, because then
the template doesn't type-check in place and nothing tells the person why
`/mode` is missing. Not checked: an installed (marketplace) copy.
