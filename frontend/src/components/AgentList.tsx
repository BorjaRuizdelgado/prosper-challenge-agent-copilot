import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AgentMark } from "./AgentMark";
import { useAgents } from "../agents";
import type { AgentSummary } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { GuidelinesDialog } from "./GuidelinesDialog";
import { NameDialog } from "./NameDialog";

type Dialog =
  | { kind: "create" }
  | { kind: "guidelines" }
  | { kind: "rename"; agent: AgentSummary }
  | { kind: "delete"; agent: AgentSummary };

const updated = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString([], { month: "short", day: "numeric" });
};

/** Every agent with its actions: the home page's list ("page") or the editor's switcher menu ("menu"). */
export function AgentList({ variant = "page", onNavigate }: { variant?: "page" | "menu"; onNavigate?: () => void }) {
  const { state, reload, create, rename, duplicate, remove, createFromGuidelines } = useAgents();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);

  const newButton = (
    <div className="agent-list__new-row">
      <button type="button" className={`${variant === "page" ? "primary" : "ghost"} agent-list__new`} onClick={() => setDialog({ kind: "create" })}>
        New agent
      </button>
      <button type="button" className="ghost agent-list__new" onClick={() => setDialog({ kind: "guidelines" })}>
        New from guidelines
      </button>
    </div>
  );

  let body;
  if (state.status === "loading") {
    body = <p className="agent-list__note">Loading agents…</p>;
  } else if (state.status === "error") {
    body = (
      <div className="agent-list__note" role="alert">
        <p>{state.message}</p>
        <button type="button" onClick={reload}>
          Retry
        </button>
      </div>
    );
  } else if (state.agents.length === 0) {
    body = <p className="agent-list__note">No agents yet. Create one to get started.</p>;
  } else {
    body = (
      <nav aria-label="Agent list">
        <ul className="agent-list">
          {state.agents.map((a) => (
            <li key={a.id} className="agent-list__row">
              <NavLink to={`/agents/${a.id}`} className="agent-list__item" onClick={onNavigate}>
                <AgentMark name={a.name} />
                <span className="agent-list__name">{a.name}</span>
                <span className="agent-list__meta">
                  {a.node_count} {a.node_count === 1 ? "node" : "nodes"}
                  {variant === "page" && updated(a.updated_at) && <span className="agent-list__date"> · Updated {updated(a.updated_at)}</span>}
                </span>
              </NavLink>
              <span className="agent-list__actions">
                <button type="button" className="ghost" aria-label={`Rename ${a.name}`} onClick={() => setDialog({ kind: "rename", agent: a })}>
                  Rename
                </button>
                <button type="button" className="ghost" aria-label={`Duplicate ${a.name}`} onClick={() => duplicate(a.id)}>
                  Copy
                </button>
                <button type="button" className="ghost agent-list__delete" aria-label={`Delete ${a.name}`} onClick={() => setDialog({ kind: "delete", agent: a })}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <div className={`agents agents--${variant}`}>
      {newButton}
      {body}
      {dialog?.kind === "create" && (
        <NameDialog
          title="New agent"
          submitLabel="Create"
          onClose={close}
          onSubmit={(name) => {
            close();
            create(name);
          }}
        />
      )}
      {dialog?.kind === "guidelines" && (
        <GuidelinesDialog
          onClose={close}
          onSubmit={(name, guidelines, source) => {
            close();
            onNavigate?.();
            void createFromGuidelines(name, guidelines, source);
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog
          title="Rename agent"
          submitLabel="Rename"
          initialName={dialog.agent.name}
          onClose={close}
          onSubmit={(name) => {
            close();
            rename(dialog.agent.id, name);
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Delete agent"
          message={`Delete "${dialog.agent.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onClose={close}
          onConfirm={() => {
            close();
            remove(dialog.agent.id);
          }}
        />
      )}
    </div>
  );
}
