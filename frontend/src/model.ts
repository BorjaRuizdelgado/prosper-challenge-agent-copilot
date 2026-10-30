export interface TaskMessage {
  role: string;
  content: string;
}

/** A collected parameter, as a JSON-schema property; keywords the form does not edit are kept as they are. */
export interface Param {
  type?: string;
  description?: string;
  enum?: Array<string | number>;
  /** What an `array` parameter holds. */
  items?: Param;
  [key: string]: unknown;
}

export interface Edge {
  function: string;
  description: string;
  target: string;
  properties?: Record<string, Param>;
  required?: string[];
}

/**
 * A Pipecat Flows action. Only `tts_say` and `end_conversation` can be written as data (`function` needs a
 * Python handler); both take an optional `text` and `append_text_to_context` (default true).
 */
export interface Action {
  type: string;
  text?: string;
  append_text_to_context?: boolean;
  [key: string]: unknown;
}

export const ACTION_TYPES = ["tts_say", "end_conversation"] as const;

export interface AgentNode {
  name: string;
  task_messages?: TaskMessage[];
  role_message?: string | null;
  edges?: Edge[];
  pre_actions?: Action[];
  post_actions?: Action[];
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

export type RunOutcome = "completed" | "transferred" | "abandoned" | "stuck";

export interface RunLine {
  speaker: "agent" | "caller";
  text: string;
}

/** One visited node; `via` is the edge taken from the previous node, with the data it collected. */
export interface RunStep {
  node: string;
  via?: string;
  args?: Record<string, unknown>;
}

/** A (mocked) production call of an agent. `flag` is a note from the client. */
export interface Run {
  id: string;
  started_at: string;
  duration_s: number;
  outcome: RunOutcome;
  flag?: string;
  transcript: RunLine[];
  path: RunStep[];
}

/** One cause the copilot found in an agent's production runs; `runs` are the ids that show it, `node` is the node it is about. */
export interface Finding {
  title: string;
  runs: string[];
  cause: string;
  fix: string;
  node?: string;
}

export type RequirementStatus = "covered" | "default" | "open";

/** One rule found in the client's guidelines, with the quote it came from and the nodes that implement it. */
export interface Requirement {
  id: string;
  text: string;
  quote: string;
  status: RequirementStatus;
  nodes: string[];
  note?: string;
}

/** One question for the client, with the default the agent follows until they answer. */
export interface ClientQuestion {
  id: string;
  question: string;
  default: string;
  requirements: string[];
}

/** The copilot's coverage report on the client's guidelines. */
export interface Coverage {
  requirements: Requirement[];
  questions: ClientQuestion[];
}
