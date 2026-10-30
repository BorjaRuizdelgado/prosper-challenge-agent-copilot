import { useEffect, useState } from "react";
import { getGuidelines, listSampleGuidelines } from "../api";
import { CHECK_COVERAGE, chatOf, useCopilotStore } from "../copilot/copilotStore";
import type { Coverage, Requirement, RequirementStatus } from "../model";
import { useAgentStore } from "../store";
import { useToast } from "./Toasts";

const GROUPS: { status: RequirementStatus; title: string }[] = [
  { status: "covered", title: "Covered" },
  { status: "default", title: "Covered with a default" },
  { status: "open", title: "Open" },
];

/** "Covers 14 of 16 requirements"; covered and default both count as handled. */
export function coverageLine(requirements: Requirement[], questionCount: number): string {
  const handled = requirements.filter((r) => r.status !== "open").length;
  const line = `Covers ${handled} of ${requirements.length} requirement${requirements.length === 1 ? "" : "s"}`;
  return questionCount ? `${line} · ${questionCount} question${questionCount === 1 ? "" : "s"} for the client` : line;
}

/** The questions as a short message to the client: numbered, each with the default now in place. */
export function questionsEmail(agentName: string, questions: Coverage["questions"]): string {
  const items = questions.map((q, i) => `${i + 1}. ${q.question}\n   For now the agent will: ${q.default}`).join("\n\n");
  return [
    "Hello,",
    "",
    `We have set up the phone agent${agentName ? ` "${agentName}"` : ""} from your guidelines. A few points were not covered, so we used a safe default for each. Could you confirm or correct them?`,
    "",
    items,
    "",
    "Thank you,",
  ].join("\n");
}

/** How the agent covers the client's guidelines: requirements by status with their nodes, and the questions for the client. */
export function CoverageCard({ agentId, coverage }: { agentId: string; coverage: Coverage }) {
  const { requirements, questions } = coverage;
  const agent = useAgentStore((s) => s.agent);
  const select = useAgentStore((s) => s.select);
  const setDockTab = useAgentStore((s) => s.setDockTab);
  const running = useCopilotStore((s) => chatOf(s.chats, agentId).running);
  const toast = useToast();
  const { setFocus, send, setPrefill } = useCopilotStore.getState();
  const [reply, setReply] = useState<string | null>(null);

  // The sample client reply is offered only when this agent's guidelines are one of the samples.
  useEffect(() => {
    if (!questions.length) return;
    let live = true;
    Promise.all([getGuidelines(agentId), listSampleGuidelines()]).then(
      ([text, samples]) => {
        const match = text === null ? undefined : samples.find((s) => s.text === text);
        if (live) setReply(match?.reply ?? null);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [agentId, questions.length]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(questionsEmail(agent?.name ?? "", questions));
      toast("Questions copied. Paste them into an email to the client.");
    } catch {
      toast("Could not copy to the clipboard.");
    }
  };
  const openNode = (node: string) => {
    select({ kind: "node", node });
    setDockTab("inspector");
  };

  return (
    <section className="coverage" aria-label="Coverage">
      <h3 className="coverage__title">{coverageLine(requirements, questions.length)}</h3>
      {GROUPS.map(({ status, title }) => {
        const rows = requirements.filter((r) => r.status === status);
        if (!rows.length) return null;
        return (
          <div key={status} className="coverage__group">
            <h4 className={`coverage__status coverage__status--${status}`}>{title} ({rows.length})</h4>
            <ul>
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="coverage__req"
                  title={r.quote || undefined}
                  onMouseEnter={() => r.nodes[0] && setFocus(agentId, r.nodes[0])}
                  onMouseLeave={() => setFocus(agentId, null)}
                >
                  <span>{r.text}</span>
                  {r.note && <span className="coverage__note">{r.note}</span>}
                  {r.nodes.length > 0 && (
                    <span className="coverage__nodes">
                      {r.nodes.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="coverage__node"
                          onMouseEnter={() => setFocus(agentId, n)}
                          onFocus={() => setFocus(agentId, n)}
                          onBlur={() => setFocus(agentId, null)}
                          onClick={() => openNode(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {questions.length > 0 && (
        <div className="coverage__group">
          <h4 className="coverage__status">Questions for the client</h4>
          <ol className="coverage__questions">
            {questions.map((q) => (
              <li key={q.id}>
                {q.question}
                <span className="coverage__default">Default: {q.default}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="coverage__actions">
        {questions.length > 0 && (
          <button type="button" onClick={copy}>
            Copy as email
          </button>
        )}
        {reply && (
          <button type="button" className="ghost" onClick={() => setPrefill(reply)}>
            Use sample client reply
          </button>
        )}
        <button type="button" className="ghost" disabled={running || !agent} onClick={() => agent && send(agentId, CHECK_COVERAGE, agent)}>
          Re-check coverage
        </button>
      </div>
    </section>
  );
}
