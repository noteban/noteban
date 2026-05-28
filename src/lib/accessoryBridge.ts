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

let currentView: EditorView | null = null;
const listeners = new Set<(view: EditorView | null) => void>();

function emit(): void {
  for (const cb of listeners) cb(currentView);
}

export function setActiveEditor(view: EditorView): void {
  if (currentView === view) return;
  currentView = view;
  emit();
}

export function clearActiveEditor(view: EditorView): void {
  // Identity-guarded so a focus-on-new / blur-on-old race during remounts
  // doesn't null out the new editor.
  if (currentView !== view) return;
  currentView = null;
  emit();
}

export function subscribeActiveEditor(
  cb: (view: EditorView | null) => void,
): () => void {
  listeners.add(cb);
  // Fire immediately with the current value so subscribers don't need a
  // separate initial read.
  cb(currentView);
  return () => {
    listeners.delete(cb);
  };
}

export function performAction(action: AccessoryAction): void {
  const view = currentView;
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
