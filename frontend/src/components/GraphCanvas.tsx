import { Background, ConnectionMode, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useStore } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "react";
import { connect, deleteEdges, reconnect } from "../canvasActions";
import { toFlow } from "../graph";
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

export function GraphCanvas({ agent, positions }: { agent: Agent; positions: Record<string, Position> }) {
  const selection = useAgentStore((s) => s.selection);
  const select = useAgentStore((s) => s.select);
  const layoutRun = useAgentStore((s) => s.layoutRun);
  const moveNode = useAgentStore((s) => s.moveNode);
  const { nodes, edges } = useMemo(() => toFlow(agent, positions, selection), [agent, positions, selection]);
  return (
    <div className="canvas" data-testid="canvas">
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
          nodesDraggable
          onNodeDrag={(_, n) => moveNode(n.id, n.position)}
          nodesConnectable
          connectionMode={ConnectionMode.Loose}
          edgesReconnectable
          onConnect={(c) => connect(c)}
          onReconnect={(old, c) => reconnect(old, c)}
          deleteKeyCode={["Backspace", "Delete"]}
          // Only edges are deletable from the keyboard; nodes go through the confirmed delete flow.
          onBeforeDelete={async ({ edges }) => ({ nodes: [], edges })}
          onEdgesDelete={deleteEdges}
          minZoom={0.2}
        >
          <FitOnResize />
          <Background gap={20} color="var(--control)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
