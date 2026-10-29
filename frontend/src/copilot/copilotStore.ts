import { create } from "zustand";
import type { Agent, Issue } from "../model";
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
}

export type ChatMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      steps: Step[];
      proposal?: Proposal;
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
}

const emptyChat: Chat = { messages: [], running: false, startedAt: null, focus: null };

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

export interface CopilotStore {
  chats: Record<string, Chat>;
  /** Sends an instruction with the current working copy; resolves when the turn has ended. */
  send: (agentId: string, message: string, agent: Agent) => Promise<void>;
  /** Aborts the running turn; its output so far stays, and it yields no proposal. */
  stop: (agentId: string) => void;
  /** Sets the status of the proposal on the assistant message at `index` (Apply and Discard). */
  setProposalStatus: (agentId: string, index: number, status: Proposal["status"]) => void;
  /** Clears the conversation and the server-side session. */
  reset: (agentId: string) => Promise<void>;
}

const controllers = new Map<string, AbortController>();

export const chatOf = (chats: Record<string, Chat>, agentId: string | null): Chat =>
  (agentId && chats[agentId]) || emptyChat;

export const useCopilotStore = create<CopilotStore>((set, get) => {
  const patch = (agentId: string, change: (chat: Chat) => Chat) =>
    set((s) => ({ chats: { ...s.chats, [agentId]: change(chatOf(s.chats, agentId)) } }));

  /** Updates the assistant message of the running turn (always the last one). */
  const patchReply = (agentId: string, change: (m: Extract<ChatMessage, { role: "assistant" }>) => Partial<ChatMessage>) =>
    patch(agentId, (chat) => {
      const last = chat.messages[chat.messages.length - 1];
      if (last?.role !== "assistant") return chat;
      return { ...chat, messages: [...chat.messages.slice(0, -1), { ...last, ...change(last) } as ChatMessage] };
    });

  return {
    chats: {},
    send: async (agentId, message, agent) => {
      if (chatOf(get().chats, agentId).running || !message.trim()) return;
      const controller = new AbortController();
      controllers.set(agentId, controller);
      patch(agentId, (chat) => ({
        ...chat,
        messages: [...chat.messages, { role: "user", text: message.trim() }, { role: "assistant", text: "", steps: [] }],
        running: true,
        startedAt: Date.now(),
      }));
      try {
        for await (const e of streamer(agentId, message.trim(), agent, controller.signal)) {
          if (controller.signal.aborted) break;
          if (e.event === "step") {
            patchReply(agentId, (m) => ({ steps: [...m.steps, { label: e.label, node: e.node }] }));
            // A step without a node (validating) keeps the last focus; only the end of the turn clears it.
            if (e.node) patch(agentId, (chat) => ({ ...chat, focus: e.node! }));
          }
          else if (e.event === "text") patchReply(agentId, (m) => ({ text: m.text + e.delta }));
          else if (e.event === "proposal")
            patchReply(agentId, () => ({ proposal: { agent: e.agent, issues: e.issues, base: agent, status: "pending" } }));
          else if (e.event === "error") patchReply(agentId, () => ({ error: { message: e.message, setup: !!e.setup } }));
          else if (e.event === "done") break;
        }
      } catch (err) {
        patchReply(agentId, () => ({ error: { message: (err as Error).message || "The copilot failed.", setup: false } }));
      } finally {
        if (controllers.get(agentId) === controller) controllers.delete(agentId);
        if (controller.signal.aborted) patchReply(agentId, () => ({ stopped: true }));
        patch(agentId, (chat) => ({ ...chat, running: false, startedAt: null, focus: null }));
      }
    },
    stop: (agentId) => controllers.get(agentId)?.abort(),
    setProposalStatus: (agentId, index, status) =>
      patch(agentId, (chat) => ({
        ...chat,
        messages: chat.messages.map((m, i) =>
          i === index && m.role === "assistant" && m.proposal ? { ...m, proposal: { ...m.proposal, status } } : m,
        ),
      })),
    reset: async (agentId) => {
      controllers.get(agentId)?.abort();
      controllers.delete(agentId);
      patch(agentId, () => emptyChat);
      await resetCopilot(agentId).catch(() => {});
    },
  };
});

export const resetCopilotStore = () => {
  controllers.forEach((c) => c.abort());
  controllers.clear();
  useCopilotStore.setState({ chats: {} });
};
