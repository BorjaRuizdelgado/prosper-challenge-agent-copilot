import type { Issue } from "./model";

export type Severity = Issue["severity"];

/** Worst severity among issues matching `where`, or null. A node match excludes its edges' issues. */
export function worstSeverity(issues: Issue[], node: string, edge?: string): Severity | null {
  const found = issues.filter((i) => i.node === node && (edge === undefined ? !i.edge : i.edge === edge));
  if (found.some((i) => i.severity === "error")) return "error";
  return found.length ? "warning" : null;
}

export const issueMessages = (issues: Issue[], node: string, edge?: string) =>
  issues.filter((i) => i.node === node && (edge === undefined ? !i.edge : i.edge === edge)).map((i) => i.message);
