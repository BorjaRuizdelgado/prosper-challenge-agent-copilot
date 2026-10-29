import { Dialog } from "./Dialog";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: Props) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="dialog__message">{message}</p>
      <div className="dialog__actions">
        <button type="button" autoFocus onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
