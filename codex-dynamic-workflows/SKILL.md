---
name: codex-dynamic-workflows
description: "Design a multi-agent workflow for a complex task when the user requests dynamic orchestration."
---

# AI Agent Dynamic Workflows

Use this skill to turn a large task into a supervised AI-agent workflow: draft an orchestration artifact, enter goal mode when sustained execution is requested, delegate disjoint work to subagents when available, integrate results, verify the outcome, and save reusable workflow artifacts.

This skill works in agents that support skills. Do not claim that a local script can call subagent tools unless the current environment exposes such a runner. When no programmable runner exists, create a human-readable orchestration script and operate it through the available agent tools.

## Decision Rule

Use this skill when the user requests dynamic orchestration. Task complexity, risk, or parallel tracks alone do not activate it. Within an authorized workflow, choose only delegation that contributes a concrete independent result.

## Operating Contract

When using this skill:

1. Restate the goal and success criteria.
2. Create or update a workflow artifact before delegating.
3. Check authorization for consequential actions against the boundaries below; do not ask again for an action already authorized within scope.
4. Create a goal only when explicitly requested by the user or system/developer instructions; ordinary multi-turn work does not authorize goal creation.
5. Split work into disjoint packets with clear ownership.
6. Spawn subagents only when the current environment allows it and the user has authorized delegated or parallel agent work.
7. If no subagent runner is available, perform independent passes locally and label them as parent work, not subagent results.
8. Integrate results explicitly; do not paste raw subagent dumps as the final answer.
9. Verify with checks matched to the task's blast radius.
10. Save reusable artifacts only when they will help future work.

## Workflow Artifacts

Prefer creating a local run directory:

```text
.workflow/<slug>/
|-- plan.md
|-- state.json
|-- orchestration.md
|-- packets/
|-- results/
`-- final-report.md
```

Use `scripts/new_workflow.py` to scaffold this structure:

```bash
python3 /path/to/codex-dynamic-workflows/scripts/new_workflow.py "Task title"
```

Keep `plan.md` human-readable. Use `state.json` for status, packet IDs, approval state, and verification state. Use `orchestration.md` as the executable mental model: the sequence the agent will follow, the branching rules, and the packet prompts.

## Orchestration Plan

Draft a concise plan with:

```text
Goal:
Success criteria:
Current context:
Constraints:
Risks:
Approval required:
Workflow artifact path:
Work packets:
Integration policy:
Verification:
Reusable artifacts:
```

Do not over-plan obvious work. The plan should be detailed enough to guide delegation and verification, not a substitute for execution.

## Approval Gates

Obtain missing authorization before consequential actions: publishing or sending to a named destination, production mutations, destructive deletion or history rewriting, credential/account/security changes, or materially costly workloads. Existing explicit authorization persists within its scope. A generic request to implement does not authorize unrelated external actions.

Authorized local edits, including replacing file contents as part of the requested change, and relevant disposable-fixture checks may proceed. Prepare the concrete result before asking for any missing authorization. Continue independent preparation and repair while a consequential action awaits approval.

Use [risk-gates.md](references/risk-gates.md) when the action's authorization is unclear.

## Goal Mode

Create a goal only when explicitly requested by the user or system/developer instructions and supported by the current tool contract. A request to run a workflow, work for several turns, or continue implementation is not by itself a request to create a tracked goal. Keep any authorized goal's full objective intact.

## Work Packets

Each packet must be self-contained:

```text
Packet ID:
Objective:
Context:
Files / sources:
Ownership:
Do:
Do not:
Expected output:
Verification:
```

Prefer packets with disjoint ownership:

- codebase discovery
- dependency or API research
- implementation slice
- tests and fixtures
- docs and examples
- UX or product review
- security or risk review
- final verification

For code-edit packets, assign non-overlapping files or modules. Tell workers they are not alone in the codebase, must not revert others' edits, and must adapt to concurrent changes.

## Subagents

When a subagent runner is available:

- Spawn only concrete, bounded, materially useful subtasks.
- Keep immediate blocking work local.
- Delegate sidecar work that can run while the main agent makes progress.
- Avoid duplicate work across agents.
- Ask workers to edit directly only when their write scope is disjoint and clear.
- Wait for subagents only when their result is needed for the next critical-path step.

When no subagent runner is available:

- Perform isolated packet passes locally and label them as parent work.
- Read only packet-relevant files during each pass.
- Write packet notes under `results/`.
- Integrate only after packet outputs are separate.

## Integration

After packets complete, synthesize:

```text
Accepted:
Rejected:
Conflicts:
Decisions:
Final changes:
Remaining risks:
```

Resolve conflicts explicitly. If two packets disagree, inspect the authoritative source before choosing.

Use `scripts/collect_results.py` to produce an integration checklist from result files:

```bash
python3 /path/to/codex-dynamic-workflows/scripts/collect_results.py .workflow/<slug>
```

## Verification

Run the narrowest reliable checks first, then broaden as risk warrants:

- unit tests for touched code
- typecheck or lint
- build
- browser or UI smoke test
- script dry run
- source citation check
- migration dry run
- manual checklist for non-code work

Use `scripts/verify_workflow.py` to check workflow artifact completeness:

```bash
python3 /path/to/codex-dynamic-workflows/scripts/verify_workflow.py .workflow/<slug>
```

Report skipped checks honestly. Do not treat a workflow as complete until the evidence proves the original success criteria.

## Reusable Recipes

When a run produces a useful pattern, save a concise recipe in a project-appropriate location, such as `.workflow/recipes/<name>.md` or a repo docs folder. Include:

- trigger
- plan shape
- packet list
- verification checklist
- known risks

Do not save transcripts, secrets, bulky logs, credentials, or sensitive personal details.

## References

- Read `references/plan-schema.md` when a machine-readable workflow plan is useful.
- Read `references/risk-gates.md` before risky or ambiguous operations.
- Read `references/validation-examples.md` when forward-testing or improving this skill.
