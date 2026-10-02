# Cost review

Run this on every mod before it loads: your own before you ship it, and
someone else's before you install it. A mod sits inside every turn, so a
small mistake costs tokens on every turn for the rest of the session, and a
careless one can touch anything the user can.

This is judgment, not API. For what an event or a `$` call *is*, read the
engine's declarations (`.claude-plugin/types/claude-code/index.d.ts` beside a
mod, or what `/plugin-types` writes). Every fact below was checked against the
2.1.286 declarations and `reference.md` unless it says **unverified**.

## The pass, in order

1. `claude plugin validate <dir>`: what the engine sees the module hook and
   call, the state it reads and writes, the telemetry streams it stands on.
2. `bun scripts/audit-mod.ts <dir>` (or `node --experimental-strip-types
   --no-warnings scripts/audit-mod.ts <dir>`; add `--json` for data): the
   same source read for cost, cache and reach. A heuristic aid that points
   you at lines, not a verdict. It misses calls through a destructured `$`
   and cannot see values computed at run time.
3. Read every hook the audit flags, then the rest. Someone else's mod: read
   the whole module and everything it imports, including `Client` modules.
4. Measure (below) in a throwaway session with `claude --plugin-dir <dir>`.
5. Show the user the report at the bottom.

## 1. What breaks the prompt cache

The cache is a prefix: tools, then system prompt, then messages. Anything
that changes an early part re-bills everything after it. A mod that changes
the prefix once costs one re-write; one that changes it every turn means the
session never reads from cache again.

| Changes the prefix | Why it matters | What to do instead |
| --- | --- | --- |
| A `prompt.section` answer that differs between calls | Declared: "an unstable answer spends the prompt cache every call". Cached until `$.ui.invalidate('prompt.section')` | Return the same text for the session. No clock, counters, usage or state in it |
| A `tool.describe` answer that differs | Declared: "an unstable answer spends the model's prompt cache". Cached for the session until invalidated | Fixed descriptions. Volatile facts go in a tool *result* |
| `prompt.compose` | Fires when the engine renders a system prompt and is not in the invalidatable set, so nothing caches it for you | Deterministic output only. A section that varies per person or session is `scope: 'session'`; `shared` text that varies "hits that cache for nobody" |
| `prompt.context` | The first user message's blocks. A change re-bills the whole conversation after the system prompt | Set once. Invalidate only when the user asks |
| `$.ui.invalidate` on any `prompt.*` or `tool.describe` | Drops the cached answer: next turn re-renders, and if the text differs, the cache misses from there | Never from a timer or on every turn. A user action, at most |
| The tool list changing mid-session | `$.tool.register` after the first turn adds a tool definition, which sits ahead of the system prompt (Messages API ordering, not stated in the d.ts) | Register in `session.start`, awaited: then it is listed by turn one. Or answer `isDeferred: true` from `tool.describe` to put it behind ToolSearch |
| Switching the model | Declared on fork: the prefix is "billed afresh ... after `/model`". The classic `PostModelSwitch` input carries `prompt_cache_warm` ("a switch then forfeits it") and `estimated_cache_write_usd` | See the router note below |
| `turn.step` rewriting `model` per request | Each request on another model reads that model's cache, which is cold for this prefix | Route per turn at `index === 0`, then stick; or route subagents instead (their prefix is their own anyway) |
| `turn.step` rewriting `effort` | **Unverified** whether a different effort alone misses the cache | Measure before shipping a mod that does this |
| `$.session.append` notes | Append-only, so the cache holds; but each row is re-sent on every later turn | Short notes, only when they change something |
| `tool.call` input rewrites | Cache-safe: the model sees what it asked to write, not your rewrite. That is the confusion risk | Return `context` so the model knows what really ran |

**A model router that does not break the cache** decides once per user turn
(at `turn.step` with `e.index === 0`, or at `prompt.submit`), keeps the same
model while the conversation stays on that task, and switches only when the
expected saving beats one full re-write of the context (`$.session.usage()`
`context.tokens` is the size of that re-write). Routing subagents through
`agent.spawn` is cheaper still: they start a new prefix whatever you pick.

## 2. Fork or complete

| | `$.model.fork({ prompt })` | `$.model.complete({ model, prompt })` |
| --- | --- | --- |
| Sees | The whole transcript as the main thread last sent it: same model, system prompt, tools | Only what you put in `prompt` and `system` |
| Pays | Cache reads for the context, plus the uncached tail and output, on the session's model | Full input price for your prompt, on the model you name |
| Goes cold | When the cache entry lapsed (`cache_ttl` is 5m or 1h) or after `/model`: then it pays the whole prefix | Never warm; never cold |
| Returns nothing when | `nothing-to-fork`: before the first response and after `/clear` (that arm has no `usage`) | Always answers or gives a `reason` |
| Leaves in context | Nothing: output does not enter the main conversation | Nothing |

