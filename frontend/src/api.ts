import type { Agent, Issue } from "./model";

export interface AgentSummary {
  id: string;
  name: string;
  node_count: number;
  updated_at: string;
}

export interface AgentRecord {
  id: string;
  agent: Agent;
  updated_at: string;
}

async function request<T>(url: string, init: RequestInit, failure: string): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${failure} (${res.status})`);
  return res.status === 204 ? (undefined as T) : res.json();
}

const sendJson = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const listAgents = () => request<AgentSummary[]>("/api/agents", {}, "Could not load agents");

export const getAgent = (id: string) =>
  request<AgentRecord>(`/api/agents/${id}`, {}, "Could not load the agent");

export const createAgent = (name: string) =>
  request<AgentRecord>("/api/agents", sendJson("POST", { name }), "Could not create the agent");

export const duplicateAgent = (id: string) =>
  request<AgentRecord>(`/api/agents/${id}/duplicate`, sendJson("POST"), "Could not duplicate the agent");

export const deleteAgent = (id: string) =>
  request<void>(`/api/agents/${id}`, { method: "DELETE" }, "Could not delete the agent");

export const saveAgent = (id: string, agent: Agent) =>
  request<AgentRecord>(`/api/agents/${id}`, sendJson("PUT", agent), "Could not save the agent");

/** Runs the backend's validation rules over a working copy that need not be saved. */
export const validateAgent = (agent: Agent) =>
  request<Issue[]>("/api/agents/validate", sendJson("POST", agent), "Could not validate the agent");

/** Rename by re-saving the stored document with a new name. */
export async function renameAgent(id: string, name: string): Promise<AgentRecord> {
  const { agent } = await getAgent(id);
  return saveAgent(id, { ...agent, name });
}
