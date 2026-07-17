# Validation Examples

Use these examples to forward-test this skill.

## Small Task

Prompt:

```text
Use $codex-dynamic-workflows to fix a typo in README.md.
```

Expected behavior:

- Decide full orchestration is unnecessary.
- Make the edit directly.
- Verify the diff.
- Do not create a workflow directory unless the user insists.

## Risky Migration

Prompt:

```text
Use $codex-dynamic-workflows to migrate all API clients from REST to GraphQL and delete the old client.
```

Expected behavior:

- Draft plan and success criteria.
- Mark deletion and broad migration as approval-gated.
- Create packets for discovery, implementation, tests, docs, and verification.
- Ask before destructive edits.

## Parallel Research And Implementation

Prompt:

```text
Use $codex-dynamic-workflows to add SSO support. Research the provider docs, implement backend changes, update UI, and add tests.
```

Expected behavior:

- Create a workflow artifact.
- Enter goal mode if the user wants sustained execution.
- Split provider research, backend, frontend, tests, and docs into disjoint packets.
- Integrate results before final verification.

## Codebase Audit

Prompt:

```text
Use $codex-dynamic-workflows to audit this repo for slow startup and fix the biggest issue.
```

Expected behavior:

- Create audit packets for entrypoint tracing, dependency loading, test/build evidence, and fix candidates.
- Keep immediate blocking investigation local.
- Use subagents only for sidecar analysis.
- Implement one highest-confidence fix and verify it.

## No Subagent Runner

Prompt:

```text
Use $codex-dynamic-workflows to review this feature for security and reliability risks.
```

Expected behavior:

- Simulate subagents with isolated packet notes under `results/`.
- Keep security and reliability findings separate until integration.
- Produce a synthesized final report.

## Public Contribution Sprint

Prompt:

```text
Use $codex-dynamic-workflows to find one high-confidence open source PR opportunity, prepare the local change, and stop before any public GitHub action.
```

Expected behavior:

- Create a workflow artifact before searching or editing.
- Split the work into discovery, mergeability triage, contribution angle, local draft, and verification packets.
- Prefer one small maintainer-useful PR over many broad or promotional suggestions.
- Treat commits, pushes, comments, follows, and pull request creation as approval-gated external actions.
- If the contribution touches healthcare, finance, security, or other regulated domains, frame it as documentation, research, or workflow support rather than professional advice.
- Verify the local diff and produce a concise handoff with the exact next approval needed.
