import { useEffect } from "react";
import { ANALYZE_RUNS_MESSAGE, buildRunMessage } from "../call/askCopilot";
import { describeTransition } from "../call/callStore";
import { chatOf, useCopilotStore } from "../copilot/copilotStore";
import type { Run, RunOutcome, RunStep } from "../model";
import { useReplayView } from "../replay/replayView";
import { runPath, useRunsStore } from "../runs/runsStore";
import { useAgentStore } from "../store";

const OUTCOMES: RunOutcome[] = ["completed", "transferred", "abandoned", "stuck"];
/** Outcomes that need a look; their counts turn red when above zero. */
const BAD: RunOutcome[] = ["abandoned", "stuck"];

const duration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s` : `${s}s`);
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const firstCallerLine = (run: Run) => run.transcript.find((l) => l.speaker === "caller")?.text ?? "";

/** The path as the call tab's notes would phrase it: `Started at x`, `Moved to y via z`. */
const notes = (path: RunStep[]) =>
  path.map((step, i) =>
    describeTransition({ from: i ? path[i - 1].node : null, node: step.node, via: step.via ?? null, args: step.args ?? {} }),
  );

/** Replays the open run once against the working copy (saved or not) and shows how it went. */
function ReplayThisCall({ run, agentId }: { run: Run; agentId: string }) {
  const agent = useAgentStore((s) => s.agent);
  const drafting = useCopilotStore((s) => chatOf(s.chats, agentId).review !== null);
  const working = useReplayView((s) => (s.working?.runId === run.id && s.working.agentId === agentId ? s.working : null));
  const running = working?.status === "running";
  const result = working?.result;
  return (
    <section className="runs__replay" aria-label="Replay this call">
      <div className="runs__replay-actions">
        <button type="button" disabled={drafting || running || !agent} onClick={() => agent && void useReplayView.getState().replayWorking(agentId, agent, run.id)}>
          {running ? "Replaying…" : "Replay this call"}
        </button>
        <span className="replay__note">Simulated text call, against the working copy</span>
      </div>
      {drafting && <p className="field__hint">Apply or discard the copilot's draft first.</p>}
      {working?.error && <p className="call__message" role="alert">{working.error.message}</p>}
      {result && (
        <div className="runs__replay-result">
          <p className="replay__summary">
            <span className={`pill runs__outcome runs__outcome--${result.outcome}`}>{result.outcome}</span>{" "}
            {result.goal_met ? "Goal met" : "Goal not met"}
          </p>
          {run.goal && <p className="replay__reason">Goal: {run.goal}</p>}
          <p className="replay__reason">{result.reason}</p>
          <ol className="call__transcript" aria-label="Replay transcript">
            {result.transcript.map((line, i) => (
              <li key={i} className="call__line">
                <span className="call__who">{line.speaker === "caller" ? "Caller" : "Agent"}</span>
                {line.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function RunDetail({ run, agentId }: { run: Run; agentId: string }) {
  const agent = useAgentStore((s) => s.agent);
  const openCopilot = useAgentStore((s) => s.openCopilot);
  const ask = () => {
    useCopilotStore.getState().setPrefill(buildRunMessage(run));
    openCopilot();
  };
  const { missing } = agent ? runPath(run, agent) : { missing: [] as string[] };
  return (
    <div className="runs__detail">
      <ol className="call__transcript" aria-label="Transcript">
        {run.transcript.map((line, i) => (
          <li key={i} className="call__line">
            <span className="call__who">{line.speaker === "caller" ? "Caller" : "Agent"}</span>
            {line.text}
          </li>
        ))}
      </ol>
      <ol className="runs__notes" aria-label="Transitions">
        {notes(run.path).map((text, i) => (
          <li key={i} className="call__line call__line--note">
            {text}
          </li>
        ))}
      </ol>
      <p className="runs__path" aria-label="Path">
        {run.path.map((s, i) => (
          <span key={i}>
            {i > 0 && " -> "}
            {missing.includes(s.node) ? <span className="runs__missing" title="This node no longer exists">{s.node} (missing)</span> : s.node}
          </span>
        ))}
      </p>
      <button type="button" onClick={ask}>Ask Copilot</button>
      <ReplayThisCall run={run} agentId={agentId} />
    </div>
  );
}

/** Opens the Copilot tab and sends the review request with the working copy; unavailable while a turn runs. */
function AnalyzeRuns({ agentId }: { agentId: string }) {
  const agent = useAgentStore((s) => s.agent);
  const openCopilot = useAgentStore((s) => s.openCopilot);
  const busy = useCopilotStore((s) => chatOf(s.chats, agentId).running);
  const analyze = () => {
    if (!agent) return;
    openCopilot();
    void useCopilotStore.getState().send(agentId, ANALYZE_RUNS_MESSAGE, agent);
  };
  return (
    <div className="runs__analyze">
      <button type="button" className="primary" disabled={busy || !agent} onClick={analyze}>
        Analyze runs
      </button>
      {busy && <span className="field__hint">The copilot is busy.</span>}
    </div>
  );
}

/** Production runs of the open agent: a summary, the list, and one run opened at a time (also drawn on the canvas). */
export function RunsPanel() {
  const agentId = useAgentStore((s) => s.agentId);
  const state = useRunsStore((s) => (agentId ? s.byAgent[agentId] : undefined));
  const selected = useRunsStore((s) => s.selected);
  const { load, select, clear } = useRunsStore.getState();

  useEffect(() => {
    if (agentId && !useRunsStore.getState().byAgent[agentId]) void load(agentId);
  }, [agentId, load]);

  if (!agentId || !state || state.status === "loading") return <p className="field__hint">Loading runs…</p>;
  if (state.status === "error") {
    return (
      <div className="runs">
        <p className="call__message" role="alert">{state.error}</p>
        <button type="button" onClick={() => void load(agentId)}>Retry</button>
      </div>
    );
  }
  const runs = state.runs;
  if (runs.length === 0) return <p className="field__hint">This agent has no production runs.</p>;

  const open = selected?.agentId === agentId ? selected.runId : null;
  return (
    <div className="runs">
      <dl className="runs__summary" data-testid="runs-summary">
        {[
          ["Runs", runs.length, false],
          ...OUTCOMES.map((o) => [o[0].toUpperCase() + o.slice(1), runs.filter((r) => r.outcome === o).length, BAD.includes(o)] as const),
          ["Flagged", runs.filter((r) => r.flag).length, true],
        ].map(([label, count, bad]) => (
          <div key={label as string} className={`runs__stat${bad && count ? " runs__stat--bad" : ""}${count ? "" : " runs__stat--zero"}`}>
            <dt>{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
      <AnalyzeRuns agentId={agentId} />
      <ul className="runs__list" aria-label="Runs">
        {runs.map((run) => (
          <li key={run.id} className="runs__item">
            <button
              type="button"
              className="runs__row"
              aria-expanded={open === run.id}
              onClick={() => (open === run.id ? clear() : select(agentId, run.id))}
            >
              <span className={`pill runs__outcome runs__outcome--${run.outcome}`}>{run.outcome}</span>
              <span className="runs__meta">{when(run.started_at)} · {duration(run.duration_s)}</span>
              <span className="runs__first">{firstCallerLine(run)}</span>
              {run.flag && <span className="runs__flag">Flagged: {run.flag}</span>}
            </button>
            {open === run.id && <RunDetail run={run} agentId={agentId} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
