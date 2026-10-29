import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { type AgentSummary, listAgents } from "../api";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; agents: AgentSummary[] };

export function AgentList() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    listAgents().then(
      (agents) => setState({ status: "ready", agents }),
      (e: Error) => setState({ status: "error", message: e.message }),
    );
  }, []);

  useEffect(load, [load]);

  if (state.status === "loading") return <p className="agent-list__note">Loading agents…</p>;

  if (state.status === "error") {
    return (
      <div className="agent-list__note" role="alert">
        <p>{state.message}</p>
        <button type="button" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (state.agents.length === 0) return <p className="agent-list__note">No agents yet.</p>;

  return (
    <nav aria-label="Agent list">
      <ul className="agent-list">
        {state.agents.map((a) => (
          <li key={a.id}>
            <NavLink to={`/agents/${a.id}`} className="agent-list__item">
              <span>{a.name}</span>
              <span className="agent-list__meta">{a.node_count} nodes</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
