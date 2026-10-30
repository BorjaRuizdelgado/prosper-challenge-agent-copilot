import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { CardNode } from "../graph";
import { NEW_EDGE_HANDLE } from "../canvasActions";
import { useCallStore } from "../call/callStore";
import { chatOf, useCopilotStore } from "../copilot/copilotStore";
import { issueMessages, worstSeverity } from "../issues";
import { NODE_WIDTH } from "../layout";
import { useCanvasPath } from "../replay/replayView";
import { useAgentStore } from "../store";

const summary = (messages: { content: string }[] = []) => messages[0]?.content ?? "No task yet";

// One small glyph per node kind, the same shape language as the product mark.
const KIND_GLYPH = {
  greeting: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M3 4.5v3M6 3v6M9 4.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  collect: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M2.5 3.5h7M2.5 6h7M2.5 8.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  end: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <rect x="3" y="3" width="6" height="6" rx="1" fill="currentColor" />
    </svg>
  ),
};

export function NodeCard({ data, selected }: NodeProps<CardNode>) {
  const { node, initial } = data;
  const issues = useAgentStore((s) => s.issues);
  const active = useCallStore((s) => s.activeNode === node.name);
  const agentId = useAgentStore((s) => s.agentId);
  const runPath = useCanvasPath();
  const runState = runPath?.last === node.name ? "end" : runPath?.nodes.includes(node.name) ? "visited" : undefined;
  const copilotFocus = useCopilotStore((s) => chatOf(s.chats, agentId).focus === node.name);
  const severity = worstSeverity(issues, node.name);
  const edges = node.edges ?? [];
  const kind = node.end ? "end" : edges.some((e) => Object.keys(e.properties ?? {}).length) ? "collect" : "greeting";
  return (
    <div className={`node-card${selected ? " node-card--selected" : ""}${active ? " node-card--active" : ""}${copilotFocus ? " node-card--copilot" : ""}${runState ? ` node-card--run-${runState}` : ""}${data.change ? ` node-card--${data.change}` : ""}`}
      data-active={active || undefined} data-copilot-focus={copilotFocus || undefined} data-run={runState} data-change={data.change} style={{ width: NODE_WIDTH }}>
      {/* Loose connection mode lets every handle start or receive a connection. The centre of the left
          side is where edges end, so that handle only receives and lets the edge's own drag anchor
          (retargeting) through; every side has a separate "new edge" handle for starting edges. */}
      <Handle type="target" position={Position.Top} className="node-card__in" isConnectableStart={false} />
      <Handle type="source" id={`${NEW_EDGE_HANDLE}_left`} position={Position.Left} className="node-card__new node-card__new--left" title="Drag to another node to add an edge" />
      <Handle type="source" id={`${NEW_EDGE_HANDLE}_top`} position={Position.Top} className="node-card__new node-card__new--top" title="Drag to another node to add an edge" />
      <Handle type="source" id={`${NEW_EDGE_HANDLE}_right`} position={Position.Right} className="node-card__new node-card__new--right" title="Drag to another node to add an edge" />
      <header className="node-card__head">
        <span className={`node-card__tile node-card__tile--${kind}`} aria-hidden>
          {KIND_GLYPH[kind]}
        </span>
        <span className="node-card__name">{node.name}</span>
        {initial && <span className="pill pill--accent">Start</span>}
        {node.end && <span className="pill">End</span>}
        {severity && (
          <span
            className={`marker marker--${severity}`}
            role="img"
            aria-label={`${severity} on this node`}
            title={issueMessages(issues, node.name).join("\n")}
          >
            !
          </span>
        )}
      </header>
      <p className="node-card__task">{summary(node.task_messages)}</p>
      <ul className="node-card__edges">
        {edges.map((e, i) => (
          <li key={e.function} className="node-card__edge">
            <span>{e.function}</span>
            {worstSeverity(issues, node.name, e.function) && (
              <span
                className={`marker marker--${worstSeverity(issues, node.name, e.function)}`}
                role="img"
                aria-label={`${worstSeverity(issues, node.name, e.function)} on edge ${e.function}`}
                title={issueMessages(issues, node.name, e.function).join("\n")}
              >
                !
              </span>
            )}
            <Handle
              type="source"
              id={e.function}
              position={Position.Right}
              className="node-card__out"
              style={{ top: undefined }}
              data-index={i}
            />
          </li>
        ))}
      </ul>
      <Handle
        type="source"
        id={`${NEW_EDGE_HANDLE}_bottom`}
        position={Position.Bottom}
        className="node-card__new node-card__new--bottom"
        title="Drag to another node to add an edge"
      />
    </div>
  );
}
