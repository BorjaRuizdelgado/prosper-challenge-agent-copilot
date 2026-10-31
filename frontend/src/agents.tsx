import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as api from "./api";
import type { AgentSummary } from "./api";
import { useToast } from "./components/Toasts";
import { BUILD_FROM_GUIDELINES, useCopilotStore } from "./copilot/copilotStore";
import { useAgentStore } from "./store";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; agents: AgentSummary[] };

interface AgentsApi {
  state: State;
  reload: () => void;
  create: (name: string) => Promise<void>;
  /** Creates the agent with its guidelines, opens it with the Copilot and sends the build request. */
  createFromGuidelines: (name: string, guidelines: string, source: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const AgentsContext = createContext<AgentsApi | null>(null);

export function useAgents(): AgentsApi {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgents must be used inside <AgentsProvider>");
  return ctx;
}

const summarize = (r: api.AgentRecord): AgentSummary => ({
  id: r.id,
  name: r.agent.name,
  node_count: r.agent.nodes.length,
  updated_at: r.updated_at,
});

export function AgentsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const load = useCallback(() => {
    api.listAgents().then(
      (agents) => setState({ status: "ready", agents }),
      (e: Error) => setState({ status: "error", message: e.message }),
    );
  }, []);
  const reload = useCallback(() => {
    setState({ status: "loading" });
    load();
  }, [load]);

  // The state starts as "loading", so the first fetch needs no reset.
  useEffect(load, [load]);

  // A save from the editor can change the name and node count the list shows.
  useEffect(
    () =>
      useAgentStore.subscribe((s, prev) => {
        if (prev.saveStatus !== "saving" || s.saveStatus !== "idle" || !s.agentId || !s.agent) return;
        const { agentId, agent } = s;
        setState((list) =>
          list.status === "ready"
            ? {
                status: "ready",
                agents: list.agents.map((a) =>
                  a.id === agentId
                    ? { ...a, name: agent.name, node_count: agent.nodes.length, updated_at: new Date().toISOString() }
                    : a,
                ),
              }
            : list,
        );
      }),
    [],
  );

  const update = (fn: (agents: AgentSummary[]) => AgentSummary[]) =>
    setState((s) => (s.status === "ready" ? { status: "ready", agents: fn(s.agents) } : s));

  // Optimistically apply `change`, restore the previous list and toast if the call fails.
  const optimistic = async (change: (a: AgentSummary[]) => AgentSummary[], call: () => Promise<unknown>) => {
    const previous = state;
    update(change);
    try {
      await call();
      return true;
    } catch (e) {
      setState(previous);
      toast((e as Error).message);
      return false;
    }
  };

  const addAndOpen = async (call: () => Promise<api.AgentRecord>, then?: (record: api.AgentRecord) => void) => {
    try {
      const record = await call();
      update((agents) => [summarize(record), ...agents]);
      navigate(`/agents/${record.id}`);
      then?.(record);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const value: AgentsApi = {
    state,
    reload,
    create: (name) => addAndOpen(() => api.createAgent(name)),
    createFromGuidelines: (name, guidelines, source) =>
      addAndOpen(
        () => api.createAgent(name, guidelines),
        (record) => {
          useAgentStore.getState().openCopilot();
          const words = guidelines.trim().split(/\s+/).filter(Boolean).length;
          void useCopilotStore.getState().send(record.id, BUILD_FROM_GUIDELINES, record.agent, { name: source, words });
        },
      ),
    duplicate: (id) => addAndOpen(() => api.duplicateAgent(id)),
    rename: async (id, name) => {
      const renamed = await optimistic(
        (agents) => agents.map((a) => (a.id === id ? { ...a, name } : a)),
        () => api.renameAgent(id, name),
      );
      // Otherwise the open editor keeps the old name and its next save would write it back.
      if (renamed && useAgentStore.getState().agentId === id) useAgentStore.getState().applySavedName(name);
    },
    remove: async (id) => {
      const deleted = await optimistic(
        (agents) => agents.filter((a) => a.id !== id),
        () => api.deleteAgent(id),
      );
      if (deleted && location.pathname === `/agents/${id}`) navigate("/");
    },
  };

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}
