import {
  ViewPlugin,
  Decoration,
  EditorView,
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';

// Regex pattern for hashtags
const HASHTAG_REGEX = /(?:^|[^a-zA-Z0-9])#([a-zA-Z][a-zA-Z0-9_-]*)/g;

function isInFrontmatter(doc: { lines: number; line: (n: number) => { text: string } }, lineNum: number): boolean {
  // Check if we're inside YAML frontmatter (between --- delimiters)
  const firstLine = doc.line(1).text;
  if (firstLine !== '---') return false;

  let frontmatterEnd = -1;
  for (let i = 2; i <= doc.lines; i++) {
    if (doc.line(i).text === '---') {
      frontmatterEnd = i;
      break;
    }
  }

  return frontmatterEnd > 0 && lineNum <= frontmatterEnd;
}

function isInCodeBlock(doc: { lines: number; line: (n: number) => { text: string } }, lineNum: number): boolean {
  // Check if the line is inside a fenced code block
  let inCodeBlock = false;
  for (let i = 1; i <= lineNum; i++) {
    const text = doc.line(i).text;
    if (text.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
  }
  return inCodeBlock;
}

function tagDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc;

  for (let i = 1; i <= doc.lines; i++) {
    // Skip frontmatter and code blocks
    if (isInFrontmatter(doc, i) || isInCodeBlock(doc, i)) {
      continue;
    }

    const line = doc.line(i);
    const text = line.text;

    // Skip inline code by tracking backticks
    const inlineCodeRanges: Array<{ start: number; end: number }> = [];
    let backtickStart = -1;
    for (let j = 0; j < text.length; j++) {
      if (text[j] === '`') {
        if (backtickStart === -1) {
          backtickStart = j;
        } else {
          inlineCodeRanges.push({ start: backtickStart, end: j });
          backtickStart = -1;
        }
      }
    }

    let match;
    HASHTAG_REGEX.lastIndex = 0;

    while ((match = HASHTAG_REGEX.exec(text)) !== null) {
      // Calculate positions
      const prefixLength = match[0].length - match[1].length - 1;
      const tagStart = match.index + prefixLength;
      const tagEnd = tagStart + match[1].length + 1;

      // Check if this match is inside inline code
      const isInInlineCode = inlineCodeRanges.some(
        range => tagStart >= range.start && tagEnd <= range.end + 1
      );

      if (!isInInlineCode) {
        const from = line.from + tagStart;
        const to = line.from + tagEnd;

        decorations.push(
          Decoration.mark({
            class: 'cm-hashtag',
            attributes: { 'data-tag': match[1].toLowerCase() },
          }).range(from, to)
        );
      }
    }
  }

  return Decoration.set(decorations, true);
}

export const tagPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = tagDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = tagDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click: (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('cm-hashtag')) {
          e.preventDefault();
          const tag = target.getAttribute('data-tag');
          if (tag) {
            window.dispatchEvent(new CustomEvent('tag-click', { detail: tag }));
          }
        }
      },
    },
  }
);

export const tagTheme = EditorView.baseTheme({
  '.cm-hashtag': {
    color: '#fab387', // Catppuccin peach
    backgroundColor: 'rgba(250, 179, 135, 0.15)',
    borderRadius: '3px',
    padding: '0 2px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  '.cm-hashtag:hover': {
    backgroundColor: 'rgba(250, 179, 135, 0.3)',
  },
});
