import {
  ViewPlugin,
  Decoration,
  WidgetType,
  EditorView,
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import { analyzeDocument } from '../../utils/mathEvaluator';

// Ghost result rendered after a trailing '='. Read-only: the computed value
// lives only in this decoration and is never written into the document.
class MathResultWidget extends WidgetType {
  readonly text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-math-result';
    span.textContent = this.text;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  eq(other: MathResultWidget): boolean {
    return other.text === this.text;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// The whole document is analyzed (not just the viewport) because definitions
// above the viewport must stay in scope — same full-scan trade-off the tag
// and link plugins already make. Notes are small; if a pathological note ever
// matters, cache parses per line text.
function mathDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i++) {
    lines.push(doc.line(i).text);
  }

  const decorations: Range<Decoration>[] = [];
  const results = analyzeDocument(lines);
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result) continue;
    const line = doc.line(i + 1);
    if (result.nameSpan) {
      decorations.push(
        Decoration.mark({ class: 'cm-math-name' }).range(
          line.from + result.nameSpan.from,
          line.from + result.nameSpan.to
        )
      );
    }
    for (const span of result.refSpans) {
      decorations.push(
        Decoration.mark({ class: 'cm-math-ref' }).range(
          line.from + span.from,
          line.from + span.to
        )
      );
    }
    if (result.resultText !== undefined && result.resultOffset !== undefined) {
      decorations.push(
        Decoration.widget({
          widget: new MathResultWidget(result.resultText),
          side: 1,
        }).range(line.from + result.resultOffset)
      );
    }
  }

  return Decoration.set(decorations, true);
}

export const mathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = mathDecorations(view);
    }

    update(update: ViewUpdate) {
      // Decorations cover the whole document, so viewport changes (scrolling)
      // don't require a rebuild. Strictly derive-and-render: no dispatches,
      // no event handlers, so undo history is never touched.
      if (update.docChanged) {
        this.decorations = mathDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const mathTheme = EditorView.baseTheme({
  '.cm-math-name': {
    color: 'var(--ctp-mauve, #cba6f7)',
    fontWeight: '600',
  },
  '.cm-math-ref': {
    color: 'var(--ctp-mauve, #cba6f7)',
  },
  // The markdown syntax highlighter nests its own token spans (with a plain
  // text color) inside these marks; the inner span's color would win, leaving
  // variables white. Force nested spans to take the mark's color instead.
  '.cm-math-name span, .cm-math-ref span': {
    color: 'inherit',
  },
  '.cm-math-result': {
    color: 'var(--ctp-mauve, #cba6f7)',
    opacity: '0.75',
    paddingLeft: '0.4em',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    '-webkit-user-select': 'none',
  },
});
