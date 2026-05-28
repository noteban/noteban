import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PieMenuItem } from '@noteban/pie-menu';
import './MobileActionSheet.css';

export interface MobileActionSheetProps {
  open: boolean;
  title?: string;
  items: PieMenuItem[];
  onClose: () => void;
}

export function MobileActionSheet({ open, title, items, onClose }: MobileActionSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const target = typeof document !== 'undefined' ? document.body : null;
  if (!target) return null;

  return createPortal(
    <div className="mobile-action-sheet-root open" data-state="open">
      <div
        className="mobile-action-sheet-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="mobile-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Actions'}
      >
        <div className="mobile-action-sheet-handle" aria-hidden="true" />
        {title && <div className="mobile-action-sheet-title">{title}</div>}
        <ul className="mobile-action-sheet-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="mobile-action-sheet-item"
                data-danger={item.danger ? 'true' : 'false'}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect?.();
                  onClose();
                }}
              >
                {item.icon && <span className="mobile-action-sheet-icon">{item.icon}</span>}
                <span className="mobile-action-sheet-label">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    target,
  );
}
