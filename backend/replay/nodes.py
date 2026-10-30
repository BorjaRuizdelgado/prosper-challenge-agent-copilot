"""Per-node prompt material for the simulator, built from ``AgentConfig``.

Mirrors ``AgentBuilder._make_node`` (role message, task messages, one tool per
edge, pre/post actions, implicit ``end_conversation`` on end nodes). A parity
test keeps the two in step.
"""

from dataclasses import dataclass, field

from agent_builder.schema import AgentConfig, Node


@dataclass
class NodeSpec:
    name: str
    system: str
    task_messages: list
    tools: list  # OpenAI chat-completions tool definitions
    edges: dict = field(default_factory=dict)  # function name -> target node
    pre_actions: list = field(default_factory=list)
    post_actions: list = field(default_factory=list)


def build_node(config: AgentConfig, node: Node) -> NodeSpec:
    tools = []
    edges = {}
    for edge in node.edges:
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": edge.function,
                    "description": edge.description,
                    "parameters": {
                        "type": "object",
                        "properties": edge.properties,
                        "required": edge.required,
                    },
                },
            }
        )
        edges[edge.function] = edge.target
    post_actions = node.post_actions
    if not post_actions and node.end:
        post_actions = [{"type": "end_conversation"}]
    return NodeSpec(
        name=node.name,
        system=node.role_message or config.persona,
        task_messages=node.task_messages,
        tools=tools,
        edges=edges,
        pre_actions=node.pre_actions,
        post_actions=post_actions,
    )


def build_nodes(config: AgentConfig) -> dict:
    return {n.name: build_node(config, n) for n in config.nodes}
