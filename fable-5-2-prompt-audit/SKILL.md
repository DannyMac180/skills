---
name: fable-5-2-prompt-audit
description: >
  Audit the prompts and instructions in a project for lines written for
  earlier Claude models that Anthropic says to reconsider on Claude Fable 5.2:
  standing delegation rules, token budgets written into the prompt, harness
  code that edits earlier turns, "treat that answer as done" lines,
  think-less instructions, hard style limits, and cautions that have piled up
  in notes and memory. Reports each finding with file and line, the guidance
  it conflicts with, and a proposed change; edits nothing without approval.
  USE WHEN: "audit my prompts for Fable 5.2", "review my instructions for
  Fable 5.2", "migrate my prompts / system prompt / skills / CLAUDE.md to
  Fable 5.2", "which of my instructions were written for an older model",
  fable-5-2-prompt-audit. NOT FOR: general CLAUDE.md or prompt quality
  improvement, writing new prompts, API parameter migration, or tuning effort
  levels.
---

# Fable 5.2 prompt audit

Anthropic's prompting guide for Claude Fable 5.2 lists seven kinds of
instruction, written for earlier models, that now raise cost, cause side
effects, or have no effect. This skill finds those instructions in a project
and reports them. The checks are in `references/checklist.md`. Read it before
you audit anything. It is the whole standard: an instruction that is weak,
vague, or badly written but matches no check is not a finding.

The target is the project the user names, or the current working directory.

## 1. Check the checklist is current

If you have network access, run this from the skill directory:

```bash
python3 scripts/source_check.py show references/checklist.md \
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2.md \
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5.md
```

It prints the guide sentence behind each check. If any line says `MISSING`,
the guide has changed since the checklist was written. Read the live section,
tell the user which checks are affected, and audit against the live text for
those checks. With no network, continue with the checklist and say in the
report that it was not re-verified, with its fetch date.

## 2. Inventory every instruction surface

List the surfaces before you judge any of them. Most missed findings come
from files nobody opened. Look for all of these, and skip dependency and
build folders (`node_modules`, `.venv`, `dist`, `.git`):

- **Instruction files:** `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
  `.cursorrules`, and similar, at any depth.
- **Agent configuration:** `.claude/` (skills, agents, commands, hook
  prompts, settings that carry prompt text), `SKILL.md` files and their
  reference files, plugin manifests.
- **Memory and notes:** memory directories, `MEMORY.md`, `NOTES.md`,
  scratchpads, handoff files, anything an agent writes and later reads.
- **Prompt files:** `prompts/`, `*.prompt`, and prompt templates in
  markdown, YAML, JSON, or text.
- **Prompts in source code:** system prompt strings and message builders.
  Search for `system=`, `systemPrompt`, `role: "system"`, `You are`,
  `messages`, and the SDK imports.
- **Tool definitions:** tool and MCP tool descriptions, above all any tool
  that starts subagents.
- **Harness code:** the loop that builds each request. This is where checks
  R2 and R3 are found. Search for code that assigns into an existing
  message, rebuilds the system prompt per request, trims old tool results,
  or interpolates a token count into prompt text.

Earlier-model names and model IDs in the project (Claude Fable 5.1, Claude
Opus 5.5, older) show which model a prompt was tuned for. Use them to decide
where to read closely. A model ID is not a finding.

Test fixtures and examples that contain deliberately bad prompts are not the
project's instructions. List them in the inventory as skipped.

## 3. Audit each surface

Read each surface in full. Do not judge from search hits alone, because the
"do not flag" side of each check usually depends on the lines around the
match. For each instruction that matches a check, record:

- the file and line, and the instruction quoted exactly;
- the check ID (R1 to R7) and the guide's reasoning in one sentence;
- the action, using the check's own verb: remove, test, or rewrite;
- for a rewrite, the proposed new text. For R7, write the rule with its
  scope, reason, and exception. If the project does not show what the reason
  is, ask the user in the report and do not invent one.

Keep these three apart:

- **Finding:** the instruction matches a check.
- **Needs a test:** the check says to test before removing (R1, R2, R4), or
  the match depends on behaviour you cannot see from the files.
- **Not a finding:** everything else. If you nearly flagged something and
  the "do not flag" list cleared it, say so in one line. That shows the user
  the surface was read.

## 4. Report

Edit nothing. Give the report in this order:

1. **Summary:** how many surfaces were read, how many findings per check,
   and whether the checklist was verified against the live guide.
2. **Findings:** ordered by likely cost or side effect, each with the fields
   from step 3 and a clickable `file:line`.
3. **Clean surfaces:** every surface with no findings, by path.
4. **Skipped or unreadable:** anything in the inventory you did not audit,
   with the reason.
5. **Applying changes:** if any finding touches a system prompt or tool
   description sent by a running harness, add the note from "Applying an
   accepted finding" in the checklist.

Then ask which findings to apply. Apply only those, and leave the rest of
each file as it was.
