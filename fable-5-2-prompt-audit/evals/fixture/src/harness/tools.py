"""Tools the support agent can call."""

TOOLS = [
    {
        "name": "lookup_parcel",
        "description": "Look up a parcel by tracking number. Returns its status and scan history.",
        "input_schema": {
            "type": "object",
            "properties": {"tracking_number": {"type": "string"}},
            "required": ["tracking_number"],
        },
    }
]


def run_tool(block):
    return {"type": "tool_result", "tool_use_id": block.id, "content": "in transit"}
