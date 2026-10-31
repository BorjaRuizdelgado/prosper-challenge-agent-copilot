import { create } from "zustand";
import type { Agent, Coverage, Finding, Issue } from "../model";
import { listRuns } from "../api";
import { type ReplayEvent, streamReplay } from "../replay/client";
import { type RunReplay, selectRuns } from "../replay/select";
import { type CopilotEvent, resetCopilot, streamCopilot } from "./client";

export interface Step {
  label: string;
  node?: string;
}

/** A proposed agent with the working copy it was made from, so Apply can tell it went stale. */
export interface Proposal {
  agent: Agent;
  issues: Issue[];
  base: Agent;
  status: "pending" | "applied" | "discarded";
  /** The turn ended in an error or was stopped, so the draft may be unfinished. */
  incomplete?: boolean;
}

/** The guidelines a build request refers to; the chat shows this instead of their text. */
export interface GuidelinesChip {
  name: string;
  words: number;
}

/** The fixed request that builds an agent from its stored guidelines. */
export const BUILD_FROM_GUIDELINES = "Build this agent from the client's guidelines.";

/** The fixed request that checks an agent against its stored guidelines (also used by Re-check coverage). */
export const CHECK_COVERAGE = "Check this agent against the client's guidelines and report coverage. Do not change the agent.";

/** What replaying calls against a proposal has produced so far (design Decision 6); persisted with the message. */
export interface ReplayState {
  /** `running` while a stream is open; a reload turns it into `done` and marks the unfinished runs with an error to retry. */
  status: "running" | "done";
  /** The runs selected for replay, in display order. */
  ids: string[];
  /** Results per run id; `error` is set when that run's replay failed or was cut off. */
  runs: Record<string, RunReplay & { error?: string }>;
  /** Nothing could start (no key, API down, no runs to replay). */
  error?: { message: string; setup: boolean };
}

/** Whether a chat message asks to replay calls ("replay them", "replicate the failing calls"). Replaying costs money, so the panel answers it itself. */
export const asksForReplay = (text: string) =>
  /\b(replay|replicate|reproduce|re-?run)\w*\b/i.test(text) && /\b(calls?|runs?|them|it|fix|proposal|this|these|those)\b/i.test(text);

export const REPLAY_INTERRUPTED = "The replay was interrupted.";

export type ChatMessage =
  | { role: "user"; text: string; guidelines?: GuidelinesChip }
  | {
      role: "assistant";
      text: string;
      steps: Step[];
      /** What the review of the agent's production runs found; the last `findings` event of the turn. */
      findings?: Finding[];
      /** How the agent covers the client's guidelines; the last `coverage` event of the turn. */
      coverage?: Coverage;
      proposal?: Proposal;
      replay?: ReplayState;
      error?: { message: string; setup: boolean };
      stopped?: boolean;
    };

export interface Chat {
  messages: ChatMessage[];
  running: boolean;
  /** When the running turn was sent (ms since epoch), for the panel's timer; null when idle. */
  startedAt: number | null;
  /** The node the copilot is reading or editing right now (`step.node`); the canvas pulses it. Null when idle. */
  focus: string | null;
  /**
   * What the canvas shows instead of the working copy: the latest draft (while the turn runs) or the
   * pending proposal (after it), with the working copy it was made from. Null when the canvas shows the working copy.
   */
  review: { base: Agent; agent: Agent } | null;
}

const emptyChat: Chat = { messages: [], running: false, startedAt: null, focus: null, review: null };

export type Streamer = (agentId: string, message: string, agent: Agent, signal: AbortSignal) => AsyncIterable<CopilotEvent>;

let streamer: Streamer = streamCopilot;

/** Swap the event source (tests pass a fake); returns a restore function. */
export function setCopilotStreamer(next: Streamer) {
  const previous = streamer;
  streamer = next;
  return () => {
    streamer = previous;
  };
}

export type ReplayStreamer = (agentId: string, base: Agent, proposal: Agent | null, runIds: string[], signal: AbortSignal) => AsyncIterable<ReplayEvent>;

