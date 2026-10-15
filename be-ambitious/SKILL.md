---
name: be-ambitious
description: >
  Turn a task or prompt into a deeper version of itself, not a bigger one.
  Before rewriting, say what a top professional in the field would do that the
  user isn't asking for, the rawest source material they would start from, the
  specific methods and tools they would use, and what (other than the user or
  the model) would show the result is right. Then rewrite the prompt to ask for
  exactly that. USE WHEN: /be-ambitious, "be ambitious", "make this prompt
  deeper", "what would an expert do here", "raise the bar on this task",
  "rewrite my prompt like a pro would ask it". NOT FOR: expanding scope,
  adding features, or general prompt polishing for tone or length.
---

# Be ambitious

Adapted from a prompt shared by Felix Rieseberg (Anthropic):

> I want a deeper version of this task, not a bigger one. Before rewriting it:
> (1) say what a top professional in this field would do here that I'm not
> asking for; (2) name the rawest material they would start from instead of
> what has already been digested for me; (3) name the specific methods and
> tools they would use; (4) say what, other than you or me, would show the
> result is right. Then rewrite my prompt to ask for exactly that.

## Input

The task is whatever follows `/be-ambitious`. If nothing follows, use the
user's most recent request in this conversation. If there is none, ask for the
task in one line and stop.

## Deeper, not bigger

Keep the user's goal and scope. Depth means a higher standard for the same
outcome: better sources, sharper methods, real verification. Do not add
deliverables, features, or side quests. If a suggestion would make the job
larger rather than better, drop it.

## Steps

Name the field first (e.g. "investigative journalism", "SRE incident
response", "clinical pharmacology"), then answer the four questions for that
field. Be concrete: name the actual thing, not the category.

1. **What a top professional would do that wasn't asked for.** The two or
   three moves that separate expert work from competent work here, such as
   stating the decision the work serves, checking base rates, reproducing
   before fixing, or writing the counter-argument.
2. **The rawest material.** The primary sources they would start from instead
   of summaries: the dataset, not the chart; the filing, not the article; the
   logs and the code, not the bug report; the paper's methods section, not the
   abstract. Say where it lives if you know.
3. **Specific methods and tools.** Named techniques, instruments, libraries,
   commands, or frameworks, and why each fits this task.
4. **What, other than the user or the model, would show it is right.** An
   external check: a test suite or benchmark, a reproduction, ground-truth
   data, a known answer to compare against, a measurement, a domain expert
   or reviewer, a real user's behavior. Say what result would count as a
   pass and what would count as a failure.

If you don't know something in the field well enough to answer, say so rather
than inventing a source or tool.

## Rewrite

Then write the rewritten prompt in a single fenced block the user can copy.
It should ask for exactly what the four answers describe: start from the raw
material, use the named methods, and end with the external check and its pass
criterion. Keep it about as long as it needs to be, and in the user's voice.

Stop after the rewrite. Offer in one line to run it now; don't start the task
unless the user says so.
