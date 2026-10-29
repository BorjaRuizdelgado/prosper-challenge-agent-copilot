import { useEffect } from "react";
import * as api from "./api";
import { useAgentStore } from "./store";

export const VALIDATE_DELAY_MS = 400;

/** Validates the working copy with the backend's rules once edits have settled. */
export function useValidation(delay = VALIDATE_DELAY_MS) {
  const agent = useAgentStore((s) => s.agent);
  const setIssues = useAgentStore((s) => s.setIssues);

  useEffect(() => {
    if (!agent) return;
    let current = true;
    const timer = setTimeout(() => {
      api
        .validateAgent(agent)
        .then((issues) => current && setIssues(issues))
        .catch(() => current && setIssues(null));
    }, delay);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [agent, delay, setIssues]);
}
