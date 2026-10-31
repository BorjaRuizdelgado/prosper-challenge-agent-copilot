import { BaseEdge, EdgeLabelRenderer, type EdgeProps, Position, useStore } from "@xyflow/react";
import { useRef } from "react";
import { useCallStore } from "../call/callStore";
import { useCanvasPath } from "../replay/replayView";
import { worstSeverity } from "../issues";
import { useAgentStore } from "../store";

const CURVATURE = 0.25;

const controlDistance = (distance: number) => (distance >= 0 ? 0.5 * distance : CURVATURE * 25 * Math.sqrt(-distance));

/** Control point of React Flow's default bezier for the end at (x1, y1) facing `pos` towards (x2, y2). */
function control(pos: Position, x1: number, y1: number, x2: number, y2: number): [number, number] {
  switch (pos) {
    case Position.Left:
      return [x1 - controlDistance(x1 - x2), y1];
    case Position.Right:
      return [x1 + controlDistance(x2 - x1), y1];
    case Position.Top:
      return [x1, y1 - controlDistance(y1 - y2)];
    default:
      return [x1, y1 + controlDistance(y2 - y1)];
  }
}

/**
 * React Flow's default bezier, with both control points shifted so that the curve's midpoint moves by `offset`.
 * The midpoint of a cubic is (S + 3c1 + 3c2 + T) / 8, so shifting both controls by 4/3 of the offset moves it exactly there.
 */
export function bezierThroughOffset(
  [sx, sy]: [number, number],
  [tx, ty]: [number, number],
  sourcePosition: Position,
  targetPosition: Position,
  offset: { x: number; y: number },
) {
  const k = 4 / 3;
  const [c1x, c1y] = control(sourcePosition, sx, sy, tx, ty);
  const [c2x, c2y] = control(targetPosition, tx, ty, sx, sy);
  const [a, b, c, d] = [c1x + offset.x * k, c1y + offset.y * k, c2x + offset.x * k, c2y + offset.y * k];
  const mid = {
    x: (sx + 3 * c1x + 3 * c2x + tx) / 8 + offset.x,
    y: (sy + 3 * c1y + 3 * c2y + ty) / 8 + offset.y,
  };
  return { path: `M${sx},${sy} C${a},${b} ${c},${d} ${tx},${ty}`, mid };
}

const GUTTER = 28;
const LABEL_ABOVE_TARGET = 36;
const CORNER = 14;
const MIN_DROP = 60;

/** Straight segments through `points` with each corner rounded by `radius` (shrunk on short segments). */
function roundedPolyline(points: [number, number][], radius: number) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r === 0) {
      d += ` L${cx},${cy}`;
      continue;
    }
    d += ` L${cx - ((cx - px) / inLen) * r},${cy - ((cy - py) / inLen) * r}`;
    d += ` Q${cx},${cy} ${cx + ((nx - cx) / outLen) * r},${cy + ((ny - cy) / outLen) * r}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L${lx},${ly}`;
}

/**
 * Orthogonal route for an edge leaving a node's right side towards the top of a node further down: out into the
 * gutter, down, across the gap above the target, then straight down into it. Staying outside both cards keeps the
 * line (and its label, which sits on the horizontal run) clear of them. Dragging the label moves the run.
 */
export function routedThroughOffset([sx, sy]: [number, number], [tx, ty]: [number, number], offset: { x: number; y: number }) {
  const gx = sx + GUTTER + offset.x * 2;
  const my = ty - LABEL_ABOVE_TARGET + offset.y;
  const path = roundedPolyline(
    [
      [sx, sy],
      [gx, sy],
      [gx, my],
      [tx, my],
      [tx, ty],
    ],
    CORNER,
  );
  return { path, mid: { x: (gx + tx) / 2, y: my } };
}

/** A bezier edge whose label (the function name) can be dragged; the line bends to keep passing through it. */
export function LabelEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, selected, markerEnd, data }: EdgeProps) {
  const offset = useAgentStore((s) => s.labelOffsets[id]) ?? { x: 0, y: 0 };
  const moveLabel = useAgentStore((s) => s.moveLabel);
  const select = useAgentStore((s) => s.select);
  const zoom = useStore((s) => s.transform[2]);
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number }; moved: boolean } | null>(null);

  const routed = sourcePosition === Position.Right && targetPosition === Position.Top && targetY - sourceY > MIN_DROP;
  const { path, mid } = routed
    ? routedThroughOffset([sourceX, sourceY], [targetX, targetY], offset)
    : bezierThroughOffset([sourceX, sourceY], [targetX, targetY], sourcePosition, targetPosition, offset);
  const [nodeName, fn] = id.split("::");
  const severity = useAgentStore((s) => worstSeverity(s.issues, nodeName, fn));
  const change = (data as { change?: string } | undefined)?.change;
  const ran = useCanvasPath()?.edges.includes(id) ?? false;
  const taken = useCallStore((s) => s.lastTransition?.from === nodeName && s.lastTransition.via === fn);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={[taken && "edge--taken", ran && "edge--run", change && `edge--${change}`].filter(Boolean).join(" ") || undefined}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-label nodrag nopan${selected ? " edge-label--selected" : ""}${severity ? ` edge-label--${severity}` : ""}${taken ? " edge-label--taken" : ""}${ran ? " edge-label--run" : ""}${change ? ` edge-label--${change}` : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
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
