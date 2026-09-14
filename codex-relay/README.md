# Relay

A lightweight Codex skill from [Attention Heads](https://www.attentionheads.blog). Open a new native Codex task from the one you are in, hand it a compact brief, end your turn, and get one completion or blocker message back. The parent task then verifies the real result instead of trusting the claim.

Inspired by [Eric's post](https://x.com/pvncher/status/2098841379837260144) on threads that hand work to each other.

## Why

Long tasks clog your current thread. Relay lets you push a bounded job to a fresh task with the model and effort you choose, keep your thread free, and still get a single message back when it finishes.

## Examples

```text
Use $codex-relay to open a new task with Sol to fix the empty-email validation and report back here.
```

```text
Use $codex-relay to open a new task that compares the two CSV exports in ./data and reports which rows differ.
```

The second example names no model, so the new task uses your configured default.

## Install

Point your agent at the folder:

```text
Install the AI agent skill at https://github.com/DannyMac180/skills/tree/main/codex-relay
```

Or copy it manually:

```bash
git clone https://github.com/DannyMac180/skills.git
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/codex-relay "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Start a new session afterwards.

## Verify

Open a task in a Git project and ask:

```text
Use $codex-relay to open a new task that adds a one-line note to NOTES.md in a worktree and reports back here.
```

You should see the parent say it dispatched, end its turn, and later receive one message from the worker with its thread ID, the worktree path, and what it did. Check that path yourself.

## Requirements and limits

- Requires an environment that exposes Codex task tools for creating threads and sending messages, currently Codex desktop. Without those tools the skill explains the limitation and stops.
- No automatic model routing. You choose the model and effort, or your default applies to whichever you leave out.
- The new task does not inherit your conversation. Cache behavior and usage depend on your setup, so there is no guaranteed saving.
- If the worker fails before sending its callback, nothing wakes the parent. Open the worker task and inspect it manually.
- Normal OS and sandbox permissions still apply to the worker.

## License

MIT