let replayStreamer: ReplayStreamer = streamReplay;

/** The current replay event source (the replay view uses it for *Replay this call*). */
export const getReplayStreamer = () => replayStreamer;

/** Swap the replay event source (tests pass a fake); returns a restore function. */
export function setReplayStreamer(next: ReplayStreamer) {
  const previous = replayStreamer;
  replayStreamer = next;
  return () => {
    replayStreamer = previous;
  };
}

export interface CopilotStore {
  chats: Record<string, Chat>;
  /** Text waiting to be dropped into the panel's input (e.g. from a finished call); the panel takes it and clears it. */
  prefill: string | null;
  /** The proposal whose replay card the user asked about in the chat; the card scrolls into view and stands out until it is clicked. */
  replayAsk: { agentId: string; index: number } | null;
  /** Answers a chat request to replay calls without calling the model: points at the card of the latest pending proposal. False when there is none to point at. */
  askReplay: (agentId: string, text: string) => boolean;
  setPrefill: (text: string | null) => void;
  /** Sends an instruction with the current working copy; resolves when the turn has ended. */
  send: (agentId: string, message: string, agent: Agent, guidelines?: GuidelinesChip) => Promise<void>;
  /** Aborts the running turn; its output so far stays, and the latest draft (if any) becomes an incomplete proposal. */
  stop: (agentId: string) => void;
  /** Sets the status of the proposal on the assistant message at `index` (Apply and Discard). */
  setProposalStatus: (agentId: string, index: number, status: Proposal["status"]) => void;
  /** Replays the calls that need attention (or the findings' runs) against the proposal on the assistant message at `index`: the *Replay calls* button. */
  replayCalls: (agentId: string, index: number) => Promise<void>;
  /** Replays one run again, after it failed or was cut off. */
  retryReplay: (agentId: string, index: number, runId: string) => Promise<void>;
  /** Pulses `node` on the canvas (or stops, with null) while the pointer is on something about it; a running turn owns the focus. */
  setFocus: (agentId: string, node: string | null) => void;
  /** Puts the pending proposal of the assistant message at `index` on the canvas (opening a replay row). */
  showReview: (agentId: string, index: number) => void;
  /** Shows the working copy on the canvas again; the proposal stays pending in the conversation. */
  hideReview: (agentId: string) => void;
  /** Clears the conversation and the server-side session. */
  reset: (agentId: string) => Promise<void>;
}

const controllers = new Map<string, AbortController>();
const replayControllers = new Map<string, AbortController>();
const replayKey = (agentId: string, index: number) => `${agentId}#${index}`;

const STORAGE_KEY = "copilot-chats-v1";

/** The part of a chat worth keeping across a page reload (the rest is live state). */
interface SavedChat {
  messages: ChatMessage[];
  /** A turn was in flight when it was saved; the reload cut it off. */
  running: boolean;
}

/** Set when the page starts unloading: the browser then aborts the stream, and that error must not be saved. */
let unloading = false;
if (typeof window !== "undefined") window.addEventListener("pagehide", () => (unloading = true));

function saveChats(chats: Record<string, Chat>) {
  if (unloading) return;
  try {
    const saved: Record<string, SavedChat> = {};
    for (const [id, c] of Object.entries(chats)) if (c.messages.length) saved[id] = { messages: c.messages, running: c.running };
    if (Object.keys(saved).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage full or unavailable: the conversation just won't survive a reload
  }
}

/** A replay a reload cut off: finished runs stay, the others get an error so they show Retry. */
function interrupted(replay: ReplayState): ReplayState {
  const runs = { ...replay.runs };
  for (const id of replay.ids) {
    const r = runs[id] ?? {};
    if (!r.error && !(r.before && r.after)) runs[id] = { ...r, error: REPLAY_INTERRUPTED };
  }
  return { ...replay, status: "done", runs };
}

/** Conversations saved by `saveChats`. A turn the reload cut off is shown as stopped; a pending proposal puts its draft back on the canvas. */
export function loadChats(): Record<string, Chat> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, SavedChat>;
    return Object.fromEntries(
      Object.entries(saved).map(([id, { messages, running }]) => {
        const msgs = messages.map((m, i) => {
          const cut = running && i === messages.length - 1 && m.role === "assistant" ? { ...m, stopped: true } : m;
          return cut.role === "assistant" && cut.replay?.status === "running" ? { ...cut, replay: interrupted(cut.replay) } : cut;
        });
        const last = msgs[msgs.length - 1];
        const pending = last?.role === "assistant" && last.proposal?.status === "pending" ? last.proposal : null;
        return [id, { ...emptyChat, messages: msgs, review: pending ? { base: pending.base, agent: pending.agent } : null }];
      }),
    );
  } catch {
    return {};
  }
}

