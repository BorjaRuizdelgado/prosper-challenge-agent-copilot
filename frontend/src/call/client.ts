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
  // The runner (pipecat 1.4) sends `user-transcription` and never `user-input`, so listening for UserInput logs nothing.
  client.on(RTVIEvent.UserTranscript, (d) => d.final && events.onUserText(d.text));
  // The same sentence arrives as "new", then once per spoken word ("in-progress") and "completed": take it once.
  client.on(RTVIEvent.BotOutput, (d) => {
    const first = d.spoken_status === undefined || d.spoken_status === "new";
    if ((d.output_type ?? d.aggregated_by) === "sentence" && first) events.onBotText(d.text);
  });
  // The transport only delivers the bot's voice as a track; the browser plays it once it is attached to an <audio> element.
  const speaker = new Audio();
  speaker.autoplay = true;
  client.on(RTVIEvent.TrackStarted, (track, participant) => {
    if (track.kind !== "audio" || participant?.local) return;
    speaker.srcObject = new MediaStream([track]);
    void speaker.play().catch(() => {});
  });
  client.on(RTVIEvent.ServerMessage, (data) => events.onServerMessage(data));
  client.on(RTVIEvent.Disconnected, () => {
    speaker.srcObject = null;
    events.onDisconnected();
  });

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
