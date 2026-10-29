import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { CardNode } from "../graph";
import { NEW_EDGE_HANDLE } from "../canvasActions";
import { NODE_WIDTH } from "../layout";

const summary = (messages: { content: string }[] = []) => messages[0]?.content ?? "No task yet";

export function NodeCard({ data, selected }: NodeProps<CardNode>) {
  const { node, initial } = data;
  const edges = node.edges ?? [];
  const kind = node.end ? "end" : edges.some((e) => Object.keys(e.properties ?? {}).length) ? "collect" : "greeting";
  return (
    <div className={`node-card${selected ? " node-card--selected" : ""}`} style={{ width: NODE_WIDTH }}>
      {/* Loose connection mode lets every handle start or receive a connection: left is the plain
          target, the other three sides get a "new edge" handle. */}
      <Handle type="target" position={Position.Left} className="node-card__in" title="Drag to another node to add an edge" />
      <Handle type="source" id={`${NEW_EDGE_HANDLE}_top`} position={Position.Top} className="node-card__new node-card__new--top" title="Drag to another node to add an edge" />
      <Handle type="source" id={`${NEW_EDGE_HANDLE}_right`} position={Position.Right} className="node-card__new node-card__new--right" title="Drag to another node to add an edge" />
      <header className="node-card__head">
        <span className={`node-card__tile node-card__tile--${kind}`} aria-hidden />
        <span className="node-card__name">{node.name}</span>
        {initial && <span className="pill pill--accent">Start</span>}
        {node.end && <span className="pill">End</span>}
      </header>
      <p className="node-card__task">{summary(node.task_messages)}</p>
      <ul className="node-card__edges">
        {edges.map((e, i) => (
          <li key={e.function} className="node-card__edge">
            <span>{e.function}</span>
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
