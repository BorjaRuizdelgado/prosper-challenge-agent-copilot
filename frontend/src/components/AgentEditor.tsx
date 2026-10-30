import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { clearCall } from "../call/callStore";
import { blockingIssues, useAgentStore } from "../store";
import { useValidation } from "../useValidation";
import { AgentMark, ProductMark } from "./AgentMark";
import { AgentSwitcher } from "./AgentSwitcher";
import { CopilotPanel } from "./CopilotPanel";
import { Dock, ModeTabs } from "./Dock";
import { GraphCanvas } from "./GraphCanvas";
import { JsonPanel } from "./JsonPanel";
import { ReviewBanner } from "./ReviewBanner";
import { SaveBar } from "./SaveBar";

/** "2 errors" / "1 warning" in the top bar; opens the agent's checks in Build. */
function IssuesButton() {
  const issues = useAgentStore((s) => s.issues);
  const select = useAgentStore((s) => s.select);
  const setDockTab = useAgentStore((s) => s.setDockTab);
  if (issues.length === 0) return null;
  const errors = blockingIssues(issues).length;
  const label = errors > 0 ? `${errors} ${errors === 1 ? "error" : "errors"}` : `${issues.length} ${issues.length === 1 ? "warning" : "warnings"}`;
  return (
    <button
      type="button"
      className={`ghost issues-button issues-button--${errors > 0 ? "error" : "warning"}`}
      onClick={() => {
        select(null);
        setDockTab("inspector");
      }}
    >
      <span className="issues-button__dot" aria-hidden />
      {label}
    </button>
  );
}

function CanvasTools() {
  const { addNode, autoLayout, canvasView, setCanvasView } = useAgentStore();
  return (
    <>
      <div className="canvas-tools canvas-tools--left" role="group" aria-label="Canvas view">
        <div className="segmented">
          <button type="button" aria-pressed={canvasView === "graph"} onClick={() => setCanvasView("graph")}>
            Graph
          </button>
          <button type="button" aria-pressed={canvasView === "json"} onClick={() => setCanvasView("json")}>
            JSON
          </button>
        </div>
      </div>
      {canvasView === "graph" && (
        <div className="canvas-tools canvas-tools--right">
          <button type="button" onClick={() => autoLayout()}>
            Auto layout
          </button>
          <button type="button" onClick={() => addNode()}>
            Add node
          </button>
        </div>
      )}
    </>
  );
}

export function AgentEditor() {
  const { id } = useParams();
  const { status, error, agent, positions, load, reset, copilotOpen, toggleCopilot, openCopilot, canvasView } = useAgentStore();

  useValidation();

  useEffect(() => {
    if (id) void load(id);
    return () => {
      reset();
      clearCall(); // a call (live or finished) never follows you to another agent
    };
  }, [id, load, reset]);

  // Cmd/Ctrl+K puts the cursor in the copilot from anywhere in the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCopilot();
        requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[aria-label='Message to the copilot']")?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCopilot]);

  const topbar = (
    <header className="topbar">
      <div className="topbar__left">
        <Link to="/" className="topbar__home" aria-label="All agents">
          <ProductMark />
        </Link>
        <span className="topbar__slash" aria-hidden>
          /
        </span>
        {agent && <AgentMark name={agent.name} size={24} />}
        {agent ? <h1 className="topbar__title">{agent.name}</h1> : <span className="topbar__title">Loading…</span>}
        <AgentSwitcher />
        {agent && (
          <span className="topbar__meta">
            {agent.nodes.length} {agent.nodes.length === 1 ? "node" : "nodes"}
          </span>
        )}
      </div>
      <ModeTabs />
      <div className="topbar__right">
        <IssuesButton />
        <button type="button" className="ghost copilot-toggle" aria-pressed={copilotOpen} onClick={toggleCopilot} title="Copilot (⌘K)">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          Copilot
        </button>
        <SaveBar />
      </div>
    </header>
  );

  if (status === "error") {
    return (
      <div className="editor">
        {topbar}
        <div className="editor__state" role="alert">
          <p>{error}</p>
          <button onClick={() => id && void load(id)}>Retry</button>
        </div>
      </div>
    );
  }
  if (status !== "ready" || !agent) {
    return (
      <div className="editor">
        {topbar}
        <p className="editor__state">Loading agent…</p>
      </div>
    );
  }

  return (
    <div className="editor">
      {topbar}
      <div className={`workspace${copilotOpen ? " workspace--copilot" : ""}`}>
        {copilotOpen && (
          <section className="panel copilot-panel" aria-label="Copilot">
            <CopilotPanel />
          </section>
        )}
        <section className="panel editor__canvas" aria-label="Canvas">
          <CanvasTools />
          {canvasView === "json" ? (
            <div className="editor__json">
              <JsonPanel />
            </div>
          ) : (
            <>
              <ReviewBanner />
              <GraphCanvas agent={agent} positions={positions} />
            </>
          )}
        </section>
        <Dock />
      </div>
    </div>
  );
}
