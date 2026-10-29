import type { Agent, AgentNode, Edge } from "../model";
import { edgeId } from "../model";

/** One field that differs between two versions of a node or edge, as readable text. */
export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface NodeChange {
  name: string;
  fields: FieldChange[];
}

export interface EdgeChange {
  /** `node::function`, the same id the canvas uses. */
  id: string;
  node: string;
  function: string;
  fields: FieldChange[];
}

/** What a proposal changes against the working copy it was based on. */
export interface AgentDiff {
  addedNodes: string[];
  removedNodes: string[];
  changedNodes: NodeChange[];
  addedEdges: string[];
  removedEdges: string[];
  changedEdges: EdgeChange[];
  /** Agent-level settings (persona, voice, model, name). */
  changedSettings: FieldChange[];
}

const text = (value: unknown): string => (value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value));

const NODE_FIELDS: Array<[string, (n: AgentNode) => unknown]> = [
  ["task", (n) => (n.task_messages ?? []).map((m) => m.content).join("\n")],
  ["role", (n) => n.role_message],
  ["pre_actions", (n) => (n.pre_actions?.length ? n.pre_actions : undefined)],
  ["post_actions", (n) => (n.post_actions?.length ? n.post_actions : undefined)],
  ["end", (n) => (n.end ? true : undefined)],
];

const SETTING_FIELDS: Array<[string, (a: Agent) => unknown]> = [
  ["name", (a) => a.name],
  ["persona", (a) => a.persona],
  ["voice", (a) => a.voice_id],
  ["model", (a) => a.model],
];

const EDGE_FIELDS: Array<[string, (e: Edge) => unknown]> = [
  ["description", (e) => e.description],
  ["target", (e) => e.target],
  ["properties", (e) => (e.properties && Object.keys(e.properties).length ? e.properties : undefined)],
  ["required", (e) => (e.required?.length ? e.required : undefined)],
];

function fieldChanges<T>(before: T, after: T, fields: Array<[string, (v: T) => unknown]>): FieldChange[] {
  return fields.flatMap(([field, read]) => {
    const [a, b] = [text(read(before)), text(read(after))];
    return a === b ? [] : [{ field, before: a, after: b }];
  });
}

const edgesOf = (agent: Agent) =>
  new Map(agent.nodes.flatMap((n) => (n.edges ?? []).map((e) => [edgeId(n.name, e.function), { node: n.name, edge: e }] as const)));

/**
 * Compares two versions of an agent by node name and edge id (`node::function`). A renamed node shows up
 * as one removed plus one added node. The initial node and layout are not compared.
 */
export function diffAgents(before: Agent, after: Agent): AgentDiff {
  const nodesBefore = new Map(before.nodes.map((n) => [n.name, n]));
  const nodesAfter = new Map(after.nodes.map((n) => [n.name, n]));
  const edgesBefore = edgesOf(before);
  const edgesAfter = edgesOf(after);

  const changedNodes: NodeChange[] = [];
  for (const [name, node] of nodesAfter) {
    const old = nodesBefore.get(name);
    const fields = old ? fieldChanges(old, node, NODE_FIELDS) : [];
    if (fields.length) changedNodes.push({ name, fields });
  }
  const changedEdges: EdgeChange[] = [];
  for (const [id, { node, edge }] of edgesAfter) {
    const old = edgesBefore.get(id);
    const fields = old ? fieldChanges(old.edge, edge, EDGE_FIELDS) : [];
    if (fields.length) changedEdges.push({ id, node, function: edge.function, fields });
  }

  return {
    addedNodes: [...nodesAfter.keys()].filter((n) => !nodesBefore.has(n)),
    removedNodes: [...nodesBefore.keys()].filter((n) => !nodesAfter.has(n)),
    changedNodes,
    addedEdges: [...edgesAfter.keys()].filter((id) => !edgesBefore.has(id)),
    removedEdges: [...edgesBefore.keys()].filter((id) => !edgesAfter.has(id)),
    changedEdges,
    changedSettings: fieldChanges(before, after, SETTING_FIELDS),
  };
}

export const isEmptyDiff = (d: AgentDiff) =>
  !(d.addedNodes.length || d.removedNodes.length || d.changedNodes.length || d.addedEdges.length || d.removedEdges.length || d.changedEdges.length || d.changedSettings.length);
