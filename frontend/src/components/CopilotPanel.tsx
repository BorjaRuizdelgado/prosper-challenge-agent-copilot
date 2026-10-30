import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { chatOf, type ChatMessage, useCopilotStore } from "../copilot/copilotStore";
import { useAgentStore } from "../store";
import { CoverageCard } from "./CoverageCard";
import { FindingsCard } from "./FindingsCard";
import { ProposalCard } from "./ProposalCard";
import { ReplayCard } from "./ReplayCard";

export const EXAMPLES = [
  "Build an agent from these call guidelines: …",
  "Collect the date of birth before the reason for visit",
  "Make the greeting shorter and friendlier",
];

export const SETUP_HELP =
  "The copilot needs a Claude login or an API key. Run `claude` in a terminal and log in, or set ANTHROPIC_API_KEY in backend/.env, then restart the API. The rest of the editor keeps working.";

/** Seconds since `startedAt`, re-rendered every second while a turn runs. */
function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

function Reply({ agentId, index, message, running, elapsed }: { agentId: string; index: number; message: Extract<ChatMessage, { role: "assistant" }>; running: boolean; elapsed: number }) {
  return (
    <li className="copilot__msg copilot__msg--assistant">
      {message.steps.length > 0 && (
        <ul className="copilot__steps" aria-label="Steps">
          {message.steps.map((s, i) => (
            <li key={i}>{s.label}</li>
          ))}
        </ul>
      )}
      {message.text && <p className="copilot__text">{message.text}</p>}
      {running && (
        <p className="copilot__working" role="status" data-testid="copilot-working">
          Working… {elapsed}s
        </p>
      )}
      {message.findings && <FindingsCard agentId={agentId} findings={message.findings} />}
      {message.coverage && <CoverageCard agentId={agentId} coverage={message.coverage} />}
      {message.proposal && <ProposalCard agentId={agentId} index={index} proposal={message.proposal} />}
      {message.proposal && <ReplayCard agentId={agentId} index={index} proposal={message.proposal} replay={message.replay} />}
      {message.stopped && <p className="copilot__note">Stopped.</p>}
      {message.error && (
        <p className="copilot__error" role="alert">
          {message.error.setup ? SETUP_HELP : message.error.message}
        </p>
      )}
    </li>
  );
}

/** Chat with the copilot about the open agent. */
export function CopilotPanel() {
  const agentId = useAgentStore((s) => s.agentId);
  const agent = useAgentStore((s) => s.agent);
  const chat = useCopilotStore((s) => chatOf(s.chats, agentId));
  const { send, stop, reset } = useCopilotStore.getState();
  const toggleCopilot = useAgentStore((s) => s.toggleCopilot);
  const [draft, setDraft] = useState("");
  const prefill = useCopilotStore((s) => s.prefill);
  const input = useRef<HTMLTextAreaElement>(null);
  // "Ask Copilot" from the Call tab: take the text, put the cursor at its end so the user can finish it.
  useEffect(() => {
    if (prefill === null) return;
    setDraft(prefill);
    useCopilotStore.getState().setPrefill(null);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prefill.length, prefill.length);
    });
  }, [prefill]);
  const elapsed = useElapsed(chat.startedAt);
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [chat.messages]);

  if (!agentId || !agent) return <p className="dock__empty">Open an agent to talk to the copilot.</p>;

  const submit = () => {
    const text = draft.trim();
    if (!text || chat.running) return;
    setDraft("");
    void send(agentId, text, agent);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="copilot">
      <header className="copilot__bar">
        <h2 className="panel__title">Copilot</h2>
        <button type="button" className="ghost" onClick={() => void reset(agentId)} disabled={chat.messages.length === 0}>
          New chat
        </button>
        <button type="button" className="ghost copilot__close" aria-label="Hide the copilot" onClick={toggleCopilot}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {chat.messages.length === 0 ? (
        <div className="copilot__empty">
          <p className="copilot__intro">What should {agent.name} do?</p>
          <p className="copilot__lede">Describe what the agent should do, or how to change it. Changes appear on the canvas as a draft you apply or discard.</p>
          <ul aria-label="Example requests">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button type="button" className="copilot__example" onClick={() => setDraft(example)}>
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="copilot__messages" aria-label="Conversation">
          {chat.messages.map((m, i) =>
            m.role === "user" ? (
              <li key={i} className="copilot__msg copilot__msg--user">
                {m.text}
                {m.guidelines && (
                  <span className="chip guidelines-chip">
                    Guidelines: {m.guidelines.name} · {m.guidelines.words.toLocaleString()} words
                  </span>
                )}
              </li>
            ) : (
              <Reply key={i} agentId={agentId} index={i} message={m} running={chat.running && i === chat.messages.length - 1} elapsed={elapsed} />
            ),
          )}
          <li ref={end} aria-hidden />
        </ol>
      )}
      <form
        className="copilot__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="copilot__composer">
        <textarea
          ref={input}
          aria-label="Message to the copilot"
          rows={3}
          value={draft}
          disabled={chat.running}
          placeholder="Ask the copilot to build or change this agent…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {chat.running ? (
          <button type="button" onClick={() => stop(agentId)}>
            Stop
          </button>
        ) : (
          <button type="submit" className="primary" disabled={!draft.trim()}>
            Send
          </button>
        )}
        </div>
      </form>
    </div>
  );
}
