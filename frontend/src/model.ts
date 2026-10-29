export interface TaskMessage {
  role: string;
  content: string;
}

export interface Param {
  type?: string;
  description?: string;
  enum?: string[];
  [key: string]: unknown;
}

export interface Edge {
  function: string;
  description: string;
  target: string;
  properties?: Record<string, Param>;
  required?: string[];
}

export interface AgentNode {
  name: string;
  task_messages?: TaskMessage[];
  role_message?: string | null;
  edges?: Edge[];
  pre_actions?: unknown[];
  post_actions?: unknown[];
  end?: boolean;
}

export interface Position {
  x: number;
  y: number;
}

/** The agent JSON document: the single contract shared by the UI, the runtime and the Copilot. */
export interface Agent {
  name: string;
  persona?: string;
  voice_id?: string;
  model?: string;
  initial_node: string;
  nodes: AgentNode[];
  layout?: Record<string, Position>;
}

export const edgeId = (node: string, fn: string) => `${node}::${fn}`;

/** Edge label offsets live in `layout` beside node positions, under the edge id (`node::function`). */
export const isEdgeKey = (key: string) => key.includes("::");
