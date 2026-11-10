# Answer key for the seeded fixture

`fixture/` is a small made-up project. It has at least one planted instruction
for each check in `references/checklist.md`, and clean instructions that look
similar. Copy `fixture/` somewhere this file is not visible before running the
skill on it, so the run cannot read the answers.

**Pass:** every planted line is reported under the right check, and no decoy is
reported as a finding. A decoy mentioned as "considered, not a finding" still
passes.

## Planted

| Check | File | Line that must be flagged |
| --- | --- | --- |
| R1 | `.claude/agents/orchestrator.md` | "Hand every search, file read, and test run to a subagent..." |
| R2 | `src/harness/prompt.py` | the token budget and tokens-left text in `task_prompt` |
| R3 | `src/harness/loop.py` | `trim_old_tool_results` rewrites earlier tool results in place |
| R4 | `prompts/support_chat.md` | "When you have replied to a question, that reply is settled..." |
| R5 | `prompts/support_chat.md` | "Reply immediately. Do not reason through the problem..." |
| R6 | `prompts/report_writer.md` | the 15-word, one-idea, three-sentence limits |
| R7 | `memory/notes.md` | "NEVER retry a failed API call." (absolute, no scope or reason) |
| R7 | `memory/notes.md` | the 2025-02-11 inventory outage note (reason has expired) |

## Decoys (must not be findings)

| File | Line | Why it is clean |
| --- | --- | --- |
| `CLAUDE.md` | never commit `.env` | states its reason |
| `CLAUDE.md` | ask before production migrations | states scope, reason, and what needs no approval |
| `CLAUDE.md` | mention of `claude-opus-5-5` | a model ID is context, not a finding |
| `.claude/agents/reviewer.md` | do not start subagents for a single-file review | limits delegation |
| `src/harness/loop.py` | `max_tokens=8192` | API parameter, not prompt text |
| `src/harness/loop.py` | `messages.append(...)`, `system = BASE` | append-only, built once |
| `src/harness/tools.py` | `lookup_parcel` description | plain tool description |
| `prompts/support_chat.md` | two or three sentences | reply length, not thinking |
| `prompts/support_chat.md` | mark a ticket as done after confirmation | about tickets, not earlier answers |
| `prompts/report_writer.md` | British spelling, lead with late parcels | no hard limit on sentence shape |
| `memory/notes.md` | do not delete `orders` rows without go-ahead | scope, reason, and the go-ahead that lifts it |
| `memory/notes.md` | depot codes | a fact, not a caution |
