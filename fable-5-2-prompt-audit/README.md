# Fable 5.2 prompt audit

A skill from [Attention Heads](https://attentionheads.substack.com/?utm_source=github&utm_medium=readme&utm_campaign=skills). Point it at a project and it finds the instructions written for earlier Claude models that Anthropic says to reconsider on Claude Fable 5.2.

The standard is one section of Anthropic's guide, [Review instructions written for earlier models](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2#review-instructions-written-for-earlier-models), and nothing else. It is not a general prompt-quality review.

## What it checks

| | Instruction | What the guide says to do |
| --- | --- | --- |
| R1 | Standing instructions to delegate to subagents | Test, then remove what you no longer need |
| R2 | A token budget written into the prompt | Test without it |
| R3 | Harness code that edits earlier turns | Keep the history append-only |
| R4 | "Treat that answer as done" lines | Leave out, or test first |
| R5 | Instructions to think less | Remove, and lower effort instead |
| R6 | Hard style limits on prose | Remove what you no longer need |
| R7 | Cautions piled up in notes, memory, and rules | Delete stale ones; give absolute rules a scope and reason |

## What it does

1. Checks that its checklist still matches the live guide.
2. Lists every place the project holds instructions: instruction files, `.claude/`, skills, memory and notes, prompt files, prompts in source code, tool descriptions, and harness code.
3. Reads each one against the seven checks.
4. Reports findings with file and line, the quoted instruction, the check, and a proposed change. It also lists the surfaces that were clean.

It edits nothing until you say which findings to apply.

## Example

```text
Audit this project's prompts for Fable 5.2.
```

## How the checklist stays honest

`references/checklist.md` restates the guide in its own words and stores a fingerprint of each guide sentence it relies on. `scripts/source_check.py` fetches the guide and confirms every fingerprint still matches a sentence there, so a change to the guide shows up as a failed check, not as a silently stale audit.

```bash
python3 scripts/source_check.py verify references/checklist.md https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2.md https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5.md
```

## Testing it

`evals/fixture/` is a small made-up project with a planted instruction for each check and look-alike clean instructions as decoys. `evals/expected.md` is the answer key. Copy the fixture somewhere the key is not visible, run the skill on the copy, and compare.

## Install

Point your agent at the folder:

```text
Install the AI agent skill at https://github.com/DannyMac180/skills/tree/main/fable-5-2-prompt-audit
```

Or copy `fable-5-2-prompt-audit/` into your agent's skills directory (for Claude Code, `~/.claude/skills/`).
