#
# Structured agent validation. Works on the raw JSON document (not AgentConfig) so
# it can describe a broken agent instead of crashing on it. One source of truth:
# AgentBuilder raises on any error, and the UI shows the same issues via the API.
#

from dataclasses import asdict, dataclass
from typing import Optional


@dataclass
class Issue:
    severity: str  # "error" | "warning"
    code: str
    message: str
    node: Optional[str] = None
    edge: Optional[str] = None  # edge function name, within `node`


def _error(code: str, message: str, **where) -> Issue:
    return Issue("error", code, message, **where)


def _warning(code: str, message: str, **where) -> Issue:
    return Issue("warning", code, message, **where)


def validate(data: dict) -> list[Issue]:
    nodes = [n for n in (data.get("nodes") or []) if isinstance(n, dict)]
    if not nodes:
        return [_error("no-nodes", "The agent has no nodes.")]

    issues: list[Issue] = []
    names: set[str] = set()
    for node in nodes:
        name = node.get("name")
        if name in names:
            issues.append(_error("duplicate-node", f"Node name '{name}' is used more than once.", node=name))
        names.add(name)

    initial = data.get("initial_node")
    if initial not in names:
        issues.append(_error("bad-initial", f"initial_node '{initial}' is not a defined node."))

    reachable_from: dict[str, list[str]] = {}
    for node in nodes:
        name = node.get("name")
        edges = [e for e in (node.get("edges") or []) if isinstance(e, dict)]
        seen_functions: set[str] = set()
        for edge in edges:
            function = edge.get("function")
            if function in seen_functions:
                issues.append(
                    _error(
                        "duplicate-function",
                        f"Node '{name}' has more than one edge named '{function}'.",
                        node=name,
                        edge=function,
                    )
                )
            seen_functions.add(function)
            target = edge.get("target")
            if target not in names:
                issues.append(
                    _error(
                        "unknown-target",
                        f"Edge '{function}' in node '{name}' targets unknown node '{target}'.",
                        node=name,
                        edge=function,
                    )
                )
            else:
                reachable_from.setdefault(name, []).append(target)
        if not edges and not node.get("end"):
            issues.append(
                _warning("dead-end", f"Node '{name}' is not terminal and has no edges out.", node=name)
            )

    if initial in names:
        visited, stack = set(), [initial]
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            stack.extend(reachable_from.get(current, []))
        for name in sorted(n for n in names if n not in visited and isinstance(n, str)):
            issues.append(_warning("unreachable", f"Node '{name}' cannot be reached from the initial node.", node=name))

    if not any(n.get("end") for n in nodes):
        issues.append(_warning("no-terminal", "No node ends the call."))

    return issues


def validate_as_dicts(data: dict) -> list[dict]:
    return [asdict(i) for i in validate(data)]
