import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAgentStore } from "../store";
import { useValidation } from "../useValidation";
import { Dock } from "./Dock";
import { GraphCanvas } from "./GraphCanvas";
import { ReviewBanner } from "./ReviewBanner";
import { SaveBar } from "./SaveBar";

export function AgentEditor() {
  const { id } = useParams();
  const { status, error, agent, positions, load, reset, addNode, autoLayout } = useAgentStore();

  useValidation();

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
        <div className="editor__tools">
          <button type="button" onClick={() => addNode()}>
            Add node
          </button>
          <button type="button" onClick={() => autoLayout()}>
            Auto layout
          </button>
        </div>
        <SaveBar />
      </header>
      <div className="editor__body">
        <div className="editor__canvas">
          <ReviewBanner />
          <GraphCanvas agent={agent} positions={positions} />
        </div>
        <Dock />
      </div>
    </div>
  );
}
