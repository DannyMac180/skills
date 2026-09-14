---
name: codex-relay
description: Open one new native Codex task with a compact handoff, end this turn, and receive a single completion or blocker message back. Use when the user invokes $codex-relay and asks to open a new task, optionally naming a model or reasoning effort.
---

# Relay

Open one native Codex task, hand off a bounded job, end this turn, and verify the worker's callback. The invocation plus a request to open a task is the authorization; never create tasks otherwise.

## Preconditions

If any is missing, explain and stop. Do not create an orphan, promise a wake-up you cannot deliver, or substitute a CLI, subagent, or automation.

- `create_thread` and `send_message_to_thread` are exposed.
- `CODEX_THREAD_ID` is non-empty (plus host if remote). Never derive it from the cwd or reuse a child ID.
- The user named the task.

## Model and effort

Use exactly what the user selected, handling the two independently: omit only the model field if no model was named, and only the thinking field if no effort was named, so each falls back to the configured default. If a model is unavailable, say so and ask; never substitute. Resolve ambiguity from tool metadata; ask only when material.

## Workspace

Use `list_projects` to find the target when files are involved. Honor a user-specified branch, working-tree state, or saved checkout via the option `create_thread` supports; only when unspecified, default to a worktree for Git projects and local otherwise. A default worktree starts from the default branch without uncommitted changes; if a requested state is unsupported, say so rather than implying it was included. For projectless work, reference supplied accessible files.

## Handoff brief

The worker inherits nothing from this conversation. Carry the full intent, minimum context, owned files and scope, exact paths and artifacts, workspace choice, required checks, authorization bounds, and the origin thread ID and host.

Embed worker instructions: do the bounded task only and create no further tasks. On completion send ONE message to the origin with your thread ID and host, outcome, actual workspace and artifact paths, checks with results, and limitations; if unable to proceed, send a blocker instead. End your turn after that message. The callback is an internal handoff, not publication.

## Dispatch

1. Call `create_thread`. It returns a ready `threadId` plus `hostId`, or a pending `clientThreadId`. Never pass a `clientThreadId` to read, send, or wait tools.
2. If pending, make at most one `list_threads` setup check. Use an immediate `wait_threads` snapshot only after a ready `threadId` is known. If still pending, report setup pending, emit the returned `clientThreadId` directive, and end. Never guess or poll.
3. Say the task is dispatched, emit the native created-thread directive if required, and end.

## Callback

If the callback arrives before this turn ends, handle it immediately; never add delay to manufacture an idle wake-up.

- Authenticate the sender by ready ID when known. Otherwise compare the worker's creation prompt (via `read_thread`) against the actual handoff; a similar title is not enough. If unverifiable, say so and do not act.
- Verify results in the actual workspace, especially the right worktree. Report claim versus verified success within the original scope.
- No blind merge and no acknowledgment ping-pong. A scoped correction within existing authorization may go through `send_message_to_thread`, omitting model and thinking fields.
- A duplicate callback repeats nothing and spawns no new worker.
