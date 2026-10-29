import { useState } from "react";
import { applyProposalToEditor, isProposalStale } from "../copilot/applyProposal";
import { type Proposal, useCopilotStore } from "../copilot/copilotStore";
import { ConfirmDialog } from "./ConfirmDialog";

/** Apply and Discard for one proposal, shared by its card and the canvas banner; Apply confirms when stale. */
export function useProposalActions(agentId: string, index: number, proposal: Proposal) {
  const [confirming, setConfirming] = useState(false);
  const setStatus = useCopilotStore((s) => s.setProposalStatus);

  const apply = () => {
    setConfirming(false);
    applyProposalToEditor(proposal);
    setStatus(agentId, index, "applied");
  };
  return {
    onApply: () => (isProposalStale(proposal) ? setConfirming(true) : apply()),
    onDiscard: () => setStatus(agentId, index, "discarded"),
    dialog: confirming ? (
      <ConfirmDialog
        title="Replace your newer edits?"
        message="You edited the agent after this proposal was made. Applying it replaces those edits."
        confirmLabel="Apply anyway"
        onConfirm={apply}
        onClose={() => setConfirming(false)}
      />
    ) : null,
  };
}
