import type { Agent, RunLine, RunOutcome, RunStep } from "../model";
import { parseSse } from "../copilot/client";

export type ReplayVersion = "before" | "after";

/** What one replayed call came to. */
export interface ReplayResult {
  transcript: RunLine[];
  path: RunStep[];
  outcome: RunOutcome;
  goal_met: boolean;
  reason: string;
}

/** One server-sent event of a replay (backend/replay/README.md). */
export type ReplayEvent =
  | { event: "started"; run_id: string; version: ReplayVersion }
  | { event: "line"; run_id: string; version: ReplayVersion; speaker: RunLine["speaker"]; text: string }
  | ({ event: "result"; run_id: string; version: ReplayVersion } & ReplayResult)
  | { event: "error"; message: string; setup?: boolean; run_id?: string; version?: ReplayVersion }
  | { event: "done" };

const KNOWN = new Set(["started", "line", "result", "error", "done"]);

const failure = (message: string, setup = false): ReplayEvent => ({ event: "error", message, setup });

/**
 * Replays `runIds` against `base` (version before) and `proposal` (version after; with null only *before* runs), yielding events as they arrive. Transport
 * problems come back as an `error` event so callers have a single path; aborting `signal` ends the stream quietly.
 */
export async function* streamReplay(agentId: string, base: Agent, proposal: Agent | null, runIds: string[], signal?: AbortSignal): AsyncGenerator<ReplayEvent> {
  let res: Response;
  try {
    res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base, ...(proposal && { proposal }), run_ids: runIds }),
      signal,
    });
  } catch {
    if (signal?.aborted) return;
    yield failure("Could not reach the API. Is it running?");
    return;
  }
  if (!res.ok || !res.body) return void (yield failure(`The replay request failed (${res.status}).`));
  try {
    yield* parseSse<ReplayEvent>(res.body, KNOWN);
  } catch {
    if (!signal?.aborted) yield failure("The connection to the replay was lost.");
  }
}
