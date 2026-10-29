import { type ReactNode, useMemo } from "react";
import { chatOf, useCopilotStore } from "../copilot/copilotStore";
import { toReviewFlow } from "../graph";
import { useAgentStore } from "../store";
import { EdgeForm } from "./EdgeForm";
import { NodeForm } from "./NodeForm";

const NONE = <p className="dock__empty">Select a node or an edge to inspect it.</p>;

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
  if (!agent || !selection) return NONE;

  const node = agent.nodes.find((n) => n.name === selection.node);
  if (!node) return NONE;

  const readOnly = (form: ReactNode) =>
    review ? (
      <fieldset className="inspector--readonly" disabled>
        {form}
      </fieldset>
    ) : (
      form
    );

  if (selection.kind === "node") return readOnly(<NodeForm key={node.name} node={node} />);

  const edge = (node.edges ?? []).find((e) => e.function === selection.function);
  if (!edge) return NONE;
  return readOnly(<EdgeForm key={`${node.name}::${edge.function}`} node={node} edge={edge} />);
}