Use **fork** for questions *about this conversation*: did the task get
done, what was assumed, what should happen next, quiz me. Fork straight after
a turn, while the cache is warm.

Use **complete** for questions about a small piece of text you hold:
classify a tool input, label a commit message, summarise one file. Name a
small model (`haiku`) and set `maxTokens`. If you find yourself pasting the
transcript into `complete`, you wanted `fork`.

A fork over a long context on an expensive model is not free just because it
is cached. Gate it as hard as any other call.

## 3. Model calls per turn, and their gates

Per-turn events fire more than you think. Every one of these is a place a
model call multiplies:

| Event | Fires | A model call here |
| --- | --- | --- |
| `turn.complete` | Every turn, *including subagents' turns* (`e.agentId` set) | Fine when gated |
| `turn.start` | Every turn | Rarely needed; blocks nothing but costs every turn |
| `turn.step` | Every model request in a turn | Almost never: a 20-tool turn is 20 calls |
| `tool.call` | Every tool call | Only narrowed by `{ tool }` and gated by input |
| `session.append` | Every row stored | No |
| `ui.render` | Every draw (redraws are capped at ten a second, thirty for the shown pane and the band) | Never. Compute elsewhere, store in `$.state`, draw from it |
| `prompt.submit` | Every prompt | Only if it replaces work the main turn would do |

The gates to look for in a `turn.complete` hook that calls a model:

- `e.agentId === undefined`: the main loop only. Without it, a mod that
  spawns or forks can see its own children's turns.
- `e.reason === 'answer'` and not `e.isAborted`: no call on an interrupt,
  refusal or API error.
- **Something worth checking happened.** No tool calls this turn, a one-line
  answer, or a question back to the user: skip.
- A slash command that turns it off, stored in `$.store` so it stays off.
- A rate limit: once per N turns, or not again until the context grew.
- Fire and forget: `await next(e)` first, then start the call, `.catch` it,
  and write the answer to `$.state` for a render hook to draw. A hook's own
  10 s budget does not count `$` calls in flight, but the user waits on a
  hook that awaits a model before returning.

## 4. Timers

`$.clock.every` runs until `cancel()` and `$.clock.after` fires once, idle
or not. (Whether a module reload cancels them is not stated in the
declarations; cancel your own on `session.end` rather than rely on it.)

- A timer that calls `$.prompt.submit` starts a full turn on its own: the
  whole context re-sent. If the session sat idle past the cache TTL, it is
  re-written at full price.
- A timer that forks after the TTL lapsed pays the whole prefix.
- A timer that calls `$.ui.invalidate('ui.render')` costs no tokens, but
  anything under 1 s is drawing work for nothing in most mods.
- Timers belong in `session.start`, not in a per-turn hook, or each turn
  stacks another one.

## 5. Growth

- `$.store` holds 4 MiB of JSON text in all. Past that `set` rejects. A
  hook that lets the rejection through fails: before `next` it is skipped,
  after `next` its work is lost (the declared trace outcomes `skipped` and
  `kept`), and a fire-and-forget write has no hook to land in at all. Cap
  every list you append to (`.slice(-N)`), and catch every write.
- `$.state` values are re-read by every subscribed render; a list that grows
  every turn makes every draw slower. Same cap.
- `$.session.append` rows stay in context until compaction. Count them as
  input tokens on every later turn.

## 6. Vetting someone else's mod

Everything a mod does goes through `$`, so the source tells you its reach.
`claude plugin validate` and the audit list the calls; read what each does.

