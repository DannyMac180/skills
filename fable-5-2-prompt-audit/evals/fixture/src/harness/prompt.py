"""Builds the prompt text for the support agent."""

BASE = open("prompts/support_chat.md").read()


def task_prompt(task: str, budget: int, used: int) -> str:
    return (
        f"{task}\n\n"
        f"You may spend up to {budget:,} tokens on this task. "
        f"You have {budget - used:,} tokens left."
    )
