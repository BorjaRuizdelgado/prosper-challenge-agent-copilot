import { create } from "zustand";
import { CallError, type CallClient, type CallClientFactory, createPipecatClient } from "./client";

export type CallState = "idle" | "connecting" | "live" | "ended" | "failed";

/** How long to wait for the voice agent before giving up; the runner never answers when its session setup fails. */
export const CONNECT_TIMEOUT_MS = 20_000;

export const TIMEOUT_MESSAGE =
  "The voice agent did not answer. Check that the voice runner is up, that backend/.env has both API keys, and its logs.";

export type TranscriptEntry =
  | { kind: "user" | "agent"; text: string }
  | { kind: "note"; text: string };

export interface Transition {
  from: string | null;
  node: string;
  via: string | null;
  args: Record<string, unknown>;
}

/** Reads a `node_changed` server message (see backend/session.py), tolerating a `data` wrapper. */
export function parseNodeChanged(message: unknown): Transition | null {
  const m = (message as { data?: unknown })?.data ?? message;
  if (!m || typeof m !== "object") return null;
  const { type, node, from, via, args } = m as Record<string, unknown>;
  if (type !== "node_changed" || typeof node !== "string") return null;
  return {
    from: typeof from === "string" ? from : null,
    node,
    via: typeof via === "string" ? via : null,
    args: args && typeof args === "object" ? (args as Record<string, unknown>) : {},
  };
}

export function describeTransition(t: Transition): string {
  const collected = Object.entries(t.args).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  const via = t.via ? ` via ${t.via}` : "";
  return t.from ? `Moved to ${t.node}${via}${collected.length ? ` (${collected.join(", ")})` : ""}` : `Started at ${t.node}`;
}

export interface CallStore {
  state: CallState;
  /** The conversation so far; kept after the call ends until the next call starts. */
  transcript: TranscriptEntry[];
  /** The node the conversation is in, and the transition that led there; null outside a call. */
  activeNode: string | null;
  lastTransition: Transition | null;
  /** Why the call is idle-with-a-notice or failed (mic denied, backend down...). */
  message: string | null;
  muted: boolean;
  start: (agentId: string) => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
  /** Back to idle, e.g. after dismissing a failure. */
  dismiss: () => void;
}

let factory: CallClientFactory = createPipecatClient;
let client: CallClient | null = null;

/** Swap the voice client (tests pass a fake); returns a restore function. */
export function setCallClientFactory(next: CallClientFactory) {
  const previous = factory;
  factory = next;
  return () => {
    factory = previous;
  };
}

const initial = {
  state: "idle" as CallState,
  message: null as string | null,
  muted: false,
  transcript: [] as TranscriptEntry[],
  activeNode: null as string | null,
  lastTransition: null as Transition | null,
};

/** What clears when a call stops; the transcript deliberately stays. */
const stopped = { activeNode: null, lastTransition: null };

export const useCallStore = create<CallStore>((set, get) => {
  /** Appends speech, merging into the previous entry when the same side keeps talking. */
  const say = (kind: "user" | "agent", text: string) => {
    if (!text.trim()) return;
    const transcript = get().transcript;
    const last = transcript[transcript.length - 1];
    set({
      transcript:
        last?.kind === kind
          ? [...transcript.slice(0, -1), { kind, text: `${last.text} ${text.trim()}` }]
          : [...transcript, { kind, text: text.trim() }],
    });
  };

  const events = {
    onUserText: (text: string) => say("user", text),
    onBotText: (text: string) => say("agent", text),
    onServerMessage: (message: unknown) => {
      const t = parseNodeChanged(message);
      if (!t) return;
      set({
        activeNode: t.node,
        lastTransition: t.from ? t : null,
        transcript: [...get().transcript, { kind: "note", text: describeTransition(t) }],
      });
    },
    onDisconnected: () => {
      if (get().state === "live" || get().state === "connecting") set({ state: "ended", ...stopped });
    },
  };

  return {
    ...initial,
    start: async (agentId) => {
      if (get().state === "connecting" || get().state === "live") return;
      set({ ...initial, state: "connecting" });
      const session = factory(events);
      client = session;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          session.connect(agentId),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new CallError("failed", TIMEOUT_MESSAGE)), CONNECT_TIMEOUT_MS);
          }),
        ]);
        // The user may have hung up while connecting.
        if (client === session && get().state === "connecting") set({ state: "live" });
      } catch (e) {
        if (client !== session) return;
        void session.disconnect().catch(() => {});
        client = null;
        if (e instanceof CallError && e.kind === "mic-denied") {
          set({
            ...stopped,
            state: "idle",
            message: "Microphone access was denied. Allow it for this site in your browser settings, then try again.",
          });
        } else {
          set({ ...stopped, state: "failed", message: (e as Error).message || "The call could not be started." });
        }
      } finally {
        clearTimeout(timer);
      }
    },
    hangUp: async () => {
      const session = client;
      client = null;
      set({ state: "ended", message: null, muted: false, ...stopped });
      await session?.disconnect().catch(() => {});
    },
    toggleMute: () => {
      if (get().state !== "live") return;
      const muted = !get().muted;
      client?.setMuted(muted);
      set({ muted });
    },
    dismiss: () => set({ state: "idle", message: null }),
  };
});

/** Ends any call and forgets it entirely: the call belongs to the agent it was started for. */
export function clearCall() {
  const session = client;
  client = null;
  useCallStore.setState({ ...initial });
  void session?.disconnect().catch(() => {});
}

export const resetCallStore = () => {
  client = null;
  useCallStore.setState({ ...initial });
};
