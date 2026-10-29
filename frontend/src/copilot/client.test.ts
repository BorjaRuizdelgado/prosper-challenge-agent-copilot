import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "../model";
import { parseSse, resetCopilot, streamCopilot, type CopilotEvent } from "./client";

const agent = { name: "a", initial_node: "n", nodes: [{ name: "n" }] } as unknown as Agent;

/** A body whose chunks arrive exactly as given, so tests can split events anywhere. */
const body = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s)));
      c.close();
    },
  });

const collect = async (it: AsyncIterable<CopilotEvent>) => {
  const out: CopilotEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
};

afterEach(() => vi.unstubAllGlobals());

describe("parseSse", () => {
  it("parses whole events", async () => {
    const events = await collect(
      parseSse(body('event: step\ndata: {"label":"Reading agent"}\n\nevent: done\ndata: {}\n\n')),
    );
    expect(events).toEqual([{ event: "step", label: "Reading agent" }, { event: "done" }]);
  });

  it("parses a findings event", async () => {
    const findings = [{ title: "Callers cannot cancel", runs: ["r-1"], cause: "No cancel path.", fix: "Add one.", node: "greeting" }];
    const events = await collect(parseSse(body(`event: findings\ndata: ${JSON.stringify({ findings })}\n\n`)));
    expect(events).toEqual([{ event: "findings", findings }]);
  });

  it("joins events split across chunks, even mid-line and mid-separator", async () => {
    const events = await collect(
      parseSse(body('event: te', 'xt\ndata: {"delta":"Hel', 'lo"}\n', '\nevent: text\ndata: {"delta":" you"}\n\n')),
    );
    expect(events).toEqual([
      { event: "text", delta: "Hello" },
      { event: "text", delta: " you" },
    ]);
  });

  it("keeps multi-byte characters split across chunks", async () => {
    const bytes = new TextEncoder().encode('event: text\ndata: {"delta":"é"}\n\n');
    const cut = bytes.indexOf(0xc3) + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    expect(await collect(parseSse(stream))).toEqual([{ event: "text", delta: "é" }]);
  });

  it("handles CRLF separators and ignores unknown events and bad JSON", async () => {
    const events = await collect(
      parseSse(body('event: ping\r\ndata: {}\r\n\r\nevent: step\r\ndata: nope\r\n\r\nevent: error\r\ndata: {"message":"x","setup":true}\r\n\r\n')),
    );
    expect(events).toEqual([{ event: "error", message: "x", setup: true }]);
  });

  it("delivers a final event with no trailing blank line", async () => {
    expect(await collect(parseSse(body("event: done\ndata: {}\n")))).toEqual([{ event: "done" }]);
  });
});

describe("streamCopilot", () => {
  it("posts the message and working copy and yields typed events", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body('event: proposal\ndata: {"agent":{"name":"b"},"issues":[]}\n\nevent: done\ndata: {}\n\n'), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const events = await collect(streamCopilot("my agent", "hi", agent));
    expect(events).toEqual([{ event: "proposal", agent: { name: "b" }, issues: [] }, { event: "done" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/copilot/my%20agent");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ message: "hi", agent });
  });

  it("reports a running turn (409) and other failures as error events", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 409 })));
    expect(await collect(streamCopilot("a", "hi", agent))).toEqual([
      { event: "error", message: "The copilot is already working on this agent." },
    ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    expect(await collect(streamCopilot("a", "hi", agent))).toEqual([
      { event: "error", message: "The copilot request failed (500)." },
    ]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    expect(await collect(streamCopilot("a", "hi", agent))).toEqual([
      { event: "error", message: "Could not reach the API. Is it running?" },
    ]);
  });

  it("ends quietly when aborted", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    }));
    expect(await collect(streamCopilot("a", "hi", agent, controller.signal))).toEqual([]);
  });
});

describe("resetCopilot", () => {
  it("posts to the reset endpoint and throws on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await resetCopilot("a");
    expect(fetchMock).toHaveBeenCalledWith("/api/copilot/a/reset", { method: "POST" });
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(resetCopilot("a")).rejects.toThrow(/new chat/);
  });
});
