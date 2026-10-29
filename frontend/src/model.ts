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

/** Edges are LLM tools, so their names must fit OpenAI's tool-name rule (same check as backend validation). */
export const FUNCTION_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** `raw` with every character a tool name cannot hold replaced by `_`, cut to 64. */
export const toFunctionName = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64);

/** Edge label offsets live in `layout` beside node positions, under the edge id (`node::function`). */
export const isEdgeKey = (key: string) => key.includes("::");

/** A finding from the backend's agent validation; `node` and `edge` (a function name) locate it. */
export interface Issue {
  severity: "error" | "warning";
  code: string;
  message: string;
  node?: string | null;
  edge?: string | null;
}
