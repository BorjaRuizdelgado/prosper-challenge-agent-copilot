import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath, useStore } from "@xyflow/react";
import { useRef } from "react";
import { useAgentStore } from "../store";

/** A bezier edge whose label (the function name) can be dragged away from the middle, e.g. to untangle overlaps. */
export function LabelEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, selected, markerEnd }: EdgeProps) {
  const offset = useAgentStore((s) => s.labelOffsets[id]) ?? { x: 0, y: 0 };
  const moveLabel = useAgentStore((s) => s.moveLabel);
  const select = useAgentStore((s) => s.select);
  const zoom = useStore((s) => s.transform[2]);
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number }; moved: boolean } | null>(null);

  const [path, midX, midY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const [nodeName, fn] = id.split("::");

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className={`edge-label nodrag nopan${selected ? " edge-label--selected" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${midX + offset.x}px, ${midY + offset.y}px)` }}
          title="Drag to move this label"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, from: offset, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            d.moved = true;
            moveLabel(id, { x: d.from.x + (e.clientX - d.x) / zoom, y: d.from.y + (e.clientY - d.y) / zoom });
          }}
          onPointerUp={() => {
            if (drag.current && !drag.current.moved) select({ kind: "edge", node: nodeName, function: fn });
            drag.current = null;
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