export const chatOf = (chats: Record<string, Chat>, agentId: string | null): Chat => (agentId && chats[agentId]) || emptyChat;

export const useCopilotStore = create<CopilotStore>((set, get) => {
  const patch = (agentId: string, change: (chat: Chat) => Chat) => set((s) => ({ chats: { ...s.chats, [agentId]: change(chatOf(s.chats, agentId)) } }));

  /** Updates the assistant message of the running turn (always the last one). */
  const patchReply = (agentId: string, change: (m: Extract<ChatMessage, { role: "assistant" }>) => Partial<ChatMessage>) =>
    patch(agentId, (chat) => {
      const last = chat.messages[chat.messages.length - 1];
      if (last?.role !== "assistant") return chat;
      return { ...chat, messages: [...chat.messages.slice(0, -1), { ...last, ...change(last) } as ChatMessage] };
    });

  /** Updates the replay of the assistant message at `index`. */
  const patchReplay = (agentId: string, index: number, change: (r: ReplayState) => ReplayState) =>
    patch(agentId, (chat) => ({
      ...chat,
      messages: chat.messages.map((m, i) => (i === index && m.role === "assistant" && m.replay ? { ...m, replay: change(m.replay) } : m)),
    }));

  /** Streams the replay of `ids` against the message's proposal into its `replay`; the other runs' results stay. */
  const runReplay = async (agentId: string, index: number, ids: string[], keep: ReplayState | undefined) => {
    const m = chatOf(get().chats, agentId).messages[index];
    if (m?.role !== "assistant" || !m.proposal) return;
    const { base, agent } = m.proposal;
    const key = replayKey(agentId, index);
    replayControllers.get(key)?.abort();
    const controller = new AbortController();
    replayControllers.set(key, controller);
    const runs = { ...(keep?.runs ?? {}) };
    for (const id of ids) delete runs[id];
    const allIds = [...new Set([...(keep?.ids ?? []), ...ids])];
    patch(agentId, (chat) => ({
      ...chat,
      messages: chat.messages.map((x, i) => (i === index && x.role === "assistant" ? { ...x, replay: { status: "running", ids: allIds, runs } } : x)),
    }));
    const fail = (id: string, message: string) => patchReplay(agentId, index, (r) => ({ ...r, runs: { ...r.runs, [id]: { ...r.runs[id], error: message } } }));
    try {
      for await (const e of replayStreamer(agentId, base, agent, ids, controller.signal)) {
        if (controller.signal.aborted) return;
        if (e.event === "line") {
          const { run_id, version, speaker, text } = e;
          patchReplay(agentId, index, (r) => {
            const x = r.runs[run_id] ?? {};
            return { ...r, runs: { ...r.runs, [run_id]: { ...x, live: { ...x.live, [version]: [...(x.live?.[version] ?? []), { speaker, text }] } } } };
          });
        } else if (e.event === "result") {
          const { run_id, version, event: _e, ...result } = e;
          patchReplay(agentId, index, (r) => {
            const { [version]: _live, ...live } = r.runs[run_id]?.live ?? {};
            return { ...r, runs: { ...r.runs, [run_id]: { ...r.runs[run_id], [version]: result, live } } };
          });
        } else if (e.event === "error") {
          if (e.run_id) fail(e.run_id, e.message);
          else patchReplay(agentId, index, (r) => ({ ...r, error: { message: e.message, setup: !!e.setup } }));
        } else if (e.event === "done") break;
      }
    } catch (err) {
      patchReplay(agentId, index, (r) => ({ ...r, error: { message: (err as Error).message || "The replay failed.", setup: false } }));
    } finally {
      if (replayControllers.get(key) === controller) {
        replayControllers.delete(key);
        if (!controller.signal.aborted) {
          // Runs that got neither a result nor an error (the stream ended early) can be retried.
          patchReplay(agentId, index, (r) => {
            const done = { ...r, status: "done" as const, runs: { ...r.runs } };
            for (const id of ids) {
              const x = done.runs[id] ?? {};
              if (!x.error && !(x.before && x.after) && !done.error) done.runs[id] = { ...x, error: REPLAY_INTERRUPTED };
            }
            return done;
          });
        }
      }
    }
  };

  /** Selects the runs for the message's findings and replays them. */
  const startReplay = async (agentId: string, index: number) => {
    const m = chatOf(get().chats, agentId).messages[index];
    if (m?.role !== "assistant" || !m.proposal) return;
    let ids: string[];
    try {
      ids = selectRuns(m.findings, await listRuns(agentId)).map((r) => r.id);
    } catch (err) {
      const message = (err as Error).message || "Could not load the runs";
      patch(agentId, (chat) => ({
        ...chat,
        messages: chat.messages.map((x, i) =>
          i === index && x.role === "assistant" ? { ...x, replay: { status: "done", ids: [], runs: {}, error: { message, setup: false } } } : x,
        ),
      }));
      return;
    }
    if (!ids.length) {
      patch(agentId, (chat) => ({
        ...chat,
        messages: chat.messages.map((x, i) =>
          i === index && x.role === "assistant"
            ? { ...x, replay: { status: "done", ids: [], runs: {}, error: { message: "There are no calls to replay.", setup: false } } }
            : x,
        ),
      }));
      return;
    }
    await runReplay(agentId, index, ids, undefined);
  };

  return {
    chats: loadChats(),
    prefill: null,
    replayAsk: null,
    askReplay: (agentId, text) => {
      const messages = chatOf(get().chats, agentId).messages;
      const index = messages.findLastIndex((m) => m.role === "assistant" && m.proposal?.status === "pending");
      const m = messages[index];
      if (m?.role !== "assistant") return false;
      const answer = m.replay
        ? "That fix was already replayed; the results are on the proposal above."
        : "Replaying calls uses your OpenAI key and costs money, so I have not started it. If you want it, use the Replay button on the proposal above.";
      patch(agentId, (chat) => ({
        ...chat,
        messages: [...chat.messages, { role: "user", text: text.trim() }, { role: "assistant", text: answer, steps: [] }],
      }));
      set({ replayAsk: m.replay ? null : { agentId, index } });
      return true;
    },
    setPrefill: (prefill) => set({ prefill }),
    send: async (agentId, message, agent, guidelines) => {
      if (chatOf(get().chats, agentId).running || !message.trim()) return;
      const controller = new AbortController();
      controllers.set(agentId, controller);
      patch(agentId, (chat) => ({
        ...chat,
        messages: [...chat.messages, { role: "user", text: message.trim(), ...(guidelines && { guidelines }) }, { role: "assistant", text: "", steps: [] }],
        running: true,
        startedAt: Date.now(),
      }));
      try {
        for await (const e of streamer(agentId, message.trim(), agent, controller.signal)) {
          if (controller.signal.aborted) break;
          if (e.event === "step") {
            // Text streamed before a tool call is narration, not the reply: drop it.
            patchReply(agentId, (m) => ({ text: "", steps: [...m.steps, { label: e.label, node: e.node }] }));
            // A step without a node (validating) keeps the last focus; only the end of the turn clears it.
            if (e.node) patch(agentId, (chat) => ({ ...chat, focus: e.node! }));
          } else if (e.event === "findings") patchReply(agentId, () => ({ findings: e.findings }));
          else if (e.event === "coverage") patchReply(agentId, () => ({ coverage: { requirements: e.requirements, questions: e.questions } }));
          else if (e.event === "draft") patch(agentId, (chat) => ({ ...chat, review: { base: agent, agent: e.agent } }));
          else if (e.event === "text") patchReply(agentId, (m) => ({ text: m.text + e.delta }));
          else if (e.event === "proposal") {
            patchReply(agentId, () => ({
              proposal: { agent: e.agent, issues: e.issues, base: agent, status: "pending", ...(e.incomplete && { incomplete: true }) },
            }));
            patch(agentId, (chat) => ({ ...chat, review: { base: agent, agent: e.agent } }));
          } else if (e.event === "error") patchReply(agentId, () => ({ error: { message: e.message, setup: !!e.setup } }));
          else if (e.event === "done") break;
        }
      } catch (err) {
        patchReply(agentId, () => ({ error: { message: (err as Error).message || "The copilot failed.", setup: false } }));
      } finally {
        if (controllers.get(agentId) === controller) controllers.delete(agentId);
        if (controller.signal.aborted) patchReply(agentId, () => ({ stopped: true }));
        // Only a proposal keeps the canvas on the draft; a failed or no-change turn restores the working copy.
        // A stopped turn that already sent a draft turns it into an incomplete proposal.
        patch(agentId, (chat) => {
          const last = chat.messages[chat.messages.length - 1];
          let messages = chat.messages;
          if (controller.signal.aborted && chat.review && last?.role === "assistant" && !last.proposal) {
            const proposal: Proposal = { agent: chat.review.agent, issues: [], base: chat.review.base, status: "pending", incomplete: true };
            messages = [...messages.slice(0, -1), { ...last, proposal }];
          }
          const kept = messages[messages.length - 1];
          const keep = kept?.role === "assistant" && kept.proposal?.status === "pending" && (!controller.signal.aborted || !!kept.proposal.incomplete);
          return { ...chat, messages, running: false, startedAt: null, focus: null, review: keep ? chat.review : null };
        });
      }
    },
    replayCalls: (agentId, index) => {
      set({ replayAsk: null });
      return startReplay(agentId, index);
    },
    retryReplay: async (agentId, index, runId) => {
      const m = chatOf(get().chats, agentId).messages[index];
      if (m?.role !== "assistant" || !m.replay || m.replay.status === "running") return;
      await runReplay(agentId, index, [runId], m.replay);
    },
    stop: (agentId) => controllers.get(agentId)?.abort(),
    setFocus: (agentId, node) => patch(agentId, (chat) => (chat.running ? chat : { ...chat, focus: node })),
    showReview: (agentId, index) =>
      patch(agentId, (chat) => {
        const m = chat.messages[index];
        return m?.role === "assistant" && m.proposal?.status === "pending" ? { ...chat, review: { base: m.proposal.base, agent: m.proposal.agent } } : chat;
      }),
    hideReview: (agentId) => patch(agentId, (chat) => ({ ...chat, review: null })),
    setProposalStatus: (agentId, index, status) =>
      patch(agentId, (chat) => ({
        ...chat,
        review: status === "pending" ? chat.review : null,
        messages: chat.messages.map((m, i) => (i === index && m.role === "assistant" && m.proposal ? { ...m, proposal: { ...m.proposal, status } } : m)),
      })),
    reset: async (agentId) => {
      controllers.get(agentId)?.abort();
      controllers.delete(agentId);
      for (const [k, c] of replayControllers) {
        if (!k.startsWith(`${agentId}#`)) continue;
        c.abort();
        replayControllers.delete(k);
      }
      patch(agentId, () => emptyChat);
      await resetCopilot(agentId).catch(() => {});
    },
  };
});

useCopilotStore.subscribe((state, prev) => {
  if (state.chats !== prev.chats) saveChats(state.chats);
});

export const resetCopilotStore = () => {
  controllers.forEach((c) => c.abort());
  controllers.clear();
  replayControllers.forEach((c) => c.abort());
  replayControllers.clear();
  useCopilotStore.setState({ chats: {}, prefill: null, replayAsk: null });
};
