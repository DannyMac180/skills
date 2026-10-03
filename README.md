# Skills

Public AI agent skills by [DannyMac180](https://github.com/DannyMac180).

## Go deeper

I write [**Attention Heads**](https://attentionheads.substack.com/?utm_source=github&utm_medium=readme&utm_campaign=skills) — deep, evidence-backed writing on AI, cognition, and agentic engineering. The **Agentic Engineering Field Notes** series is where I publish practical advice on the craft of using AI. [Subscribe](https://attentionheads.substack.com/subscribe?utm_source=github&utm_medium=readme&utm_campaign=skills) to get new posts to your inbox.

## Available Skills

- [`modsmith`](./modsmith/) - ModSmith: ready-made Claude Mods (quiz after the turn, assumption ledger, next-steps supervisor, mode registry, effort modes, shared Kanban dashboard) plus the judgment Claude Code's built-in mod authoring leaves out: per-turn token and prompt-cache review, vetting someone else's mod before installing, and rules for mods that compose.
- [`codex-dynamic-workflows`](./codex-dynamic-workflows/) - Plan and run supervised AI-agent dynamic workflows with goal mode, subagents or simulated work packets, approval gates, integration, verification, and reusable workflow artifacts.
- [`codex-relay`](./codex-relay/) - Relay: open one new native Codex task from your current task with a compact handoff, end your turn, and receive a single completion or blocker message back. Honors your chosen model and effort, or your default.
- [`explain-this`](./explain-this/) - Explain any digital artifact (papers, articles, code) shaped by a persistent learner profile, with comprehension quizzes and spaced-repetition review. On first use it interviews you (~10 min) and creates `~/.explain-this/`.

## Install

**Claude Code plugin marketplace (ModSmith).** Run `/plugin marketplace add DannyMac180/skills`, then `/plugin install modsmith-all@modsmith` for the skill plus all six ready-made mods, or `/plugin install modsmith@modsmith` for the skill alone and `/plugin install quiz-after@modsmith` (or any other ModSmith mod) one by one.

**Any agent.** If your AI agent supports skills, you can point it at the GitHub URL for a skill and ask it to install that skill:

```text
Install the AI agent skill at https://github.com/DannyMac180/skills/tree/main/codex-dynamic-workflows
```

You can also clone this repo and copy a skill folder into your agent's skills directory. Adjust the destination path for your agent; this example uses Codex's default skills folder:

```bash
git clone https://github.com/DannyMac180/skills.git
cd skills
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R codex-dynamic-workflows "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Then start a new agent session and invoke it with:

```text
Use $codex-dynamic-workflows to plan and run a supervised multi-agent workflow for this task: ...
```

## License

MIT
