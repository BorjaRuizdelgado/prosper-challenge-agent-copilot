import { useState } from "react";
import { applyProposalToEditor, isProposalStale } from "../copilot/applyProposal";
import { type AgentDiff, diffAgents, type FieldChange } from "../copilot/diffAgents";
import { type Proposal, useCopilotStore } from "../copilot/copilotStore";
import { blockingIssues } from "../store";
import { ConfirmDialog } from "./ConfirmDialog";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "2 nodes added, 1 edge changed" for the card's headline. */
export function summarize(d: AgentDiff): string {
  const parts = [
    [d.addedNodes.length, "node", "added"],
    [d.removedNodes.length, "node", "removed"],
    [d.changedNodes.length, "node", "changed"],
    [d.addedEdges.length, "edge", "added"],
    [d.removedEdges.length, "edge", "removed"],
    [d.changedEdges.length, "edge", "changed"],
  ] as const;
  const text = parts.filter(([n]) => n > 0).map(([n, noun, what]) => `${plural(n, noun)} ${what}`);
  return text.length ? text.join(", ") : "No changes";
}

function Fields({ fields }: { fields: FieldChange[] }) {
  return (
    <ul className="proposal__fields">
      {fields.map((f) => (
        <li key={f.field}>
          <strong>{f.field}</strong>
          <p className="proposal__before" aria-label={`${f.field} before`}>{f.before || "(empty)"}</p>
          <p className="proposal__after" aria-label={`${f.field} after`}>{f.after || "(empty)"}</p>
        </li>
      ))}
    </ul>
  );
}

function Changes({ diff }: { diff: AgentDiff }) {
  return (
    <details className="proposal__changes">
      <summary>Changes</summary>
      <ul>
        {diff.addedNodes.map((n) => <li key={`+${n}`}>Added node <code>{n}</code></li>)}
        {diff.removedNodes.map((n) => <li key={`-${n}`}>Removed node <code>{n}</code></li>)}
        {diff.changedNodes.map((c) => (
          <li key={`~${c.name}`}>
            <details>
              <summary>Changed node <code>{c.name}</code></summary>
              <Fields fields={c.fields} />
            </details>
          </li>
        ))}
        {diff.addedEdges.map((id) => <li key={`+${id}`}>Added edge <code>{id}</code></li>)}
        {diff.removedEdges.map((id) => <li key={`-${id}`}>Removed edge <code>{id}</code></li>)}
        {diff.changedEdges.map((c) => (
          <li key={`~${c.id}`}>
            <details>
              <summary>Changed edge <code>{c.id}</code></summary>
              <Fields fields={c.fields} />
            </details>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** What the copilot proposed: counts, the issues left, a collapsed Changes list, Apply and Discard. */
export function ProposalCard({ agentId, index, proposal }: { agentId: string; index: number; proposal: Proposal }) {
  const [confirming, setConfirming] = useState(false);
  const setStatus = useCopilotStore((s) => s.setProposalStatus);
  const diff = diffAgents(proposal.base, proposal.agent);
  const blocking = blockingIssues(proposal.issues).length > 0;
  const pending = proposal.status === "pending";

  const apply = () => {
    setConfirming(false);
    applyProposalToEditor(proposal);
    setStatus(agentId, index, "applied");
  };

  return (
    <section className={`proposal proposal--${proposal.status}`} aria-label="Proposal">
      <p className="proposal__summary">{summarize(diff)}</p>
      {proposal.issues.length > 0 && (
        <ul className="proposal__issues" aria-label="Remaining issues">
          {proposal.issues.map((i, k) => (
            <li key={k} className={`proposal__issue proposal__issue--${i.severity}`}>
              {i.message}
            </li>
          ))}
        </ul>
      )}
      {blocking && pending && <p className="proposal__warn" role="note">The agent will not be callable until these errors are fixed.</p>}
      <Changes diff={diff} />
      {pending ? (
        <div className="proposal__actions">
          <button type="button" className="primary" onClick={() => (isProposalStale(proposal) ? setConfirming(true) : apply())}>
            Apply
          </button>
          <button type="button" onClick={() => setStatus(agentId, index, "discarded")}>
            Discard
          </button>
        </div>
      ) : (
        <p className="copilot__note">{proposal.status === "applied" ? "Applied." : "Discarded."}</p>
      )}
      {confirming && (
        <ConfirmDialog
          title="Replace your newer edits?"
          message="You edited the agent after this proposal was made. Applying it replaces those edits."
          confirmLabel="Apply anyway"
          onConfirm={apply}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
