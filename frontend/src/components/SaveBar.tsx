import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import { useAgentStore } from "../store";
import { ConfirmDialog } from "./ConfirmDialog";

/** Save control + status, Cmd/Ctrl+S, and warnings before leaving with unsaved changes. */
export function SaveBar() {
  const dirty = useAgentStore((s) => s.dirty);
  const saveStatus = useAgentStore((s) => s.saveStatus);
  const saveError = useAgentStore((s) => s.saveError);
  const save = useAgentStore((s) => s.save);
  const blocker = useBlocker(dirty);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const status =
    saveStatus === "saving" ? "Saving…" : saveStatus === "failed" ? "Save failed" : dirty ? "Unsaved changes" : "Saved";

  return (
    <div className="save-bar">
      <span className={`save-bar__status save-bar__status--${saveStatus === "failed" ? "failed" : dirty ? "dirty" : "saved"}`} aria-live="polite" data-testid="save-status">
        {status}
      </span>
      {saveStatus === "failed" && (
        <span className="save-bar__error" role="alert">
          {saveError}
        </span>
      )}
      <button className="primary" disabled={saveStatus === "saving" || (!dirty && saveStatus !== "failed")} onClick={() => void save()}>
        {saveStatus === "failed" ? "Retry save" : "Save"}
      </button>
      {blocker.state === "blocked" && (
        <ConfirmDialog
          title="Leave without saving?"
          message="This agent has unsaved changes that will be lost."
          confirmLabel="Leave"
          onConfirm={() => blocker.proceed()}
          onClose={() => blocker.reset()}
        />
      )}
    </div>
  );
}
