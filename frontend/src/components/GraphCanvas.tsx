import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { toFlow } from "../graph";
import type { Agent, Position } from "../model";
import { NodeCard } from "./NodeCard";

const nodeTypes = { card: NodeCard };

export function GraphCanvas({ agent, positions }: { agent: Agent; positions: Record<string, Position> }) {
  const { nodes, edges } = useMemo(() => toFlow(agent, positions), [agent, positions]);
  return (
    <div className="canvas" data-testid="canvas">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="var(--control)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
