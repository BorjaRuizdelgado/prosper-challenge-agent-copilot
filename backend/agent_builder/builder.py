#
# AgentBuilder — loads a declarative agent (JSON / dict) and compiles its node
# graph into Pipecat Flows objects.
#
#   JSON  ->  AgentConfig (validated)  ->  Pipecat Flows NodeConfig graph
#
# This is the seam between "agent as data" (what the Phase 2 Composer produces)
# and "agent as a running conversation" (what bot.py executes). Keeping the
# compile + validation here means bot.py never touches the graph internals.
#

import inspect
import json
from dataclasses import asdict
from pathlib import Path
from typing import Awaitable, Callable, Optional, Union

from loguru import logger
from pipecat_flows import FlowManager, FlowsFunctionSchema, NodeConfig

from .schema import AgentConfig, Edge, Node
from .validation import validate

# (from_node, to_node, via_function, collected_args); may be sync or async.
TransitionCallback = Callable[[str, str, str, dict], Union[None, Awaitable[None]]]


class AgentBuilder:
    """Builds a runnable Pipecat Flows graph from a declarative AgentConfig."""

    def __init__(self, config: AgentConfig, on_transition: Optional[TransitionCallback] = None):
        self.config = config
        # Settable after construction: bot.py only has the worker to report through later.
        self.on_transition = on_transition
        self._nodes_by_name = {n.name: n for n in config.nodes}
        self._validate()

    # ---- loading -----------------------------------------------------------
    @classmethod
    def from_dict(cls, data: dict) -> "AgentBuilder":
        return cls(AgentConfig.from_dict(data))

    @classmethod
    def from_json(cls, path: Union[str, Path]) -> "AgentBuilder":
        data = json.loads(Path(path).read_text())
        return cls.from_dict(data)

    # ---- validation --------------------------------------------------------
    def _validate(self) -> None:
        errors = [i for i in validate(asdict(self.config)) if i.severity == "error"]
        if errors:
            raise ValueError(" ".join(i.message for i in errors))

    # ---- compilation -------------------------------------------------------
    def build_initial_node(self) -> NodeConfig:
        """Return the entry NodeConfig; downstream nodes are built lazily on transition."""
        return self._make_node(self._nodes_by_name[self.config.initial_node])

    def _make_node(self, node: Node) -> NodeConfig:
        node_config: NodeConfig = {
            "name": node.name,
            "role_message": node.role_message or self.config.persona,
            "task_messages": node.task_messages,
            "functions": [self._make_edge_function(node, edge) for edge in node.edges],
        }
        if node.pre_actions:
            node_config["pre_actions"] = node.pre_actions
        # Explicit post_actions win; otherwise a terminal node ends the call.
        if node.post_actions:
            node_config["post_actions"] = node.post_actions
        elif node.end:
            node_config["post_actions"] = [{"type": "end_conversation"}]
        return node_config

    def _make_edge_function(self, node: Node, edge: Edge) -> FlowsFunctionSchema:
        async def handler(args: dict, flow_manager: FlowManager):
            # Persist what the caller gave us so later nodes can use it.
            flow_manager.state.update(args)
            logger.info(f"[{edge.function}] -> {edge.target} | collected: {args}")
            if self.on_transition:
                result = self.on_transition(node.name, edge.target, edge.function, args)
                if inspect.isawaitable(result):
                    await result
            next_node = self._make_node(self._nodes_by_name[edge.target])
            return {"status": "success", **args}, next_node

        return FlowsFunctionSchema(
            name=edge.function,
            description=edge.description,
            properties=edge.properties,
            required=edge.required,
            handler=handler,
        )
