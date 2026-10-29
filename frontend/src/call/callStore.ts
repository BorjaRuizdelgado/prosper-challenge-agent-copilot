import { create } from "zustand";
import { CallError, type CallClient, type CallClientFactory, createPipecatClient } from "./client";

export type CallState = "idle" | "connecting" | "live" | "ended" | "failed";

/** How long to wait for the voice agent before giving up; the runner never answers when its session setup fails. */
export const CONNECT_TIMEOUT_MS = 20_000;

export const TIMEOUT_MESSAGE =
  "The voice agent did not answer. Check that the voice runner is up, that backend/.env has both API keys, and its logs.";

export interface CallStore {
  state: CallState;
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

const initial = { state: "idle" as CallState, message: null as string | null, muted: false };

export const useCallStore = create<CallStore>((set, get) => {
  const events = {
    onUserText: () => {},
    onBotText: () => {},
    onServerMessage: () => {},
    onDisconnected: () => {
      if (get().state === "live" || get().state === "connecting") set({ state: "ended" });
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
            state: "idle",
            message: "Microphone access was denied. Allow it for this site in your browser settings, then try again.",
          });
        } else {
          set({ state: "failed", message: (e as Error).message || "The call could not be started." });
        }
      } finally {
        clearTimeout(timer);
      }
    },
    hangUp: async () => {
      const session = client;
      client = null;
      set({ state: "ended", message: null, muted: false });
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

export const resetCallStore = () => {
  client = null;
  useCallStore.setState({ ...initial });
};
