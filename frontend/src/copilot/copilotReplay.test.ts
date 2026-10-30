import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, Finding, Run } from "../model";
import type { ReplayEvent } from "../replay/client";
import type { CopilotEvent } from "./client";
import {
  chatOf, loadChats, resetCopilotStore, setCopilotStreamer, setReplayStreamer, type ReplayStreamer, type ReplayState, useCopilotStore,
} from "./copilotStore";

const base = { name: "a", initial_node: "n", nodes: [{ name: "n" }] } as unknown as Agent;
const proposed = { ...base, name: "b" } as Agent;
const findings: Finding[] = [{ title: "t", runs: ["bad"], cause: "c", fix: "f" }];
const runs: Run[] = [
  { id: "bad", outcome: "abandoned", started_at: "2026-01-01", duration_s: 1, transcript: [], path: [] },
  { id: "good", outcome: "completed", started_at: "2026-01-02", duration_s: 1, transcript: [], path: [] },
];
const res = (run_id: string, version: "before" | "after", outcome = "completed", goal_met = true): ReplayEvent =>
  ({ event: "result", run_id, version, transcript: [], path: [], outcome, goal_met, reason: "r" }) as ReplayEvent;

const restores: Array<() => void> = [];
beforeEach(() => {
  resetCopilotStore();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => runs }));
});
afterEach(() => {
  restores.splice(0).forEach((r) => r());
  vi.unstubAllGlobals();
});

const turn = (events: CopilotEvent[]) =>
  restores.push(setCopilotStreamer(async function* () { yield* events; }));
const replaying = (fn: ReplayStreamer) => {
  const spy = vi.fn(fn);
  restores.push(setReplayStreamer(spy));
  return spy;
};
const chat = () => chatOf(useCopilotStore.getState().chats, "a");
const msg = () => chat().messages.at(-1) as { replay?: ReplayState };
const proposalTurn: CopilotEvent[] = [
  { event: "findings", findings }, { event: "proposal", agent: proposed, issues: [] }, { event: "done" },
];

/** A replay stream the test releases by hand. */
function held(events: ReplayEvent[]) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  return { release, fn: (async function* () { await gate; yield* events; }) as ReplayStreamer };
}

describe("automatic replay", () => {
  it("starts on done when the turn has findings and a proposal, with the cited and 3 working runs", async () => {
    const spy = replaying(async function* () { yield res("bad", "before", "abandoned", false); yield res("bad", "after"); yield res("good", "before"); yield res("good", "after"); yield { event: "done" }; });
    turn(proposalTurn);
    await useCopilotStore.getState().send("a", "analyze", base);
    await vi.waitFor(() => expect(msg().replay?.status).toBe("done"));
    expect(spy.mock.calls[0].slice(0, 4)).toEqual(["a", base, proposed, ["bad", "good"]]);
    expect(msg().replay?.runs.bad).toMatchObject({ before: { outcome: "abandoned" }, after: { goal_met: true } });
    expect(msg().replay?.runs.good.after).toBeDefined();
  });

  it.each([
    ["no findings", [{ event: "proposal", agent: proposed, issues: [] }, { event: "done" }]],
    ["no proposal", [{ event: "findings", findings }, { event: "done" }]],
    ["an error", [{ event: "findings", findings }, { event: "proposal", agent: proposed, issues: [] }, { event: "error", message: "x" }, { event: "done" }]],
  ] as Array<[string, CopilotEvent[]]>)("does not start with %s", async (_n, events) => {
    const spy = replaying(async function* () { yield { event: "done" }; });
    turn(events);
    await useCopilotStore.getState().send("a", "go", base);
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
    expect(msg().replay).toBeUndefined();
  });

  it("a setup error lands on the replay, not the turn", async () => {
    replaying(async function* () { yield { event: "error", message: "no key", setup: true }; yield { event: "done" }; });
    turn(proposalTurn);
    await useCopilotStore.getState().send("a", "go", base);
    await vi.waitFor(() => expect(msg().replay?.status).toBe("done"));
    expect(msg().replay?.error).toEqual({ message: "no key", setup: true });
  });
});

describe("replayCalls and retry", () => {
  it("the button replays the runs that need attention when there are no findings", async () => {
    const spy = replaying(async function* () { yield { event: "done" }; });
    turn([{ event: "proposal", agent: proposed, issues: [] }, { event: "done" }]);
    await useCopilotStore.getState().send("a", "go", base);
    await useCopilotStore.getState().replayCalls("a", 1);
    expect(spy.mock.calls[0][3]).toEqual(["bad"]);
  });

  it("a failure on one run is kept on that run and retry replays only it", async () => {
    replaying(async function* () { yield { event: "error", run_id: "good", version: "after", message: "boom" }; yield res("bad", "before", "abandoned", false); yield res("bad", "after"); yield { event: "done" }; });
    turn(proposalTurn);
    await useCopilotStore.getState().send("a", "go", base);
    await vi.waitFor(() => expect(msg().replay?.status).toBe("done"));
    expect(msg().replay?.runs.good.error).toBe("boom");
    const spy = replaying(async function* () { yield res("good", "before"); yield res("good", "after"); yield { event: "done" }; });
    await useCopilotStore.getState().retryReplay("a", 1, "good");
    expect(spy.mock.calls[0][3]).toEqual(["good"]);
    expect(msg().replay?.runs.good).toMatchObject({ before: {}, after: {} });
    expect(msg().replay?.runs.good.error).toBeUndefined();
    expect(msg().replay?.runs.bad.after).toBeDefined();
  });
});

describe("replay and the proposal", () => {
  it("Apply during a replay leaves it running", async () => {
    const h = held([res("bad", "before", "abandoned", false), res("bad", "after"), { event: "done" }]);
    replaying(h.fn);
    turn(proposalTurn);
    await useCopilotStore.getState().send("a", "go", base);
    await vi.waitFor(() => expect(msg().replay?.status).toBe("running"));
    useCopilotStore.getState().setProposalStatus("a", 1, "applied");
    expect(msg().replay?.status).toBe("running");
    h.release();
    await vi.waitFor(() => expect(msg().replay?.status).toBe("done"));
    expect(msg().replay?.runs.bad.after).toBeDefined();
  });
});

describe("persistence", () => {
  it("keeps finished results and marks the runs a reload cut off for retry", async () => {
    const h = held([]);
    replaying(async function* () { yield res("bad", "before", "abandoned", false); yield res("bad", "after"); await h.fn("a", base, proposed, [], new AbortController().signal)[Symbol.asyncIterator]().next(); });
    turn(proposalTurn);
    await useCopilotStore.getState().send("a", "go", base);
    await vi.waitFor(() => expect(msg().replay?.runs.bad?.after).toBeDefined());
    const saved = loadChats().a.messages.at(-1) as { replay: ReplayState };
    expect(saved.replay.status).toBe("done");
    expect(saved.replay.runs.bad.after).toBeDefined();
    expect(saved.replay.runs.good.error).toBeTruthy();
    expect(saved.replay.runs.bad.error).toBeUndefined();
    h.release();
  });
});
