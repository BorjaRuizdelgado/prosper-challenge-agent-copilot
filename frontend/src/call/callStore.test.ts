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
