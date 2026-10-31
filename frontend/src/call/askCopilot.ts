import type { Run } from "../model";
import type { TranscriptEntry } from "./callStore";

/** Nodes the call went through, read back from the transition notes (`Started at x`, `Moved to y via z`). */
export function nodePath(transcript: TranscriptEntry[]): string[] {
  const path: string[] = [];
  for (const entry of transcript) {
    if (entry.kind !== "note") continue;
    const match = /^(?:Started at|Moved to) (\S+)/.exec(entry.text);
    if (match) path.push(match[1]);
  }
  return path;
}

/** What "Analyze runs" sends: the intent is fully known, so it goes without the user editing it. */
export const ANALYZE_RUNS_MESSAGE = "Review this agent's production runs. Tell me what went wrong and improve the agent.";

export const WENT_WRONG = "What went wrong: ";

/** The message "Ask Copilot" puts in the input: the transcript, the node path, and an open question for the user to finish. */
export function buildCallMessage(transcript: TranscriptEntry[]): string {
  const lines = transcript.filter((e) => e.kind !== "note").map((e) => `${e.kind === "user" ? "Caller" : "Agent"}: ${e.text}`);
  const path = nodePath(transcript);
  return ["Here is a test call with the agent.", "", "Transcript:", ...lines, ...(path.length ? ["", `Path: ${path.join(" -> ")}`] : []), "", WENT_WRONG].join(
    "\n",
  );
}

/** "Ask Copilot" on one run: its transcript, path, outcome and flag, then the open question. */
export function buildRunMessage(run: Run): string {
  const lines = run.transcript.map((l) => `${l.speaker === "caller" ? "Caller" : "Agent"}: ${l.text}`);
  return [
    `Here is a production call (${run.id}) with the agent.`,
    "",
    `Outcome: ${run.outcome}`,
    ...(run.flag ? [`Flag: ${run.flag}`] : []),
    "",
    "Transcript:",
    ...lines,
    ...(run.path.length ? ["", `Path: ${run.path.map((s) => s.node).join(" -> ")}`] : []),
    "",
    WENT_WRONG,
  ].join("\n");
}
