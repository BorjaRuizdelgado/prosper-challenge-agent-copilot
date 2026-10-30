import type { Finding, Run, RunLine } from "../model";
import type { ReplayResult } from "./client";

/** How many working calls are replayed beside the cited ones, to show the fix did not break them. */
export const WORKING_CAP = 3;

/** A call that needs attention: the client flagged it, or it was abandoned or got stuck. */
export const needsAttention = (run: Run) => !!run.flag || run.outcome === "abandoned" || run.outcome === "stuck";

/** A call that worked: finished or transferred, and nobody flagged it. */
const worked = (run: Run) => (run.outcome === "completed" || run.outcome === "transferred") && !run.flag;

/**
 * Which runs to replay (design Decision 5). With findings: the cited runs (in the order cited, once each,
 * only those that exist), then up to 3 that worked, newest first. Without findings: the runs that need attention.
 */
export function selectRuns(findings: Finding[] | undefined, runs: Run[]): Run[] {
  const byId = new Map(runs.map((r) => [r.id, r]));
  if (!findings?.length) return runs.filter(needsAttention);
  const cited: Run[] = [];
  for (const id of findings.flatMap((f) => f.runs)) {
    const run = byId.get(id);
    if (run && !cited.includes(run)) cited.push(run);
  }
  const working = runs
    .filter((r) => worked(r) && !cited.includes(r))
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, WORKING_CAP);
  return [...cited, ...working];
}

/** What came of one replayed run. `pending` while a needed result is missing. */
export type ReplayClass = "fixed" | "unfixed" | "kept" | "broken" | "not_reproduced" | "pending";

export interface RunReplay {
  before?: ReplayResult;
  after?: ReplayResult;
  /** Lines heard so far while a version is still replaying; dropped when its result arrives. */
  live?: { before?: RunLine[]; after?: RunLine[] };
}

export interface ReplayScore {
  classes: Record<string, ReplayClass>;
  /** Failing calls whose failure reproduced on *before*, and how many of them *after* fixes. */
  fixed: number;
  failing: number;
  /** Working calls, and how many *after* still handles. */
  kept: number;
  working: number;
  broken: number;
  notReproduced: number;
}

/** A replay meets the goal when the judge says so and the call ended well. */
export const met = (r: ReplayResult) => r.goal_met && (r.outcome === "completed" || r.outcome === "transferred");

/**
 * Scores replayed runs (design Decision 5). A failing run is fixed when *after* meets the goal; if *before*
 * already met it, the failure did not reproduce and the run counts as neither fixed nor failing. A working run
 * is kept when *after* still meets the goal and broken when it does not.
 */
export function scoreReplay(runs: Run[], results: Record<string, RunReplay>): ReplayScore {
  const score: ReplayScore = { classes: {}, fixed: 0, failing: 0, kept: 0, working: 0, broken: 0, notReproduced: 0 };
  for (const run of runs) {
    const { before, after } = results[run.id] ?? {};
    let cls: ReplayClass = "pending";
    if (needsAttention(run)) {
      if (before && met(before)) cls = "not_reproduced";
      else if (after) cls = met(after) ? "fixed" : "unfixed";
    } else if (after) cls = met(after) ? "kept" : "broken";
    score.classes[run.id] = cls;
    if (cls === "fixed") score.fixed++;
    if (cls === "fixed" || cls === "unfixed") score.failing++;
    if (cls === "kept") score.kept++;
    if (cls === "kept" || cls === "broken") score.working++;
    if (cls === "broken") score.broken++;
    if (cls === "not_reproduced") score.notReproduced++;
  }
  return score;
}
