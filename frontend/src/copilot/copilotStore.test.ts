import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "../model";
import type { CopilotEvent } from "./client";
import { chatOf, loadChats, resetCopilotStore, setCopilotStreamer, type Streamer, useCopilotStore } from "./copilotStore";

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

  it("drops text streamed before a tool step: it is narration, not the reply", async () => {
    install(
      stream([
        { event: "text", delta: "Now filling in the nodes." },
        { event: "step", label: "Editing n", node: "n" },
        { event: "text", delta: "Done." },
        { event: "done" },
      ]),
    );
    await useCopilotStore.getState().send("a", "go", base);
    expect(reply().text).toBe("Done.");
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

    it("is cleared when the turn ends without a proposal or fails with none", async () => {
      install(stream([{ event: "draft", agent: draft }, { event: "done" }]));
      await useCopilotStore.getState().send("a", "go", base);
      expect(chat().review).toBeNull();

      install(stream([{ event: "draft", agent: draft }, { event: "error", message: "boom" }]));
      await useCopilotStore.getState().send("a", "again", base);
      expect(chat().review).toBeNull();
    });

    it("keeps an incomplete proposal pending after an error turn", async () => {
      install(stream([{ event: "proposal", agent: draft, issues: [], incomplete: true }, { event: "error", message: "boom" }]));
      await useCopilotStore.getState().send("a", "go", base);
      expect(reply().error).toEqual({ message: "boom", setup: false });
      expect(reply().proposal).toEqual({ agent: draft, issues: [], base, status: "pending", incomplete: true });
      expect(chat().review).toEqual({ base, agent: draft });
      expect(loadChats().a.review).toEqual({ base, agent: draft });
    });

    it("turns the latest draft into an incomplete proposal when the turn is stopped", async () => {
      const c = controlled();
      install(c.streamer);
      const sent = useCopilotStore.getState().send("a", "stop me", base);
      c.push({ event: "draft", agent: draft });
      await vi.waitFor(() => expect(chat().review).not.toBeNull());
      useCopilotStore.getState().stop("a");
      await sent;
      expect(reply()).toMatchObject({ stopped: true, proposal: { agent: draft, base, status: "pending", incomplete: true } });
      expect(chat().review).toEqual({ base, agent: draft });
    });

    it("restores the working copy when a stopped turn sent no draft", async () => {
      const c = controlled();
      install(c.streamer);
      const sent = useCopilotStore.getState().send("a", "stop me", base);
      c.push({ event: "text", delta: "x" });
      await vi.waitFor(() => expect(reply().text).toBe("x"));
      useCopilotStore.getState().stop("a");
      await sent;
      expect(reply().proposal).toBeUndefined();
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

const findings = [{ title: "Callers cannot cancel", runs: ["r-1", "r-2"], cause: "No cancel path.", fix: "Add one.", node: "greeting" }];

describe("findings", () => {
  it("attach to the assistant message, before the proposal, and the last event wins", async () => {
    install(stream([
      { event: "step", label: "Reporting 2 findings" },
      { event: "findings", findings: [{ ...findings[0], title: "first" }] },
      { event: "findings", findings },
      { event: "proposal", agent: proposed, issues: [] },
      { event: "done" },
    ]));
    await useCopilotStore.getState().send("a", "review", base);
    expect(reply().findings).toEqual(findings);
    expect(reply().proposal?.status).toBe("pending");
  });

  it("are not set on a turn that reports none", async () => {
    install(stream([{ event: "text", delta: "Fine." }, { event: "done" }]));
    await useCopilotStore.getState().send("a", "review", base);
    expect(reply().findings).toBeUndefined();
  });

  it("come back after a reload", async () => {
    install(stream([{ event: "findings", findings }, { event: "done" }]));
    await useCopilotStore.getState().send("a", "review", base);
    expect((loadChats().a.messages.at(-1) as { findings?: unknown }).findings).toEqual(findings);
  });
});

const coverage = {
  requirements: [
    { id: "r1", text: "Book visits", quote: "We book visits.", status: "covered" as const, nodes: ["greeting"] },
    { id: "r2", text: "Cancel", quote: "", status: "default" as const, nodes: ["greeting"] },
  ],
  questions: [{ id: "q1", question: "Notice period?", default: "Hand off to staff", requirements: ["r2"] }],
};

describe("coverage", () => {
  it("attaches to the assistant message and the last event wins", async () => {
    install(stream([
      { event: "coverage", requirements: [], questions: [] },
      { event: "coverage", ...coverage },
      { event: "proposal", agent: proposed, issues: [] },
      { event: "done" },
    ]));
    await useCopilotStore.getState().send("a", "build", base);
    expect(reply().coverage).toEqual(coverage);
    expect(reply().proposal?.status).toBe("pending");
  });

  it("is not set on a turn that reports none", async () => {
    install(stream([{ event: "text", delta: "Fine." }, { event: "done" }]));
    await useCopilotStore.getState().send("a", "hi", base);
    expect(reply().coverage).toBeUndefined();
  });

  it("comes back after a reload", async () => {
    install(stream([{ event: "coverage", ...coverage }, { event: "done" }]));
    await useCopilotStore.getState().send("a", "check", base);
    expect((loadChats().a.messages.at(-1) as { coverage?: unknown }).coverage).toEqual(coverage);
  });
});

describe("persistence across a page reload", () => {
  it("keeps the conversation and brings back a pending proposal's draft", async () => {
    install(stream([{ event: "text", delta: "Added it." }, { event: "proposal", agent: proposed, issues: [] }, { event: "done" }]));
    await useCopilotStore.getState().send("a", "add a goodbye", base);
    const reloaded = loadChats().a;
    expect(reloaded.messages).toEqual(chat().messages);
    expect(reloaded).toMatchObject({ running: false, review: { base, agent: proposed } });
  });

  it("shows a turn the reload cut off as stopped", async () => {
    const c = controlled();
    install(c.streamer);
    const turn = useCopilotStore.getState().send("a", "go", base);
    c.push({ event: "text", delta: "Working" });
    await vi.waitFor(() => expect(reply().text).toBe("Working"));
    const reloaded = loadChats().a;
    expect(reloaded.running).toBe(false);
    expect(reloaded.messages[1]).toMatchObject({ text: "Working", stopped: true });
    c.push({ event: "done" });
    await turn;
  });

  it("forgets the conversation on reset", async () => {
    install(stream([{ event: "text", delta: "hi" }, { event: "done" }]));
    await useCopilotStore.getState().send("a", "go", base);
    await useCopilotStore.getState().reset("a");
    expect(loadChats()).toEqual({});
  });
});
