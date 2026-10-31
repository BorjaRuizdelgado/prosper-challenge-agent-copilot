import { useCopilotStore } from "../copilot/copilotStore";
import type { Finding } from "../model";
import { useRunsStore } from "../runs/runsStore";
import { useAgentStore } from "../store";

/** What the copilot found in the agent's production runs, one finding per cause; run ids open that run in the Runs tab. */
export function FindingsCard({ agentId, findings }: { agentId: string; findings: Finding[] }) {
  const setDockTab = useAgentStore((s) => s.setDockTab);
  const openRun = (runId: string) => {
    useRunsStore.getState().select(agentId, runId);
    setDockTab("runs");
  };
  const { setFocus } = useCopilotStore.getState();
  return (
    <section className="findings" aria-label="Findings">
      <h3 className="findings__title">{findings.length === 1 ? "1 finding" : `${findings.length} findings`}</h3>
      <ul>
        {findings.map((f, i) => (
          <li
            key={i}
            className="findings__item"
            onMouseEnter={f.node ? () => setFocus(agentId, f.node!) : undefined}
            onMouseLeave={f.node ? () => setFocus(agentId, null) : undefined}
          >
            <strong>{f.title}</strong>
            <p>
              <span className="findings__label">Cause</span> {f.cause}
            </p>
            <p>
              <span className="findings__label">Fix</span> {f.fix}
            </p>
            <p className="findings__runs">
              {f.runs.map((id) => (
                <button key={id} type="button" className="findings__run" onClick={() => openRun(id)}>
                  {id}
                </button>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
