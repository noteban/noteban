import { indentLess, indentMore, redo, undo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

export type AccessoryAction =
  | 'hash'
  | 'lbracket'
  | 'rbracket'
  | 'dash'
  | 'star'
  | 'backtick'
  | 'gt'
  | 'underscore'
  | 'bang'
  | 'pipe'
  | 'tilde'
  | 'indent'
  | 'outdent'
  | 'undo'
  | 'redo';

const CHAR_FOR_ACTION: Partial<Record<AccessoryAction, string>> = {
  hash: '#',
  lbracket: '[',
  rbracket: ']',
  dash: '-',
  star: '*',
  backtick: '`',
  gt: '>',
  underscore: '_',
  bang: '!',
  pipe: '|',
  tilde: '~',
};

// `focusedView` tracks the editor that currently has the caret. It flips to
// null on blur and drives the bar's visibility. `latestView` is sticky — set
// on every focus and only replaced (never cleared) until another editor takes
// over. Buttons dispatch against `latestView` so a brief focus loss during
// the tap (iOS sometimes still steals focus despite preventDefault) doesn't
// silently swallow the action.
let focusedView: EditorView | null = null;
let latestView: EditorView | null = null;
const listeners = new Set<(view: EditorView | null) => void>();

function emit(): void {
  for (const cb of listeners) cb(focusedView);
}

export function setActiveEditor(view: EditorView): void {
  latestView = view;
  if (focusedView === view) return;
  focusedView = view;
  emit();
}

export function clearActiveEditor(view: EditorView): void {
  // Identity-guarded so a focus-on-new / blur-on-old race during remounts
  // doesn't null out the new editor.
  if (focusedView !== view) return;
  focusedView = null;
  emit();
  // Note: latestView intentionally kept — see `performAction`.
}

export function subscribeActiveEditor(
  cb: (view: EditorView | null) => void,
): () => void {
  listeners.add(cb);
  cb(focusedView);
  return () => {
    listeners.delete(cb);
  };
}

export function performAction(action: AccessoryAction): void {
  const view = latestView;
  if (!view) return;

  const ch = CHAR_FOR_ACTION[action];
  if (ch !== undefined) {
    view.dispatch(
      view.state.update({
        ...view.state.replaceSelection(ch),
        userEvent: 'input.type',
      }),
    );
    view.focus();
    return;
  }

  switch (action) {
    case 'indent':
      indentMore(view);
      break;
    case 'outdent':
      indentLess(view);
      break;
    case 'undo':
      undo(view);
      break;
    case 'redo':
      redo(view);
      break;
  }
  view.focus();
}
