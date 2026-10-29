export interface AgentSummary {
  id: string;
  name: string;
  node_count: number;
  updated_at: string;
}

export async function listAgents(): Promise<AgentSummary[]> {
  const res = await fetch("/api/agents");
  if (!res.ok) throw new Error(`Could not load agents (${res.status})`);
  return res.json();
}
