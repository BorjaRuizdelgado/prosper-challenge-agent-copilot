import { PipecatClient, RTVIEvent } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

/** What the call store needs from a voice client; the Pipecat one below is the real implementation. */
export interface CallClient {
  /** Starts a session for the agent and resolves once the bot is ready; rejects with a `CallError`. */
  connect(agentId: string): Promise<void>;
  disconnect(): Promise<void>;
  setMuted(muted: boolean): void;
}

export interface CallEvents {
  /** A final user utterance. */
  onUserText: (text: string) => void;
  /** One sentence the agent said. */
  onBotText: (text: string) => void;
  /** The raw payload of a server message (see `node_changed` in backend/session.py). */
  onServerMessage: (data: unknown) => void;
  /** The session ended from the other side. */
  onDisconnected: () => void;
}

export type CallClientFactory = (events: CallEvents) => CallClient;

export class CallError extends Error {
  constructor(
    readonly kind: "mic-denied" | "failed",
    message: string,
  ) {
    super(message);
  }
}

const isMicDenied = (e: unknown) => {
  const text = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? e}`;
  return /NotAllowed|permission|denied/i.test(text);
};

/** Pipecat browser client over SmallWebRTC; `/voice` is proxied to the runner (see vite.config.ts). */
export const createPipecatClient: CallClientFactory = (events) => {
  const client = new PipecatClient({
    transport: new SmallWebRTCTransport(),
    enableMic: true,
    enableCam: false,
  });
  client.on(RTVIEvent.UserInput, (d) => d.final && events.onUserText(d.text));
  client.on(RTVIEvent.BotOutput, (d) => {
    if ((d.output_type ?? d.aggregated_by) === "sentence") events.onBotText(d.text);
  });
  client.on(RTVIEvent.ServerMessage, (data) => events.onServerMessage(data));
  client.on(RTVIEvent.Disconnected, () => events.onDisconnected());

  return {
    async connect(agentId) {
      try {
        await client.initDevices();
      } catch (e) {
        throw new CallError(
          isMicDenied(e) ? "mic-denied" : "failed",
          isMicDenied(e) ? "Microphone access was denied." : `Could not open the microphone: ${(e as Error).message ?? e}`,
        );
      }
      try {
        await client.startBotAndConnect({ endpoint: "/voice/start", requestData: { body: { agent_id: agentId } } });
      } catch (e) {
        throw new CallError("failed", (e as Error).message ?? String(e));
      }
    },
    disconnect: () => client.disconnect(),
    setMuted: (muted) => client.enableMic(!muted),
  };
};
