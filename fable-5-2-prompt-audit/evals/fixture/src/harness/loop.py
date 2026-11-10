"""Agent loop for the support agent."""
import anthropic

from .prompt import BASE, task_prompt
from .tools import TOOLS, run_tool

MODEL = "claude-fable-5-2"
KEEP_RECENT = 6

client = anthropic.Anthropic()


def trim_old_tool_results(messages: list) -> None:
    """Keep the context small: blank out tool results older than KEEP_RECENT turns."""
    for message in messages[:-KEEP_RECENT]:
        if message["role"] != "user" or isinstance(message["content"], str):
            continue
        for block in message["content"]:
            if block.get("type") == "tool_result":
                block["content"] = "[result removed to save space]"


def run(task: str, budget: int = 400_000) -> str:
    system = BASE  # built once per conversation
    messages = [{"role": "user", "content": task_prompt(task, budget, 0)}]
    while True:
        trim_old_tool_results(messages)
        response = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            system=system,
            tools=TOOLS,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason != "tool_use":
            return response.content[-1].text
        results = [run_tool(b) for b in response.content if b.type == "tool_use"]
        messages.append({"role": "user", "content": results})
