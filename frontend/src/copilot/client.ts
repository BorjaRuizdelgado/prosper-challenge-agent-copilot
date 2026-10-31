import type { Agent, ClientQuestion, Finding, Issue, Requirement } from "../model";

/** One server-sent event of a copilot turn (design Decision 6). */
export type CopilotEvent =
  | { event: "step"; label: string; node?: string }
  | { event: "text"; delta: string }
  | { event: "findings"; findings: Finding[] }
  | { event: "coverage"; requirements: Requirement[]; questions: ClientQuestion[] }
  | { event: "draft"; agent: Agent }
  | { event: "proposal"; agent: Agent; issues: Issue[]; incomplete?: boolean }
  | { event: "done" }
  | { event: "error"; message: string; setup?: boolean };

const KNOWN = new Set(["step", "text", "findings", "coverage", "draft", "proposal", "done", "error"]);

/** Splits an SSE byte stream into typed events; a block may arrive split across any number of chunks. */
export async function* parseSse<T = CopilotEvent>(body: ReadableStream<Uint8Array>, known: ReadonlySet<string> = KNOWN): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (block: string): T | null => {
    let name = "";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!known.has(name)) return null;
    try {
      return { event: name, ...(data.length ? JSON.parse(data.join("\n")) : {}) } as T;
    } catch {
      return null;
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const event = parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (event) yield event;
      }
      if (done) break;
    }
    const rest = buffer.trim() ? parse(buffer) : null;
    if (rest) yield rest;
  } finally {
    reader.releaseLock();
  }
}

const failure = (message: string): CopilotEvent => ({ event: "error", message });

/**
 * Sends one instruction and yields the turn's events as they arrive. Transport problems (API down,
 * a turn already running) come back as an `error` event so callers have a single path.
 * Aborting `signal` ends the stream quietly; the server sees the disconnect and stops the turn.
 */
export async function* streamCopilot(
  agentId: string,
  message: string,
  agent: Agent,
  signal?: AbortSignal,
): AsyncGenerator<CopilotEvent> {
  let res: Response;
  try {
    res = await fetch(`/api/copilot/${encodeURIComponent(agentId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, agent }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) return;
    yield failure("Could not reach the API. Is it running?");
    return;
  }
  if (res.status === 409) return void (yield failure("The copilot is already working on this agent."));
  if (!res.ok || !res.body) return void (yield failure(`The copilot request failed (${res.status}).`));
  try {
    yield* parseSse(res.body);
  } catch (e) {
    if (!signal?.aborted) yield failure("The connection to the copilot was lost.");
  }
}

/** Forgets the conversation for this agent. */
export async function resetCopilot(agentId: string): Promise<void> {
  const res = await fetch(`/api/copilot/${encodeURIComponent(agentId)}/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`Could not start a new chat (${res.status})`);
}
