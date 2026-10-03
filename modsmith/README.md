# ModSmith

Ready-made mods for Claude Code, plus the know-how to build, price and vet
your own.

**[See what ModSmith does →](https://claude.ai/artifact/2eAneV8fBiZgk995w8qyee)**

A **Claude Mod** is a Claude Code plugin that changes Claude Code itself: what
shows above the prompt, which tools Claude has, what runs after each turn.
Claude Code can already write a mod if you ask. ModSmith adds what it doesn't
know yet: which mods are worth having, what a mod really costs, and how to
make mods that work together.

## What you get

**1. Useful mods without designing them yourself.** Six complete mods to load
as they are or change. Ask "quiz me after each turn" and you have a working
mod in minutes, not an afternoon of trial and error.

**2. No surprise costs.** A badly built mod can quietly spend tokens on every
turn, or keep breaking the prompt cache so you pay full price again and again.
ModSmith prices every mod before you use it: tokens per turn, whether it
touches the cache, and how to turn it off. Its own mods only spend tokens
after turns that actually did something.

**3. A safety check before installing other people's mods.** As people share
mods, you'll be running code you didn't write. Point ModSmith at a mod and get
a plain report: how risky it is, what it costs, and whether it can run
commands, write files or approve tools for you.

**Also:** mods built with ModSmith draw beside each other instead of over one
another, and each one ships a `DECISIONS.md` that records the choices made and
what hasn't been checked yet.

## The mods

| Mod | What it does | Cost per turn |
| --- | --- | --- |
| `quiz-after` | When Claude finishes a task that changed something, shows 2-3 questions about what was built above the prompt, with reveal buttons and "Save to deck" for [explain-this](../explain-this/) flashcards. `/quiz` turns it off. | 0 on chat, read-only or subagent turns; otherwise one fork that reads the conversation from the prompt cache (~350 new tokens in, ~200-700 out, estimated) |
| `next-steps-supervisor` | After a turn that did real work, a side check asks: what was the goal, was it met, where were corners cut, did anything need your approval? Shows the verdict, with next steps as buttons. `/supervisor` turns it off. | 0 on chat or read-only turns; otherwise one cached fork (~250 tokens of question, ~100-300 out, estimated) |
| `assumption-ledger` | Gives Claude a `register_assumption` tool. Shows the turn's assumptions, decisions and "considered but not done" items, with a **Do it** button for the last. | No model calls; ~200 cached input tokens for the tool; ~40-80 out per entry (estimated) |
| `mode-registry` | One `/mode` switch any mod can add a mode to; the active mode shows in the prompt footer. | No model calls; a short transcript line per `/mode` |
| `effort-modes` | Three modes on that switch: `ui` (low effort), `api` (medium), `review` (max). Needs mode-registry. | No model calls; each switch rebuilds the cache once (measured: ~10k tokens re-written in a 37k-token session) |
| `artifact-dashboard` | A one-line summary of a shared Kanban artifact above the prompt, so several Claude sessions work from the same board. | 0 model tokens (it reads the board with a tool call); ~130 tokens once per conversation |
| `minimal` | A do-nothing mod with one slash command, to start from. | 0 |

The ideas behind these come from Thariq Shihipar (Anthropic) on the
[Latent Space](https://www.latent.space/) podcast: forked side checks that
reuse the prompt cache, an assumptions tool, a quiz after the work, a mode
switch other mods can join, and artifacts as shared project state.

## Use it

In Claude Code, add the marketplace once:

```text
/plugin marketplace add DannyMac180/skills
```

Then install everything at once:

```text
/plugin install modsmith-all@modsmith
```

That brings the skill and all six mods. Two of them (`quiz-after` and
`next-steps-supervisor`) each spend one cached side check after turns that
changed something, so expect a little extra token use. To drop one mod later,
uninstall `modsmith-all@modsmith` first (the mods stay installed), then
disable or uninstall that mod from `/plugin`. While the bundle is installed,
Claude Code won't let you turn off a single mod it depends on.

Or install the skill, and only the mods you want. They stay installed across
sessions, and you can browse, enable or remove them from the `/plugin` screen.

```text
/plugin install modsmith@modsmith
/plugin install quiz-after@modsmith
/plugin install next-steps-supervisor@modsmith
/plugin install assumption-ledger@modsmith
/plugin install effort-modes@modsmith
/plugin install artifact-dashboard@modsmith
```

`effort-modes` brings `mode-registry` with it. Start a new Claude Code session
after installing so the mods load.

With the skill installed, just ask:

```text
Make me a mod that quizzes me after each task.
Vet this mod before I install it: <path or repo>
What does this mod cost per turn?
```

Prefer a plain skill folder? Copy `modsmith/` into `~/.claude/skills/`, and
try any mod for one session with
`claude --plugin-dir ~/.claude/skills/modsmith/templates/quiz-after`.

## What's inside

| Path | What |
| --- | --- |
| `SKILL.md` | The workflow: surface the unknowns, pick a pattern, build, cost review, composition check, validate and ship |
| `templates/` | The seven mods above, each with a README, `DECISIONS.md` and tests |
| `references/cost-review.md` | What breaks the prompt cache, fork vs complete, vetting someone else's mod, measuring, the report format |
| `references/composition.md` | How mods share space, state and the cache |
| `references/artifact-dashboard.md` | Artifact databases as shared project state |
| `references/gotchas.md` | Traps, by symptom |
| `references/testing.md` | The plugin test kit and its traps |
| `scripts/audit-mod.ts` | `bun scripts/audit-mod.ts <mod>`: a static cost, cache and reach audit |

## Status

Built and checked against Claude Code 2.1.286/2.1.287. Mods are an
early-access feature and change between releases, so ModSmith always defers to
the types your own build generates. Every template passes
`claude plugin validate` and its own tests. `quiz-after` and
`next-steps-supervisor` have run live in the desktop app, drawing side by
side with another mod; the others haven't yet. Each `DECISIONS.md` lists
exactly what's confirmed and what's left to check.

## License

MIT
