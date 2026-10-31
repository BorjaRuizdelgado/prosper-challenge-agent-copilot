import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallError } from "./client";
import { CONNECT_TIMEOUT_MS, resetCallStore, setCallClientFactory, TIMEOUT_MESSAGE, useCallStore } from "./callStore";
import { fakeClientFactory } from "./fakeClient";

let restore = () => {};
beforeEach(() => resetCallStore());
afterEach(() => {
  restore();
  vi.useRealTimers();
});

const install = (opts?: Parameters<typeof fakeClientFactory>[0]) => {
  const fake = fakeClientFactory(opts);
  restore = setCallClientFactory(fake.factory);
  return fake;
};

describe("call state machine", () => {
  it("goes idle → connecting → live and passes the agent id", async () => {
    let resolve!: () => void;
    const fake = install({ connect: () => new Promise<void>((r) => (resolve = r)) });
    const started = useCallStore.getState().start("my-agent");
    expect(useCallStore.getState().state).toBe("connecting");
    resolve();
    await started;
    expect(useCallStore.getState().state).toBe("live");
    expect(fake.state.client!.connect).toHaveBeenCalledWith("my-agent");
  });

  it("returns to idle with an actionable message when the mic is denied", async () => {
    const fake = install({ connect: () => Promise.reject(new CallError("mic-denied", "denied")) });
    await useCallStore.getState().start("a");
    const s = useCallStore.getState();
    expect(s.state).toBe("idle");
    expect(s.message).toMatch(/Microphone access was denied/);
    expect(fake.state.client!.disconnect).toHaveBeenCalled();
  });

  it("fails with the reason when the backend cannot start the session", async () => {
    install({ connect: () => Promise.reject(new CallError("failed", "Unknown agent: 'a'")) });
    await useCallStore.getState().start("a");
    expect(useCallStore.getState()).toMatchObject({ state: "failed", message: "Unknown agent: 'a'" });
  });

  it("fails when the voice agent never answers", async () => {
    vi.useFakeTimers();
    install({ connect: () => new Promise<void>(() => {}) });
    const started = useCallStore.getState().start("a");
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    await started;
    expect(useCallStore.getState()).toMatchObject({ state: "failed", message: TIMEOUT_MESSAGE });
  });

  it("can retry after a failure", async () => {
    install({ connect: () => Promise.reject(new CallError("failed", "down")) });
    await useCallStore.getState().start("a");
    install();
    await useCallStore.getState().start("a");
    expect(useCallStore.getState()).toMatchObject({ state: "live", message: null });
  });

  it("mutes and unmutes only while live", async () => {
    const fake = install();
    useCallStore.getState().toggleMute();
    expect(useCallStore.getState().muted).toBe(false);
    await useCallStore.getState().start("a");
    useCallStore.getState().toggleMute();
    expect(fake.state.client!.setMuted).toHaveBeenLastCalledWith(true);
    expect(useCallStore.getState().muted).toBe(true);
  });

  it("hang up ends the call and releases the client", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    await useCallStore.getState().hangUp();
    expect(useCallStore.getState().state).toBe("ended");
    expect(fake.state.client!.disconnect).toHaveBeenCalled();
  });

  it("hanging up while connecting is not undone when connect settles", async () => {
    let resolve!: () => void;
    install({ connect: () => new Promise<void>((r) => (resolve = r)) });
    const started = useCallStore.getState().start("a");
    await useCallStore.getState().hangUp();
    resolve();
    await started;
    expect(useCallStore.getState().state).toBe("ended");
  });

  it("ends when the session closes from the other side", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    fake.state.events!.onDisconnected();
    expect(useCallStore.getState().state).toBe("ended");
  });

  it("ignores a second start while a call is running", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    await useCallStore.getState().start("a");
    expect(fake.factory).toHaveBeenCalledTimes(1);
  });
});

describe("transcript", () => {
  it("alternates user and agent, merging consecutive sentences of one speaker", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    const ev = fake.state.events!;
    ev.onBotText("Hello, this is Prosper.");
    ev.onBotText("How can I help?");
    ev.onUserText("I need an appointment");
    ev.onBotText("Sure.");
    expect(useCallStore.getState().transcript).toEqual([
      { kind: "agent", text: "Hello, this is Prosper. How can I help?" },
      { kind: "user", text: "I need an appointment" },
      { kind: "agent", text: "Sure." },
    ]);
  });

  it("ignores blank text", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    fake.state.events!.onUserText("   ");
    expect(useCallStore.getState().transcript).toEqual([]);
  });

  it("survives hang-up and is cleared by the next call", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    fake.state.events!.onBotText("Hi");
    await useCallStore.getState().hangUp();
    expect(useCallStore.getState().transcript).toHaveLength(1);
    await useCallStore.getState().start("a");
    expect(useCallStore.getState().transcript).toEqual([]);
  });

  it("notes transitions with the collected data", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    const ev = fake.state.events!;
    ev.onServerMessage({ type: "node_changed", from: null, node: "greeting", via: null, args: {} });
    ev.onServerMessage({ type: "node_changed", from: "greeting", node: "confirm", via: "collect", args: { name: "Ana", slots: [1] } });
    expect(useCallStore.getState().transcript).toEqual([
      { kind: "note", text: "Started at greeting" },
      { kind: "note", text: "Moved to confirm via collect (name: Ana, slots: [1])" },
    ]);
  });
});

describe("active node", () => {
  const msg = (node: string, from: string | null = null, via: string | null = null) => ({
    type: "node_changed",
    from,
    node,
    via,
    args: {},
  });

  it("tracks the node and the last transition", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    const ev = fake.state.events!;
    ev.onServerMessage(msg("greeting"));
    expect(useCallStore.getState()).toMatchObject({ activeNode: "greeting", lastTransition: null });
    ev.onServerMessage(msg("confirm", "greeting", "go"));
    expect(useCallStore.getState()).toMatchObject({
      activeNode: "confirm",
      lastTransition: { from: "greeting", node: "confirm", via: "go" },
    });
  });

  it("accepts the message wrapped in `data` and ignores other messages", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    fake.state.events!.onServerMessage({ data: msg("b", "a", "go") });
    fake.state.events!.onServerMessage({ type: "something_else" });
    fake.state.events!.onServerMessage(null);
    expect(useCallStore.getState().activeNode).toBe("b");
  });

  it("is cleared on hang-up", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    fake.state.events!.onServerMessage(msg("b", "a", "go"));
    await useCallStore.getState().hangUp();
    expect(useCallStore.getState()).toMatchObject({ activeNode: null, lastTransition: null });
  });

  it("is cleared when the other side disconnects", async () => {
    const fake = install();
    await useCallStore.getState().start("a");
    fake.state.events!.onServerMessage(msg("b", "a", "go"));
    fake.state.events!.onDisconnected();
    expect(useCallStore.getState()).toMatchObject({ state: "ended", activeNode: null, lastTransition: null });
  });
});
