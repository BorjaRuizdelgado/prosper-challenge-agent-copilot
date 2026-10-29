import { Background, ConnectionMode, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useStore } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "react";
import { connect, deleteEdges, reconnect } from "../canvasActions";
import { chatOf, useCopilotStore } from "../copilot/copilotStore";
import { toFlow, toReviewFlow } from "../graph";
import { useAgentStore } from "../store";
import type { Agent, Position } from "../model";
import { LabelEdge } from "./LabelEdge";
import { NodeCard } from "./NodeCard";

const nodeTypes = { card: NodeCard };
const edgeTypes = { labelled: LabelEdge };
const FIT = { padding: 0.2, maxZoom: 1 };

/** Refits the graph when the canvas changes size (window resize), so no node ends up behind the dock. */
function FitOnResize() {
  const { fitView } = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const sized = useRef(false);
  useEffect(() => {
    if (!width || !height) return;
    // The first real size is handled by the `fitView` prop; only later changes need a refit.
    if (!sized.current) {
      sized.current = true;
      return;
    }
    void fitView(FIT);
  }, [width, height, fitView]);
  return null;
}

/** Refits the view when the graph gains or loses nodes (a copilot draft, Apply, Add node), so new ones are never off screen. */
function FitOnDraftChange({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  const seen = useRef(count);
  useEffect(() => {
    if (seen.current === count) return;
    seen.current = count;
    void fitView(FIT);
  }, [count, fitView]);
  return null;
}

export function GraphCanvas({ agent, positions }: { agent: Agent; positions: Record<string, Position> }) {
  const selection = useAgentStore((s) => s.selection);
  const select = useAgentStore((s) => s.select);
  const layoutRun = useAgentStore((s) => s.layoutRun);
  const moveNode = useAgentStore((s) => s.moveNode);
  const agentId = useAgentStore((s) => s.agentId);
  const review = useCopilotStore((s) => chatOf(s.chats, agentId).review);
  const { nodes, edges } = useMemo(
    () => (review ? toReviewFlow(review.base, review.agent, positions, selection) : toFlow(agent, positions, selection)),
    [agent, positions, selection, review],
  );
  const readOnly = review !== null;
  return (
    <div className={`canvas${readOnly ? " canvas--review" : ""}`} data-testid="canvas">
      <ReactFlowProvider>
        <ReactFlow
          key={layoutRun}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={FIT}
          onNodeClick={(_, n) => select({ kind: "node", node: n.id })}
          onEdgeClick={(_, e) => select({ kind: "edge", node: e.source, function: e.sourceHandle! })}
          onPaneClick={() => select(null)}
          nodesDraggable={!readOnly}
          onNodeDrag={(_, n) => moveNode(n.id, n.position)}
          nodesConnectable={!readOnly}
          connectionMode={ConnectionMode.Loose}
          edgesReconnectable={!readOnly}
          onConnect={(c) => connect(c)}
          onReconnect={(old, c) => reconnect(old, c)}
          deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
          // Only edges are deletable from the keyboard; nodes go through the confirmed delete flow.
          onBeforeDelete={async ({ edges }) => ({ nodes: [], edges })}
          onEdgesDelete={deleteEdges}
          minZoom={0.2}
        >
          <FitOnResize />
          <FitOnDraftChange count={nodes.length} />
          <Background gap={20} color="var(--control)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
