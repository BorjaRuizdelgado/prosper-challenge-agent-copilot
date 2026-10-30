import type { Agent, Issue, Run } from "./model";

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

export interface GuidelinesText {
  text: string;
}

export interface SampleGuidelines {
  name: string;
  text: string;
  reply?: string;
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

export const createAgent = (name: string, guidelines?: string) =>
  request<AgentRecord>("/api/agents", sendJson("POST", guidelines === undefined ? { name } : { name, guidelines }), "Could not create the agent");

/** The client guidelines stored with an agent, or null when it has none. */
export async function getGuidelines(id: string): Promise<string | null> {
  const res = await fetch(`/api/agents/${id}/guidelines`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load the guidelines (${res.status})`);
  return ((await res.json()) as GuidelinesText).text;
}

export const saveGuidelines = (id: string, text: string) =>
  request<GuidelinesText>(`/api/agents/${id}/guidelines`, sendJson("PUT", { text }), "Could not save the guidelines");

/** Sample client guidelines for *Use sample guidelines*; `reply` is the sample client reply. */
export const listSampleGuidelines = () =>
  request<SampleGuidelines[]>("/api/demo/guidelines", {}, "Could not load the sample guidelines");

export const duplicateAgent = (id: string) =>
  request<AgentRecord>(`/api/agents/${id}/duplicate`, sendJson("POST"), "Could not duplicate the agent");

export const deleteAgent = (id: string) =>
  request<void>(`/api/agents/${id}`, { method: "DELETE" }, "Could not delete the agent");

export const saveAgent = (id: string, agent: Agent) =>
  request<AgentRecord>(`/api/agents/${id}`, sendJson("PUT", agent), "Could not save the agent");

/** Production runs of an agent, newest first; empty when it has none. */
export const listRuns = (agentId: string) =>
  request<Run[]>(`/api/agents/${agentId}/runs`, {}, "Could not load the runs");

/** Runs the backend's validation rules over a working copy that need not be saved. */
export const validateAgent = (agent: Agent) =>
  request<Issue[]>("/api/agents/validate", sendJson("POST", agent), "Could not validate the agent");

/** Rename by re-saving the stored document with a new name. */
export async function renameAgent(id: string, name: string): Promise<AgentRecord> {
  const { agent } = await getAgent(id);
  return saveAgent(id, { ...agent, name });
}
