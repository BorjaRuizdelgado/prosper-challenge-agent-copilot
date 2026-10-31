import { getBezierPath, Position } from "@xyflow/react";
import { expect, test } from "vitest";
import { bezierThroughOffset } from "./LabelEdge";

const S: [number, number] = [100, 50];
const T: [number, number] = [500, 200];

test("without an offset it matches React Flow's default bezier and label spot", () => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX: S[0],
    sourceY: S[1],
    targetX: T[0],
    targetY: T[1],
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  });
  const { path: mine, mid } = bezierThroughOffset(S, T, Position.Right, Position.Left, { x: 0, y: 0 });

  expect(mid.x).toBeCloseTo(labelX);
  expect(mid.y).toBeCloseTo(labelY);
  expect(mine.replace(/[ ,]/g, "|")).toBe(path.replace(/[ ,]/g, "|"));
});

test("the curve's midpoint lands exactly on the dragged label", () => {
  const base = bezierThroughOffset(S, T, Position.Right, Position.Left, { x: 0, y: 0 }).mid;
  const { path, mid } = bezierThroughOffset(S, T, Position.Right, Position.Left, { x: 30, y: -80 });
  expect(mid).toEqual({ x: base.x + 30, y: base.y - 80 });

  const [c1x, c1y, c2x, c2y] = path
    .match(/-?\d+(\.\d+)?/g)!
    .slice(2, 6)
    .map(Number);
  expect((S[0] + 3 * c1x + 3 * c2x + T[0]) / 8).toBeCloseTo(mid.x);
  expect((S[1] + 3 * c1y + 3 * c2y + T[1]) / 8).toBeCloseTo(mid.y);
});
