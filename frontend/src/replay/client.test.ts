import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "../model";
import { streamReplay, type ReplayEvent } from "./client";

const agent = { name: "a", initial_node: "n", nodes: [{ name: "n" }] } as unknown as Agent;
const body = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s)));
      c.close();
    },
  });
const collect = async (it: AsyncIterable<ReplayEvent>) => {
  const out: ReplayEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
};

afterEach(() => vi.unstubAllGlobals());

describe("streamReplay", () => {
  it("posts base, proposal and run ids and parses the events across chunks", async () => {
    const result = { run_id: "r1", version: "after", transcript: [], path: [], outcome: "completed", goal_met: true, reason: "ok" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: body('event: started\ndata: {"run_id":"r1","version":"after"}\n\nevent: res', `ult\ndata: ${JSON.stringify(result)}\n\nevent: done\ndata: {}\n\n`),
    });
    vi.stubGlobal("fetch", fetchMock);
    const events = await collect(streamReplay("a b", agent, agent, ["r1"]));
    expect(events.map((e) => e.event)).toEqual(["started", "result", "done"]);
    expect(events[1]).toMatchObject({ outcome: "completed", goal_met: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/agents/a%20b/replay");
    expect(JSON.parse(init.body)).toEqual({ base: agent, proposal: agent, run_ids: ["r1"] });
  });

  it("omits the proposal when there is none", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body: body("event: done\ndata: {}\n\n") });
    vi.stubGlobal("fetch", fetchMock);
    await collect(streamReplay("a", agent, null, ["r1"]));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ base: agent, run_ids: ["r1"] });
  });

  it("turns transport problems into an error event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await collect(streamReplay("a", agent, agent, []))).toEqual([{ event: "error", message: "Could not reach the API. Is it running?", setup: false }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, body: null }));
    expect((await collect(streamReplay("a", agent, agent, [])))[0]).toMatchObject({ event: "error", message: "The replay request failed (400)." });
  });

  it("ends quietly when aborted", async () => {
    const ctl = new AbortController();
    ctl.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
    expect(await collect(streamReplay("a", agent, agent, [], ctl.signal))).toEqual([]);
  });
});
