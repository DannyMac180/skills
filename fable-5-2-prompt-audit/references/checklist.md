# Checklist: instructions written for earlier models

Source: Anthropic, "Prompting Claude Fable 5.2", section
[Review instructions written for earlier models](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2#review-instructions-written-for-earlier-models).
Fetched 2026-11-10.

Every check below restates that section in this skill's own words. The
12-character codes are fingerprints of the guide's own sentences, so each
check can be traced to the sentence it comes from without copying the guide
here. To read the source sentences, or to find out whether the guide has
changed since the fetch date, run:

```bash
python3 scripts/source_check.py show references/checklist.md \
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2.md \
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5.md
```

The section lists seven kinds of instruction to reconsider, and this
checklist has seven checks. Nothing else is a finding. The guide's premise
(`7cf5c971196c`) is that some carried-over instructions now raise cost, cause
side effects, or do nothing. Its migration steps name the surfaces to read
(`237a13bdbc5e`): system prompts, skills, agent files, memory files, notes,
and harness text.

Each check names the action the guide gives. Use that action in the finding.
Several checks say "test", not "remove".

## R1. Standing instructions to delegate

- **Flag:** a line in a system prompt, skill, or agent file that pushes work
  to subagents as a standing rule (always delegate, spawn a subagent for
  each X, prefer subagents for Y).
- **Do not flag:** a line that limits delegation or says when it is not worth
  it; a plain description of a subagent-starting tool with nothing that
  urges its use; a one-off delegation that is the point of the file (an
  orchestrator skill whose job is to route work is a judgment call: report
  it as "test", not "remove").
- **Action:** test whether the model starts more subagents than the tasks
  need. If it does, remove the lines that are no longer needed. Review these
  lines before changing any tool description.
- **Source:** `751fa8c81589` `0a25bdbcda98`; from the linked section on
  subagents, `d763adb63845` `23e8e3710d32`.

## R2. A token budget that the harness writes into the prompt

- **Flag:** prompt text, usually built in harness code, that tells the model
  how many tokens the task may use or how many remain.
- **Do not flag:** API parameters such as `max_tokens`, or the API's task
  budgets feature. The guide says its finding is about prompt text only.
- **Action:** test the tasks without the budget text. In Anthropic's testing
  a large budget raised cost with no gain in performance.
- **Source:** `69ec9e7052b8` `0d3eede85c8b` `7e64aae54d0e` `636aeaef214d`.

## R3. Harness code that edits earlier turns

- **Flag:** code that changes the system prompt, the tool list, or an earlier
  message between requests in one conversation. Typical forms: trimming or
  rewriting old tool results in place, putting a timestamp or other changing
  value in the system prompt on every request, adding or removing tools
  mid-conversation, rewording an earlier reminder.
- **Do not flag:** appending new messages; the API's context editing;
  compaction that keeps no earlier turns after the summary; a system prompt
  built once per conversation.
- **Action:** keep the history append-only apart from compaction and context
  editing. If the harness must edit, the guide names an API setting that
  drops the affected thinking blocks, and says to measure output tokens
  before relying on it.
- **Source:** `587c649164c1` `db68c1258bb5`.

## R4. The "treat that answer as done" lines

- **Flag:** chat system prompt text that tells the model to treat an earlier
  answer as finished and to keep its thinking on the newest message. The
  wording comes from the Claude Opus 5.5 prompting guide (`6ebc187dd4be`);
  match by meaning, because people adapt it.
- **Do not flag:** lines about when a task, ticket, or conversation is done.
  The check is about not going back over the model's own earlier answers.
- **Action:** leave the lines out where the model should keep re-examining
  its earlier answers. Elsewhere, test whether the model still points out
  its own mistakes before keeping them.
- **Source:** `f00053cb70d4` `586716734d76` `22e04a3f4ef3`; Opus 5.5 guide
  `6ebc187dd4be` `aa955a17da6d`.

## R5. Instructions to think less

- **Flag:** a line that tells the model not to deliberate, to skip thinking,
  or to answer straight away without reasoning.
- **Do not flag:** instructions about the length or tone of the reply. The
  guide says the prompt is the right place for those.
- **Action:** remove the line and lower the effort level instead. The line
  does not stop thinking at `medium` effort and above.
- **Source:** `24449700f273` `013fffd6b8e1` `76c332eccf44`; from the section
  on effort, `2f0cdf4a360a` `a25b573c8095`.

## R6. Style rules for writing

- **Flag:** a hard, mechanical limit on prose, such as a cap on words per
  sentence or one instruction per sentence. The model follows such limits
  closely, and the prose turns choppy.
- **Do not flag:** style preferences that set no hard limit on sentence
  shape (spelling convention, tone, audience, a required output format).
- **Action:** remove the rules that are no longer needed. Do this before
  adding the guide's own text on clear reports.
- **Source:** `dbb711385200` `fe8db667f575`.

## R7. Rules, notes, and memories that have built up

- **Flag:** in memory files, notes, and instruction files: a caution whose
  reason no longer holds (a dated workaround, a note about an outage long
  past), and an absolute rule ("never", "always", "do not ever") that states
  neither its scope nor its reason. Some of these the model wrote itself.
- **Do not flag:** a rule that states what it covers and why; a rule that
  names the go-ahead that lifts it; confirmation steps for risky or
  irreversible actions, which the guide says to keep (`c62d850b0346`).
- **Action:** delete cautions whose reason is gone. Rewrite absolute rules so
  that they state scope and reason, and put any exception inside the rule
  itself. Approval rules should name the exact actions they cover. If the
  reason for a caution cannot be determined from the project, say so and ask
  the user; do not propose deleting it. For a system that is already stuck,
  the guide suggests a restart with trimmed memory, keeping a copy of the
  originals.
- **Source:** `922c3693c18d` `552955414449` `4cce0efaf670`; from the linked
  sections on caution and approvals, `8318cbb80382` `e46dcb7e9af9`
  `8173714a6820` `f9c0b6c712a5` `99b4c2ef1f16` `79c8ecbb73dd`.

## Applying an accepted finding

The guide says to make prompt, tool, and note changes in new conversations
only (`fee4e60bc586`). A stored conversation resumed with changed text can be
rejected by the API, for the reason in R3. Say this in the report whenever a
finding touches a system prompt or tool description that a running harness
sends.

## Outside this checklist

The same guide has advice on effort levels, early stopping, code ownership,
progress updates, final reports, and refusals. Those sections are about what
to add or tune, not about instructions carried over from earlier models, so
they are not checks here.
