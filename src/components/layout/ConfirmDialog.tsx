import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const target = typeof document !== 'undefined' ? document.body : null;
  if (!target) return null;

  return createPortal(
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog-title">
          {title}
        </h2>
        {message && <p className="confirm-dialog-message">{message}</p>}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="confirm-dialog-button confirm-dialog-button-primary"
            data-danger={danger ? 'true' : 'false'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    target,
  );
}
