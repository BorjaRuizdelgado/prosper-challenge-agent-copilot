import type { Issue } from "../model";
import { useAgentStore } from "../store";

/** The dock selection an issue points at, or null for agent-wide issues. */
export function issueSelection(issue: Issue) {
  if (!issue.node) return null;
  return issue.edge ? ({ kind: "edge", node: issue.node, function: issue.edge } as const) : ({ kind: "node", node: issue.node } as const);
}

export function IssuesPanel() {
  const issues = useAgentStore((s) => s.issues);
  const validated = useAgentStore((s) => s.validated);
  const select = useAgentStore((s) => s.select);

  return (
    <div className="issues">
      {!validated && (
        <p className="field__hint" role="status">
          Validation is unavailable right now; the list below may be out of date.
        </p>
      )}
      {issues.length === 0 ? (
        <p className="dock__empty">{validated ? "No issues" : "Checking…"}</p>
      ) : (
        <ul className="issues__list">
          {issues.map((issue, i) => {
            const target = issueSelection(issue);
            const body = (
              <>
                <span className={`pill issues__badge issues__badge--${issue.severity}`}>{issue.severity}</span>
                <span>{issue.message}</span>
              </>
            );
            return (
              <li key={`${issue.code}-${issue.node}-${issue.edge}-${i}`}>
                {target ? (
                  <button type="button" className="issues__item" onClick={() => select(target)}>
                    {body}
                  </button>
                ) : (
                  <div className="issues__item">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