| Capability | What it can do | Ask |
| --- | --- | --- |
| `$.process.run` / `.spawn` | Any host command, as the user, no shell | Which argv? Is any part from the model or a file? |
| `$.fs.write` | Write anything the user can | Under which root? Is the path checked with `stat(p, { resolve: true }).realPath`? |
| `$.http.fetch` | Any http(s) host the machine reaches, unless admin policy refuses | Which host? What goes in the body? |
| `$.session.authorize` | An auth handle that rides https to a first-party host | Why does it need your credentials? |
| `$.mcp.call` / `.connect` | Calls any tool on your connected MCP servers with their credentials (mail, docs, calendars), with **no permission prompt** | Which server and tool? Does anything it sends come from the model or a file? |
| `$.env.set`, `$.config.set` | Changes the session's environment and settings | What, and is it put back? |
| `tool.call` returning `deny` or `next({ ...e, input })` | Blocks or silently rewrites what the model runs | Is the rewrite told to the model via `context`? |
| `tool.check` returning `{ decision: 'allow' }` | **Skips the permission prompt** | Narrowed to which tool and input? |
| `prompt.section`, `prompt.compose`, `prompt.context`, `session.append` rewrites | Changes what the model reads: an injection path | Read every string it adds |
| `session.send`, `session.receive` | Rewrites, readdresses or swallows messages between agents | Why? |
| `telemetry.log` hooks | Sees records bound for your collector or Anthropic | Does it forward them anywhere? |
| `plugin.register` returning `refuse` | Keeps other mods from loading | Which, and why? |
| `engine.create` | Adds or withholds `$` nouns for other plugins | Which nouns? |
| `$.prompt.submit`, `$.agent.spawn` | Starts turns and agents on its own | When, and what does it say? |
| A hook that never calls `next` | Swallows every mod beneath it and the engine's own behaviour | Is that the point of the hook? |

Then load it alone first: `claude --plugin-dir <dir>` in a scratch project,
with `claude --debug`.

## Measure, don't guess

Three readings tell you what a mod really costs. Record them with the mod
off, then on, over the same few turns.

**Per turn.** `turn.complete`'s `e.usage` is the turn's requests summed:
`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`,
`output_tokens`, `model`. A cache break shows as `cache_creation` spiking and
`cache_read` dropping on the turn after the mod acted.

```ts
on('turn.complete', async ($, e, next) => {
  const result = await next(e)
  if (e.agentId === undefined && e.usage) {
    const u = e.usage
    const sent = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
    const hit = sent > 0 ? Math.round((u.cache_read_input_tokens / sent) * 100) : 0
    $.ui.log(`cache ${hit}% read · ${u.cache_creation_input_tokens} written · ${u.output_tokens} out · ${u.model}`, { to: 'debug' })
  }
  return result
})
```

**Per fork.** Compare the fork's `usage.cache_read_input_tokens` with
`(await $.session.usage()).context.tokens`. Near 1: warm, the fork was cheap.
Near 0: it paid for the whole prefix. Check `'usage' in reply` first; the
`nothing-to-fork` arm has none. `context.tokens` is optional, so guard it.

```ts
const reply = await $.model.fork({ prompt: 'Has the task been completed? Answer yes or no.' })
if ('usage' in reply && reply.usage) {
  const { context } = await $.session.usage()
  const warmth = context.tokens ? reply.usage.cache_read_input_tokens / context.tokens : 0
  $.ui.log(`fork warmth ${Math.round(warmth * 100)}% · ${reply.usage.output_tokens} out`, { to: 'debug' })
}
```

**Per session.** `$.session.usage()` gives `context.tokens`, `context.window`
and `cost.usd` (as `/cost` totals it), free to call. `breakdown: 'summary'`
estimates the categories locally; `'full'` sends a token-count request per
tool and memory file, so keep it out of hot paths. A classic `PostModelSwitch`
hook reads `prompt_cache_warm` and `estimated_cache_write_usd` on every switch.

## The report

Show the user this, filled in. Keep it to what you found and measured; mark
estimates as estimates.

```
Mod: <name> <version> by <author>
Risk: low | medium | high: <the one reason that decided it>

Tokens per turn: <0 | ~N on turns where X | one fork (~context read from cache + ≤maxTokens out)>
  measured: <cache read % and extra tokens per turn, mod on vs off> | not measured
Cache impact: none | one-off at <event> | every turn: <hook that changes the prefix>
Off switch: </command> | none

It can touch:
  - <capability>: <what, where, narrowed how>
It changes:
  - <what the model reads or runs, if anything>
Composes with: <other mods it draws beside, or state it reads/hooks>
Open questions: <what you could not tell from the source>
```

**Risk levels.** *Low*: draws, logs or stores its own state; no model calls
or only gated ones; nothing on the cache list. *Medium*: gated model calls
every turn, a cache-list hook with a stable answer, `$.http.fetch` to a named
host, `tool.call` denies. *High*: an ungated per-turn or per-step model call,
a cache-list hook whose answer varies, a model switch per request,
`$.process`, `$.fs.write`, `$.mcp.call`, `tool.check` allows, rewrites of
what the model reads, or network calls to hosts it computes.
