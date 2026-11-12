# Be ambitious

A small skill from [Attention Heads](https://attentionheads.substack.com/?utm_source=github&utm_medium=readme&utm_campaign=skills). Give it a task and it asks for a deeper version of that task, not a bigger one.

Adapted from a prompt shared by Felix Rieseberg (Anthropic).

## What it does

Before rewriting your prompt, it answers four questions for the task's field:

1. What would a top professional do here that you aren't asking for?
2. What is the rawest material they would start from, instead of something already digested?
3. Which specific methods and tools would they use?
4. What, other than you or the model, would show the result is right?

Then it rewrites your prompt to ask for exactly that, and stops so you can review it before running.

## Verification gate

Question 4 is the line between a plan and a result, so it does not get certified
unchecked. After the rewrite, the fourth answer passes through one of three exits:

- **Verifiable now** — run the check (test, reproduction, dataset, calculation,
  known answer) and attach the result. Only then is the rewrite "deeper" in fact.
- **Not verifiable now** — label it a *hypothesis awaiting verification*.
- **Empty** — call the result a *plan awaiting verification*, not "deeper".

A stated "cannot verify now" is a pass; an invented verification is a failure.

## Examples

```text
/be-ambitious Summarize the latest research on intermittent fasting.
```

```text
/be-ambitious Find out why our checkout page got slower last week.
```

## Install

Point your agent at the folder:

```text
Install the AI agent skill at https://github.com/DannyMac180/skills/tree/main/be-ambitious
```

Or copy `be-ambitious/` into your agent's skills directory (for Claude Code, `~/.claude/skills/`).
