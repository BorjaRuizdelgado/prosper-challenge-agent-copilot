import type { Agent } from "./model";

export type ParseResult = { ok: true; agent: Agent } | { ok: false; message: string; line?: number };

/** 1-based line of a character offset. */
const lineAt = (text: string, offset: number) => text.slice(0, offset).split("\n").length;

/**
 * Best-effort line of a JSON.parse failure. Engines word it differently: some give "line 3 column 4", some
 * "position 12", and V8 now quotes ~10 characters of context around the error, which we find in the text.
 */
function errorLine(text: string, message: string): number | undefined {
  const line = /line (\d+)/.exec(message);
  if (line) return Number(line[1]);
  const position = /position (\d+)/.exec(message);
  if (position) return lineAt(text, Number(position[1]));
  const quoted = /, (\.\.\.)?"([\s\S]*)" is not valid JSON/.exec(message);
  if (!quoted) return undefined;
  const at = text.indexOf(quoted[2]);
  return at < 0 ? undefined : lineAt(text, at + (quoted[1] ? Math.min(10, quoted[2].length - 1) : 0));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** First structural problem that would stop the editor from rendering the document, or null. */
function shapeProblem(doc: unknown): string | null {
  if (!isObject(doc)) return "The agent must be a JSON object.";
  if (typeof doc.name !== "string") return '"name" must be a string.';
  if (typeof doc.initial_node !== "string") return '"initial_node" must be a string.';
  if (!Array.isArray(doc.nodes)) return '"nodes" must be an array.';
  for (const [i, node] of doc.nodes.entries()) {
    if (!isObject(node) || typeof node.name !== "string") return `nodes[${i}] must be an object with a string "name".`;
    if (node.edges !== undefined && !Array.isArray(node.edges)) return `"edges" of node "${node.name}" must be an array.`;
    for (const [j, edge] of ((node.edges as unknown[]) ?? []).entries()) {
      if (!isObject(edge) || typeof edge.function !== "string" || typeof edge.target !== "string")
        return `edge ${j + 1} of node "${node.name}" needs a string "function" and "target".`;
    }
  }
  if (doc.layout !== undefined && !isObject(doc.layout)) return '"layout" must be an object.';
  return null;
}

/** Parses and shape-checks agent JSON; semantic problems (bad targets...) are left to validation. */
export function parseAgent(text: string): ParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    const message = (e as Error).message;
    return { ok: false, message, line: errorLine(text, message) };
  }
  const problem = shapeProblem(doc);
  return problem ? { ok: false, message: problem } : { ok: true, agent: doc as Agent };
}
