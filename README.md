# Skills

Public AI agent skills by [DannyMac180](https://github.com/DannyMac180).

## Available Skills

- [`codex-dynamic-workflows`](./codex-dynamic-workflows/) - Plan and run supervised AI-agent dynamic workflows with goal mode, subagents or simulated work packets, approval gates, integration, verification, and reusable workflow artifacts.
- [`explain-this`](./explain-this/) - Explain any digital artifact (papers, articles, code) shaped by a persistent learner profile, with comprehension quizzes and spaced-repetition review. On first use it interviews you (~10 min) and creates `~/.explain-this/`.

## Install

If your AI agent supports skills, you can point it at the GitHub URL for a skill and ask it to install that skill:

```text
Install the AI agent skill at https://github.com/DannyMac180/skills/tree/main/codex-dynamic-workflows
```

You can also clone this repo and copy a skill folder into your agent's skills directory. Adjust the destination path for your agent; this example uses Codex's user-scope skills folder (`~/.agents/skills`):

```bash
git clone https://github.com/DannyMac180/skills.git
cd skills
mkdir -p "$HOME/.agents/skills"
cp -R codex-dynamic-workflows "$HOME/.agents/skills/"
```

Then start a new agent session and invoke it with:

```text
Use $codex-dynamic-workflows to plan and run a supervised multi-agent workflow for this task: ...
```

## License

MIT
