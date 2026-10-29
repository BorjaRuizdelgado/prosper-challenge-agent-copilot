import { Background, Controls, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { toFlow } from "../graph";
import { useAgentStore } from "../store";
import type { Agent, Position } from "../model";
import { NodeCard } from "./NodeCard";

const nodeTypes = { card: NodeCard };

export function GraphCanvas({ agent, positions }: { agent: Agent; positions: Record<string, Position> }) {
  const selection = useAgentStore((s) => s.selection);
  const select = useAgentStore((s) => s.select);
  const { nodes, edges } = useMemo(() => toFlow(agent, positions, selection), [agent, positions, selection]);
  return (
    <div className="canvas" data-testid="canvas">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          onNodeClick={(_, n) => select({ kind: "node", node: n.id })}
          onEdgeClick={(_, e) => select({ kind: "edge", node: e.source, function: e.sourceHandle! })}
          onPaneClick={() => select(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="var(--control)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
