import { indentLess, indentMore, redo, undo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { isIOS } from '../utils/platform';

type AccessoryAction =
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

export function setActiveEditor(view: EditorView): void {
  currentView = view;
}

export function clearActiveEditor(view: EditorView): void {
  // Only clear if the blurring view is the one we're tracking — guards against
  // a focus-on-new / blur-on-old ordering when remounting the editor.
  if (currentView === view) currentView = null;
}

declare global {
  interface Window {
    __notebanAccessory?: {
      fire: (action: AccessoryAction) => void;
    };
  }
}

function fire(action: AccessoryAction): void {
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

export function installAccessoryBridge(): void {
  if (!isIOS) return;
  if (typeof window === 'undefined') return;
  if (window.__notebanAccessory) return;
  window.__notebanAccessory = { fire };
}
