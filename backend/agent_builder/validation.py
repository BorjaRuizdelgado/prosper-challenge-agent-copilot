#
# Structured agent validation. Works on the raw JSON document (not AgentConfig) so
# it can describe a broken agent instead of crashing on it. One source of truth:
# AgentBuilder raises on any error, and the UI shows the same issues via the API.
#

import re
from dataclasses import asdict, dataclass

# Edges become LLM tools; OpenAI rejects tool names outside this pattern mid-call.
FUNCTION_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


@dataclass
class Issue:
    severity: str  # "error" | "warning"
    code: str
    message: str
    node: str | None = None
    edge: str | None = None  # edge function name, within `node`


def _error(code: str, message: str, **where) -> Issue:
    return Issue("error", code, message, **where)


def _warning(code: str, message: str, **where) -> Issue:
    return Issue("warning", code, message, **where)


def _is_text(value) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _edge_issues(name: str, edge: dict) -> list[Issue]:
    """Problems inside one edge that would break building it or calling it as an LLM tool."""
    function = edge.get("function") if _is_text(edge.get("function")) else None
    where = {"node": name, "edge": function}
    label = f"Edge '{function}' in node '{name}'" if function else f"An edge in node '{name}'"
    issues: list[Issue] = []
    for key in ("function", "description", "target"):
        if not _is_text(edge.get(key)):
            issues.append(_error("missing-field", f"{label} needs a non-empty '{key}'.", **where))
    if function and not FUNCTION_NAME_RE.fullmatch(function):
        issues.append(
            _error(
                "bad-function-name",
                f"{label} has an invalid function name: use only letters, digits, '_' and '-' (max 64).",
                **where,
            )
        )

    properties, required = edge.get("properties", {}), edge.get("required", [])
    if not isinstance(properties, dict) or not isinstance(required, list):
        issues.append(_error("bad-parameters", f"{label} needs 'properties' as an object and 'required' as a list.", **where))
        return issues
    for param in required:
        if param not in properties:
            issues.append(_warning("unknown-required", f"{label} requires '{param}', which is not one of its parameters.", **where))
    for param, spec in properties.items():
        if not isinstance(spec, dict) or not spec.get("type"):
            issues.append(_warning("untyped-parameter", f"Parameter '{param}' of {label.lower()} has no type.", **where))
        elif spec["type"] == "array" and not isinstance(spec.get("items"), dict):
            # OpenAI rejects the whole tool list when an array parameter does not say what it holds.
            issues.append(_error("array-without-items", f"Parameter '{param}' of {label.lower()} is a list but has no item type.", **where))
    return issues


# Actions the JSON format can express: Pipecat Flows' "function" action needs a Python handler.
SUPPORTED_ACTIONS = ("tts_say", "end_conversation")


def _action_issues(name: str, node: dict) -> list[Issue]:
    """Pre/post actions run by Pipecat Flows; an unknown or malformed one raises mid-call."""
    issues: list[Issue] = []
    for field in ("pre_actions", "post_actions"):
        actions = node.get(field, [])
        if not isinstance(actions, list):
            issues.append(_error("bad-actions", f"Node '{name}' needs '{field}' as a list.", node=name))
            continue
        for i, action in enumerate(actions, 1):
            kind = action.get("type") if isinstance(action, dict) else None
            if kind not in SUPPORTED_ACTIONS:
                issues.append(
                    _error(
                        "bad-action",
                        f"Action {i} in {field} of node '{name}' must have a type of {' or '.join(SUPPORTED_ACTIONS)} (got {kind!r}).",
                        node=name,
                    )
                )
            elif kind == "tts_say" and not _is_text(action.get("text")):
                issues.append(_warning("empty-say", f"Action {i} in {field} of node '{name}' has nothing to say, so it is skipped.", node=name))

    post = node.get("post_actions") or []
    if node.get("end") and isinstance(post, list) and post:
        # AgentBuilder only adds end_conversation to a terminal node when it has no post-actions of its own.
        if not any(isinstance(a, dict) and a.get("type") == "end_conversation" for a in post):
            issues.append(
                _warning(
                    "end-not-ending",
                    f"Node '{name}' ends the call, but its post-actions replace the hang-up: add an end_conversation action.",
                    node=name,
                )
            )
    return issues


def validate(data: dict) -> list[Issue]:
    nodes = [n for n in (data.get("nodes") or []) if isinstance(n, dict)]
    if not nodes:
        return [_error("no-nodes", "The agent has no nodes.")]

    issues: list[Issue] = []
    if not _is_text(data.get("name")):
        issues.append(_error("missing-field", "The agent needs a non-empty 'name'."))

    names: set[str] = set()
    for node in nodes:
        name = node.get("name")
        if not _is_text(name):
            issues.append(_error("missing-field", "Every node needs a non-empty 'name'."))
            continue
        if name in names:
            issues.append(_error("duplicate-node", f"Node name '{name}' is used more than once.", node=name))
        names.add(name)

    initial = data.get("initial_node")
    if not isinstance(initial, str) or initial not in names:
        issues.append(_error("bad-initial", f"initial_node '{initial}' is not a defined node."))

    reachable_from: dict[str, list[str]] = {}
    for node in nodes:
        name = node.get("name")
        if not _is_text(name):
            continue
        tasks = node.get("task_messages", [])
        if not isinstance(tasks, list):
            issues.append(_error("bad-tasks", f"Node '{name}' needs 'task_messages' as a list.", node=name))
        elif not tasks:
            issues.append(_warning("no-task", f"Node '{name}' has no task messages, so the agent has no instructions there.", node=name))
        issues.extend(_action_issues(name, node))
        edges = [e for e in (node.get("edges") or []) if isinstance(e, dict)]
        seen_functions: set[str] = set()
        for edge in edges:
            issues.extend(_edge_issues(name, edge))
            # Missing or non-string fields were reported by _edge_issues; skip the checks that need them.
            function = edge.get("function") if _is_text(edge.get("function")) else None
            if function in seen_functions:
                issues.append(
                    _error(
                        "duplicate-function",
                        f"Node '{name}' has more than one edge named '{function}'.",
                        node=name,
                        edge=function,
                    )
                )
            if function:
                seen_functions.add(function)
            target = edge.get("target")
            if not _is_text(target):
                continue
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
            issues.append(_warning("dead-end", f"Node '{name}' is not terminal and has no edges out.", node=name))

    if isinstance(initial, str) and initial in names:
        visited, stack = set(), [initial]
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            stack.extend(reachable_from.get(current, []))
        for name in sorted(n for n in names if n not in visited):
            issues.append(_warning("unreachable", f"Node '{name}' cannot be reached from the initial node.", node=name))

    if not any(n.get("end") for n in nodes):
        issues.append(_warning("no-terminal", "No node ends the call."))

    return issues


def validate_as_dicts(data: dict) -> list[dict]:
    return [asdict(i) for i in validate(data)]
