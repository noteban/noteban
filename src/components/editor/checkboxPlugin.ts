import {
  ViewPlugin,
  Decoration,
  WidgetType,
  EditorView,
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';

class CheckboxWidget extends WidgetType {
  checked: boolean;
  pos: number;

  constructor(checked: boolean, pos: number) {
    super();
    this.checked = checked;
    this.pos = pos;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = `cm-checkbox ${this.checked ? 'cm-checkbox-checked' : ''}`;

    // Create the checkbox visual
    const box = document.createElement('span');
    box.className = 'cm-checkbox-box';

    if (this.checked) {
      // Checkmark SVG
      box.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"></polyline></svg>`;
    }

    wrapper.appendChild(box);

    wrapper.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const newText = this.checked ? '[ ]' : '[x]';
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: newText },
      });
    });

    return wrapper;
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function checkboxDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc;

  // Match [ ] or [x] or [X] patterns
  const regex = /\[[ xX]\]/g;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const pos = line.from + match.index;
      const checked = match[0] === '[x]' || match[0] === '[X]';

      // Check if this is part of a list item (preceded by - or * or number.)
      const beforeMatch = text.slice(0, match.index);
      const isListItem = /^(\s*[-*]|\s*\d+\.)\s*$/.test(beforeMatch) ||
                         /[-*]\s*$/.test(beforeMatch) ||
                         /\d+\.\s*$/.test(beforeMatch);

      if (isListItem || match.index === 0 || text[match.index - 1] === ' ') {
        decorations.push(
          Decoration.replace({
            widget: new CheckboxWidget(checked, pos),
          }).range(pos, pos + 3)
        );
      }
    }
  }

  return Decoration.set(decorations, true);
}

export const checkboxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = checkboxDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = checkboxDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const checkboxTheme = EditorView.baseTheme({
  '.cm-checkbox': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    verticalAlign: 'middle',
    marginRight: '6px',
  },
  '.cm-checkbox-box': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    border: '2px solid #6c7086',
    backgroundColor: 'transparent',
    transition: 'all 0.15s ease',
  },
  '.cm-checkbox:hover .cm-checkbox-box': {
    borderColor: '#cba6f7',
  },
  '.cm-checkbox-checked .cm-checkbox-box': {
    backgroundColor: '#cba6f7',
    borderColor: '#cba6f7',
  },
  '.cm-checkbox-box svg': {
    width: '12px',
    height: '12px',
    color: '#1e1e2e',
  },
});
