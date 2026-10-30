import { type ChangeEvent, type DragEvent, type FormEvent, useState } from "react";
import { listSampleGuidelines } from "../api";
import { Dialog } from "./Dialog";

interface Props {
  onSubmit: (name: string, guidelines: string, source: string) => void;
  onClose: () => void;
}

export const MAX_GUIDELINES_BYTES = 50_000;
const UNSUPPORTED = "Only text and Markdown files (.md, .txt) are supported.";

const isText = (file: File) => /\.(md|markdown|txt)$/i.test(file.name);
const titleOf = (fileName: string) =>
  fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Creates an agent from client guidelines: a name, the text (typed, dropped as a .md/.txt file, or a sample). */
export function GuidelinesDialog({ onSubmit, onClose }: Props) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState("Pasted guidelines");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const trimmedName = name.trim();
  const size = new TextEncoder().encode(text).length;
  const tooBig = size > MAX_GUIDELINES_BYTES;
  const ready = !!trimmedName && !!text.trim() && !tooBig;

  const take = async (file: File | undefined) => {
    if (!file) return;
    if (!isText(file)) return setError(UNSUPPORTED);
    setError(null);
    setText(await file.text());
    setSource(file.name);
    setName((n) => n || titleOf(file.name));
  };

  const useSample = async () => {
    try {
      const sample = (await listSampleGuidelines())[0];
      if (!sample) return setError("No sample guidelines are available.");
      setError(null);
      setText(sample.text);
      setSource(titleOf(sample.name));
      setName((n) => n || titleOf(sample.name));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) onSubmit(trimmedName, text, source);
  };

  return (
    <Dialog title="New from guidelines" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Guidelines</span>
          <textarea
            rows={8}
            value={text}
            placeholder="Paste the client's guidelines, or drop a .md or .txt file here."
            onChange={(e) => {
              setText(e.target.value);
              setSource("Pasted guidelines");
            }}
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragging(false);
              void take(e.dataTransfer.files[0]);
            }}
            data-dragging={dragging || undefined}
          />
        </label>
        <div className="guidelines-dialog__tools">
          <label className="ghost guidelines-dialog__file">
            Choose a file
            <input
              type="file"
              accept=".md,.markdown,.txt,text/plain,text/markdown"
              aria-label="Guidelines file"
              hidden
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                void take(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" className="ghost" onClick={useSample}>
            Use sample guidelines
          </button>
        </div>
        {(error || tooBig) && (
          <p className="guidelines-dialog__error" role="alert">
            {error ?? "The guidelines are over 50 KB. Shorten them to continue."}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!ready}>
            Create and build
          </button>
        </div>
      </form>
    </Dialog>
  );
}
