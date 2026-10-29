import { useParams } from "react-router-dom";

export function AgentEditorPlaceholder() {
  const { id } = useParams();
  return (
    <p className="sheet__empty">
      Editor for <code>{id}</code> comes next.
    </p>
  );
}
