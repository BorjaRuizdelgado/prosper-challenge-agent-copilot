import { useEffect, useRef } from "react";
import { type Proposal, type ReplayState, useCopilotStore } from "../copilot/copilotStore";
import type { Finding, Run } from "../model";
import type { ReplayResult } from "../replay/client";
import { type ReplayClass, type ReplayScore, scoreReplay, selectRuns } from "../replay/select";
import { useReplayView } from "../replay/replayView";
import { useRunsStore } from "../runs/runsStore";

const NOTE = "Simulated text calls: a simulated caller replays each call on your current agent (before) and on this fix (after), to see whether the failing calls get fixed and the working ones keep working.";

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
  const lines = after?.transcript ?? entry.live?.after;
  return (
    <li className={`replay__item replay__item--${failed ? "error" : cls}`}>
      <button type="button" className="replay__row" aria-expanded={open} disabled={!lines} onClick={() => toggle(agentId, index, id)}>
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
      {open && lines && (
        <ol className="call__transcript replay__transcript" aria-label={`Transcript of ${id} after`}>
          {lines.map((line, i) => (
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
export function ReplayCard({ agentId, index, proposal, findings, replay }: { agentId: string; index: number; proposal: Proposal; findings?: Finding[]; replay?: ReplayState }) {
  const runsState = useRunsStore((s) => s.byAgent[agentId]);
  const replayCalls = useCopilotStore((s) => s.replayCalls);
  const asked = useCopilotStore((s) => s.replayAsk?.agentId === agentId && s.replayAsk.index === index);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!asked) return;
    button.current?.scrollIntoView?.({ block: "nearest" });
    button.current?.focus();
  }, [asked]);
  useEffect(() => {
    if (!useRunsStore.getState().byAgent[agentId]) void useRunsStore.getState().load(agentId);
  }, [agentId]);

  const allRuns = runsState?.runs ?? [];
  if (!replay) {
    const count = selectRuns(findings, allRuns).length;
    if (proposal.status !== "pending" || count === 0) return null;
    return (
      <section className={`replay${asked ? " replay--asked" : ""}`} aria-label="Replay">
        <p className="replay__summary">Check this fix against {plural(count, "real call")}?</p>
        <p className="replay__note">{NOTE} That is {count * 2} simulated calls, which use your OpenAI key and cost money, so nothing runs until you ask.</p>
        <button ref={button} type="button" onClick={() => void replayCalls(agentId, index)}>Replay {plural(count, "call")}</button>
      </section>
    );
  }

  const runs = replay.ids.map((id) => allRuns.find((r) => r.id === id)).filter((r): r is Run => !!r);
  const score = scoreReplay(runs, replay.runs);
  return (
    <section className="replay" aria-label="Replay">
      <p className="replay__summary" aria-live="polite">{replay.error ? "Replay did not run" : summarizeReplay(score, replay)}</p>
      <p className="replay__note">{NOTE}</p>
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
