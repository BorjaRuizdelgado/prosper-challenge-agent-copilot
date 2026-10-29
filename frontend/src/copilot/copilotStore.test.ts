import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "../model";
import type { CopilotEvent } from "./client";
import { chatOf, resetCopilotStore, setCopilotStreamer, type Streamer, useCopilotStore } from "./copilotStore";

const base = { name: "a", initial_node: "n", nodes: [{ name: "n" }] } as unknown as Agent;
const proposed = { ...base, name: "b" } as Agent;

let restore = () => {};
beforeEach(() => resetCopilotStore());
afterEach(() => {
  restore();
  vi.unstubAllGlobals();
});

const stream = (events: CopilotEvent[]): Streamer =>
  async function* () {
    yield* events;
  };
const install = (s: Streamer) => (restore = setCopilotStreamer(s));
const chat = (id = "a") => chatOf(useCopilotStore.getState().chats, id);
const reply = () => chat().messages.at(-1) as Extract<ReturnType<typeof chat>["messages"][number], { role: "assistant" }>;

/** A stream the test drives by hand, to look at the store mid-turn. */
function controlled() {
  const queue: CopilotEvent[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  const streamer: Streamer = async function* (_id, _m, _a, signal) {
    signal.addEventListener("abort", () => ((closed = true), wake?.()));
    while (!closed) {
      if (queue.length) yield queue.shift()!;
      else await new Promise<void>((r) => (wake = r));
    }
  };
  return {
    streamer,
    push: (e: CopilotEvent) => (queue.push(e), wake?.()),
  };
}

describe("copilotStore", () => {
  it("adds the user message and a running reply as soon as it sends", async () => {
    const c = controlled();
    install(c.streamer);
    const sent = useCopilotStore.getState().send("a", "  add a goodbye ", base);
    expect(chat().running).toBe(true);
    expect(chat().startedAt).toBeTypeOf("number");
    expect(chat().messages).toEqual([
      { role: "user", text: "add a goodbye" },
      { role: "assistant", text: "", steps: [] },
    ]);
    c.push({ event: "done" });
    await sent;
    expect(chat()).toMatchObject({ running: false, startedAt: null });
  });

  it("accumulates steps, text deltas and the proposal with its base", async () => {
    install(
      stream([
        { event: "step", label: "Reading agent" },
        { event: "step", label: "Editing n", node: "n" },
        { event: "text", delta: "Added " },
        { event: "text", delta: "it." },
        { event: "proposal", agent: proposed, issues: [] },
        { event: "done" },
      ]),
    );
    await useCopilotStore.getState().send("a", "go", base);
    expect(reply().steps).toEqual([{ label: "Reading agent" }, { label: "Editing n", node: "n" }]);
    expect(reply().text).toBe("Added it.");
    expect(reply().proposal).toEqual({ agent: proposed, issues: [], base, status: "pending" });
    expect(chat().running).toBe(false);
  });

  it("focuses the node a step names and clears it when the turn ends", async () => {
    const c = controlled();
    install(c.streamer);
    const sent = useCopilotStore.getState().send("a", "go", base);
    c.push({ event: "step", label: "Reading agent" });
    c.push({ event: "step", label: "Editing n", node: "n" });
    await vi.waitFor(() => expect(chat().focus).toBe("n"));
    c.push({ event: "step", label: "Validating: 0 issues" });
    c.push({ event: "text", delta: "x" });
    await vi.waitFor(() => expect(reply().text).toBe("x"));
    expect(chat().focus).toBe("n");
    c.push({ event: "done" });
    await sent;
    expect(chat().focus).toBeNull();
  });

  it("clears the focus when the turn is stopped", async () => {
    const c = controlled();
    install(c.streamer);
    const sent = useCopilotStore.getState().send("a", "go", base);
    c.push({ event: "step", label: "Editing n", node: "n" });
    await vi.waitFor(() => expect(chat().focus).toBe("n"));
    useCopilotStore.getState().stop("a");
    await sent;
    expect(chat().focus).toBeNull();
  });

  it("keeps conversations separate per agent", async () => {
    install(stream([{ event: "text", delta: "hi" }, { event: "done" }]));
    await useCopilotStore.getState().send("a", "one", base);
    expect(chat("b").messages).toEqual([]);
    expect(chat("a").messages).toHaveLength(2);
  });

  it("records an error, marking setup problems", async () => {
    install(stream([{ event: "error", message: "No login", setup: true }]));
    await useCopilotStore.getState().send("a", "go", base);
    expect(reply().error).toEqual({ message: "No login", setup: true });
    expect(chat().running).toBe(false);
  });

  it("turns a thrown stream failure into an error", async () => {
    install(async function* () {
      throw new Error("boom");
    });
    await useCopilotStore.getState().send("a", "go", base);
    expect(reply().error).toEqual({ message: "boom", setup: false });
    expect(chat().running).toBe(false);
  });

  it("ignores a second send, and blank messages, while running", async () => {
    const c = controlled();
    const streamer = vi.fn(c.streamer);
    install(streamer);
    const first = useCopilotStore.getState().send("a", "one", base);
    await useCopilotStore.getState().send("a", "two", base);
    await useCopilotStore.getState().send("b", "   ", base);
    expect(streamer).toHaveBeenCalledTimes(1);
    expect(chat().messages).toHaveLength(2);
    c.push({ event: "done" });
    await first;
  });

  it("stop aborts the turn, keeps what streamed, and drops any later proposal", async () => {
    const c = controlled();
    install(c.streamer);
    const sent = useCopilotStore.getState().send("a", "go", base);
    c.push({ event: "text", delta: "Working" });
    await vi.waitFor(() => expect(reply().text).toBe("Working"));
    useCopilotStore.getState().stop("a");
    c.push({ event: "proposal", agent: proposed, issues: [] });
    await sent;
    expect(reply()).toMatchObject({ text: "Working", stopped: true });
    expect(reply().proposal).toBeUndefined();
    expect(chat().running).toBe(false);
  });

  it("reset clears the chat, aborts a running turn and resets the server session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const c = controlled();
    install(c.streamer);
    const sent = useCopilotStore.getState().send("a", "go", base);
    await useCopilotStore.getState().reset("a");
    await sent;
    expect(chat()).toEqual({ messages: [], running: false, startedAt: null, focus: null, review: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/copilot/a/reset", { method: "POST" });
  });

  describe("review (what the canvas shows)", () => {
    const draft = { ...base, name: "draft" } as Agent;
    const status = (i = 1) => (chat().messages[i] as { proposal?: { status: string } }).proposal?.status;

    it("follows draft events with the working copy as base and stays on the proposal after the turn", async () => {
      const c = controlled();
      install(c.streamer);
      const sent = useCopilotStore.getState().send("a", "go", base);
      expect(chat().review).toBeNull();
      c.push({ event: "draft", agent: draft });
      await vi.waitFor(() => expect(chat().review).toEqual({ base, agent: draft }));
      c.push({ event: "proposal", agent: proposed, issues: [] });
      c.push({ event: "done" });
      await sent;
      expect(chat().review).toEqual({ base, agent: proposed });
    });

    it("is cleared when the turn ends without a proposal, fails or is stopped", async () => {
      install(stream([{ event: "draft", agent: draft }, { event: "done" }]));
      await useCopilotStore.getState().send("a", "go", base);
      expect(chat().review).toBeNull();

      install(stream([{ event: "draft", agent: draft }, { event: "error", message: "boom" }]));
      await useCopilotStore.getState().send("a", "again", base);
      expect(chat().review).toBeNull();

      const c = controlled();
      install(c.streamer);
      const sent = useCopilotStore.getState().send("a", "stop me", base);
      c.push({ event: "draft", agent: draft });
      await vi.waitFor(() => expect(chat().review).not.toBeNull());
      useCopilotStore.getState().stop("a");
      await sent;
      expect(chat().review).toBeNull();
    });

    it("Hide, Apply and Discard return the canvas to the working copy", async () => {
      for (const act of [
        () => useCopilotStore.getState().hideReview("a"),
        () => useCopilotStore.getState().setProposalStatus("a", 1, "applied"),
        () => useCopilotStore.getState().setProposalStatus("a", 1, "discarded"),
      ]) {
        resetCopilotStore();
        install(stream([{ event: "proposal", agent: proposed, issues: [] }, { event: "done" }]));
        await useCopilotStore.getState().send("a", "go", base);
        expect(chat().review).not.toBeNull();
        act();
        expect(chat().review).toBeNull();
      }
      // Hiding keeps the proposal pending so it can still be applied from the card.
      resetCopilotStore();
      install(stream([{ event: "proposal", agent: proposed, issues: [] }, { event: "done" }]));
      await useCopilotStore.getState().send("a", "go", base);
      useCopilotStore.getState().hideReview("a");
      expect(status()).toBe("pending");
    });
  });
});
