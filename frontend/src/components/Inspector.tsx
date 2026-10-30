import { type ReactNode, useMemo } from "react";
import { chatOf, useCopilotStore } from "../copilot/copilotStore";
import { toReviewFlow } from "../graph";
import { useAgentStore } from "../store";
import { EdgeForm } from "./EdgeForm";
import { IssuesPanel } from "./IssuesPanel";
import { NodeForm } from "./NodeForm";
import { SettingsForm } from "./SettingsForm";

/** With nothing selected, Build shows the agent itself: its checks and its settings. */
function AgentOverview() {
  const issues = useAgentStore((s) => s.issues);
  return (
    <div className="overview">
      <p className="panel__hint">Select a node or an edge on the canvas to edit it.</p>
      <section className="overview__section" aria-labelledby="overview-checks">
        <h2 id="overview-checks" className="panel__title">
          Checks <span className="panel__count">{issues.length}</span>
        </h2>
        <IssuesPanel />
      </section>
      <section className="overview__section" aria-labelledby="overview-settings">
        <h2 id="overview-settings" className="panel__title">Agent settings</h2>
        <SettingsForm />
      </section>
    </div>
  );
}

function Selected({ kind, name, children }: { kind: string; name: string; children: ReactNode }) {
  const select = useAgentStore((s) => s.select);
  return (
    <div className="selected">
      <header className="selected__head">
        <button type="button" className="ghost selected__back" onClick={() => select(null)} aria-label="Back to the agent">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="selected__kind">{kind}</span>
        <h2 className="panel__title selected__name mono">{name}</h2>
      </header>
      {children}
    </div>
  );
}

/** Edits whichever node or edge is selected; read-only while the canvas shows a copilot draft. */
export function Inspector() {
  const workingCopy = useAgentStore((s) => s.agent);
  const agentId = useAgentStore((s) => s.agentId);
  const selection = useAgentStore((s) => s.selection);
  const positions = useAgentStore((s) => s.positions);
  const review = useCopilotStore((s) => chatOf(s.chats, agentId).review);
  // The draft includes the items it removes, so those can be inspected too.
  const agent = useMemo(
    () => (review ? toReviewFlow(review.base, review.agent, positions).agent : workingCopy),
    [review, positions, workingCopy],
  );
  if (!agent) return null;
  if (!selection) return <AgentOverview />;

  const node = agent.nodes.find((n) => n.name === selection.node);
  if (!node) return <AgentOverview />;

  const readOnly = (form: ReactNode) =>
    review ? (
      <fieldset className="inspector--readonly" disabled>
        {form}
      </fieldset>
    ) : (
      form
    );

  if (selection.kind === "node") {
    return (
      <Selected kind="Node" name={node.name}>
        {readOnly(<NodeForm key={node.name} node={node} />)}
      </Selected>
    );
  }

  const edge = (node.edges ?? []).find((e) => e.function === selection.function);
  if (!edge) return <AgentOverview />;
  return (
    <Selected kind="Edge" name={edge.function}>
      {readOnly(<EdgeForm key={`${node.name}::${edge.function}`} node={node} edge={edge} />)}
    </Selected>
  );
}
