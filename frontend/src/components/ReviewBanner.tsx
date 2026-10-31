import { chatOf, useCopilotStore } from "../copilot/copilotStore";
import { useAgentStore } from "../store";
import { useProposalActions } from "./useProposalActions";

function ProposalActions({ agentId, index }: { agentId: string; index: number }) {
  const hide = useCopilotStore((s) => s.hideReview);
  const proposal = useCopilotStore((s) => {
    const m = chatOf(s.chats, agentId).messages[index];
    return m?.role === "assistant" ? m.proposal : undefined;
  });
  const { onApply, onDiscard, dialog } = useProposalActions(agentId, index, proposal!);
  return (
    <>
      <span>Proposal</span>
      <button type="button" className="primary" onClick={onApply}>
        Apply
      </button>
      <button type="button" onClick={onDiscard}>
        Discard
      </button>
      <button type="button" onClick={() => hide(agentId)}>
        Hide
      </button>
      {dialog}
    </>
  );
}

/** Sits over the canvas while it shows a copilot draft: "Copilot draft" while running, Apply / Discard / Hide after. */
export function ReviewBanner() {
  const agentId = useAgentStore((s) => s.agentId);
  const chat = useCopilotStore((s) => chatOf(s.chats, agentId));
  if (!agentId || !chat.review) return null;
  const index = chat.messages.length - 1;
  const last = chat.messages[index];
  const pending = !chat.running && last?.role === "assistant" && last.proposal?.status === "pending";
  return (
    <div className="review-banner" role="status" aria-label="Copilot review">
      {pending ? <ProposalActions agentId={agentId} index={index} /> : <span>Copilot draft…</span>}
    </div>
  );
}
