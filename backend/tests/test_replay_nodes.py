import json
from pathlib import Path

import pytest

from agent_builder.builder import AgentBuilder
from agent_builder.schema import AgentConfig
from copilot import workspace
from replay.nodes import build_nodes

# The committed demo agents, not the git-ignored agents store `make demo` copies them into.
AGENTS = Path(__file__).resolve().parent.parent / "demo" / "agents"
PATHS = [AGENTS / f"{n}.json" for n in ("demo-riverside-scheduler", "demo-sunrise-refills", "demo-lakeside-billing")]
PATHS += sorted((workspace.skill_dir() / "blueprints").glob("*.json"))


@pytest.mark.parametrize("path", PATHS, ids=lambda p: p.stem)
def test_nodes_match_agent_builder(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    builder = AgentBuilder.from_dict(data)
    specs = build_nodes(AgentConfig.from_dict(data))

    assert set(specs) == set(builder._nodes_by_name)
    for name, node in builder._nodes_by_name.items():
        expected = builder._make_node(node)
        spec = specs[name]
        assert spec.system == expected["role_message"]
        assert spec.task_messages == expected["task_messages"]
        assert spec.pre_actions == expected.get("pre_actions", [])
        assert spec.post_actions == expected.get("post_actions", [])
        assert [t["function"]["name"] for t in spec.tools] == [f.name for f in expected["functions"]]
        for tool, fn in zip(spec.tools, expected["functions"]):
            assert tool["function"]["description"] == fn.description
            assert tool["function"]["parameters"]["properties"] == fn.properties
            assert tool["function"]["parameters"]["required"] == fn.required
