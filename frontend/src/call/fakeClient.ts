import { vi } from "vitest";
import { CallError, type CallClient, type CallEvents } from "./client";

/** A controllable stand-in for the Pipecat client, for tests. */
export function fakeClientFactory(opts: { connect?: () => Promise<void> } = {}) {
  const state: { events: CallEvents | null; client: CallClient | null } = { events: null, client: null };
  const factory = vi.fn((events: CallEvents): CallClient => {
    state.events = events;
    state.client = {
      connect: vi.fn(opts.connect ?? (() => Promise.resolve())),
      disconnect: vi.fn(() => Promise.resolve()),
      setMuted: vi.fn(),
    };
    return state.client;
  });
  return { factory, state, CallError };
}
