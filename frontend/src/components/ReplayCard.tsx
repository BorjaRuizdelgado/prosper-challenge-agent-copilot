import { useEffect } from "react";
import { type Proposal, type ReplayState, useCopilotStore } from "../copilot/copilotStore";
import type { Run } from "../model";
import type { ReplayResult } from "../replay/client";
import { type ReplayClass, type ReplayScore, scoreReplay } from "../replay/select";
import { useReplayView } from "../replay/replayView";
import { useRunsStore } from "../runs/runsStore";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Fixed 5 of 6 failing calls · 3 of 3 working calls still work" (design Decision 5), or the progress while it runs. */
export function summarizeReplay(score: ReplayScore, replay: ReplayState): string {
  const finished = replay.ids.filter((id) => replay.runs[id]?.error || (replay.runs[id]?.before && replay.runs[id]?.after)).length;
  if (replay.status === "running") return `Replaying ${plural(replay.ids.length, "call")}… ${finished} of ${replay.ids.length} done`;
  const parts: string[] = [];
  if (score.failing) parts.push(`Fixed ${score.fixed} of ${plural(score.failing, "failing call")}`);
  if (score.working) parts.push(`${score.kept} of ${plural(score.working, "working call")} still work${score.working === 1 && score.kept === 1 ? "s" : ""}`);
  if (score.broken) parts.push(`${score.broken} broken`);
  if (score.notReproduced) parts.push(`${score.notReproduced} not reproduced`);
  return parts.join(" · ") || "No results";
}

const VERDICT: Record<ReplayClass, string> = {
  fixed: "Fixed",
  unfixed: "Not fixed",
  kept: "Still works",
  broken: "Broken",
  not_reproduced: "Not reproduced",
  pending: "Replaying…",
};

const outcomeOf = (r?: ReplayResult) => (r ? `${r.outcome}${r.goal_met ? "" : ", goal not met"}` : "…");

function Row({ agentId, index, id, run, cls, entry }: { agentId: string; index: number; id: string; run?: Run; cls: ReplayClass; entry: ReplayState["runs"][string] }) {
  const open = useReplayView((s) => s.row?.agentId === agentId && s.row.index === index && s.row.runId === id);
  const toggle = useReplayView((s) => s.toggleRow);
  const retry = useCopilotStore((s) => s.retryReplay);
  const failed = !!entry.error;
  const after = entry.after;
  return (
    <li className={`replay__item replay__item--${failed ? "error" : cls}`}>
      <button type="button" className="replay__row" aria-expanded={open} disabled={!after} onClick={() => toggle(agentId, index, id)}>
        <span className="replay__id">{id}</span>
        {run && <span className={`pill runs__outcome runs__outcome--${run.outcome}`}>{run.outcome}</span>}
        <span className="replay__verdict">{failed ? "Failed" : VERDICT[cls]}</span>
        <span className="replay__flow">{outcomeOf(entry.before)} → {outcomeOf(entry.after)}</span>
        {(after?.reason || entry.error) && <span className="replay__reason">{failed ? entry.error : after?.reason}</span>}
      </button>
      {failed && (
        <button type="button" className="replay__retry" onClick={() => void retry(agentId, index, id)}>
          Retry
        </button>
      )}
      {open && after && (
        <ol className="call__transcript replay__transcript" aria-label={`Transcript of ${id} after`}>
          {after.transcript.map((line, i) => (
            <li key={i} className="call__line">
              <span className="call__who">{line.speaker === "caller" ? "Caller" : "Agent"}</span>
              {line.text}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** Replays of the calls against a proposal: a summary, one row per call (open it for the transcript and the path on the canvas), Retry per row. */
export function ReplayCard({ agentId, index, proposal, replay }: { agentId: string; index: number; proposal: Proposal; replay?: ReplayState }) {
  const runsState = useRunsStore((s) => s.byAgent[agentId]);
  const replayCalls = useCopilotStore((s) => s.replayCalls);
  useEffect(() => {
    if (!useRunsStore.getState().byAgent[agentId]) void useRunsStore.getState().load(agentId);
  }, [agentId]);

  const allRuns = runsState?.runs ?? [];
  if (!replay) {
    if (proposal.status !== "pending" || allRuns.length === 0) return null;
    return (
      <section className="replay" aria-label="Replay">
        <button type="button" onClick={() => void replayCalls(agentId, index)}>Replay calls</button>
        <p className="replay__note">Simulated text calls</p>
      </section>
    );
  }

  const runs = replay.ids.map((id) => allRuns.find((r) => r.id === id)).filter((r): r is Run => !!r);
  const score = scoreReplay(runs, replay.runs);
  return (
    <section className="replay" aria-label="Replay">
      <p className="replay__summary" aria-live="polite">{replay.error ? "Replay did not run" : summarizeReplay(score, replay)}</p>
      <p className="replay__note">Simulated text calls</p>
      {replay.error && (
        <div role="alert" className="replay__error">
          <p>{replay.error.message}</p>
          {proposal.status === "pending" && <button type="button" onClick={() => void replayCalls(agentId, index)}>Retry</button>}
        </div>
      )}
      {/* After a setup error nothing ran, so the rows would only say "Replaying…". */}
      {!replay.error?.setup && (
      <ul className="replay__rows" aria-label="Replayed calls">
        {replay.ids.map((id) => (
          <Row key={id} agentId={agentId} index={index} id={id} run={allRuns.find((r) => r.id === id)} cls={score.classes[id] ?? "pending"} entry={replay.runs[id] ?? {}} />
        ))}
      </ul>
      )}
    </section>
  );
}
