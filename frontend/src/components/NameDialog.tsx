import { type FormEvent, useState } from "react";
import { Dialog } from "./Dialog";

interface Props {
  title: string;
  submitLabel: string;
  initialName?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function NameDialog({ title, submitLabel, initialName = "", onSubmit, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="dialog__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!trimmed}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
