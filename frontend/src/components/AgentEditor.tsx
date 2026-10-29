import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAgentStore } from "../store";
import { Dock } from "./Dock";
import { GraphCanvas } from "./GraphCanvas";

export function AgentEditor() {
  const { id } = useParams();
  const { status, error, agent, positions, load, reset } = useAgentStore();

  useEffect(() => {
    if (id) void load(id);
    return reset;
  }, [id, load, reset]);

  if (status === "error") {
    return (
      <div className="sheet__empty" role="alert">
        <p>{error}</p>
        <button onClick={() => id && void load(id)}>
          Retry
        </button>
      </div>
    );
  }
  if (status !== "ready" || !agent) return <p className="sheet__empty">Loading agent…</p>;

  return (
    <div className="editor">
      <header className="editor__bar">
        <h1 className="editor__title">{agent.name}</h1>
        <span className="editor__meta">{agent.nodes.length} nodes</span>
      </header>
      <div className="editor__body">
        <GraphCanvas agent={agent} positions={positions} />
        <Dock />
      </div>
    </div>
  );
}
