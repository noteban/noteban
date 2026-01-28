import {
  ViewPlugin,
  Decoration,
  EditorView,
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import { modifierKeyName, isModifierPressed } from '../../utils/platform';

// Regex patterns for URLs
// Raw URLs: https://example.com (excluding trailing punctuation)
const RAW_URL_REGEX = /https?:\/\/[^\s<>[\]()]+[^\s<>[\]().,;:!?'")\]]/g;
// Markdown links: [text](url)
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

function isInFrontmatter(doc: { lines: number; line: (n: number) => { text: string } }, lineNum: number): boolean {
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
  let inCodeBlock = false;
  for (let i = 1; i <= lineNum; i++) {
    const text = doc.line(i).text;
    if (text.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
  }
  return inCodeBlock;
}

function getInlineCodeRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let backtickStart = -1;
  for (let j = 0; j < text.length; j++) {
    if (text[j] === '`') {
      if (backtickStart === -1) {
        backtickStart = j;
      } else {
        ranges.push({ start: backtickStart, end: j });
        backtickStart = -1;
      }
    }
  }
  return ranges;
}

function isInInlineCode(position: number, endPosition: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some(range => position >= range.start && endPosition <= range.end + 1);
}

function linkDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc;

  for (let i = 1; i <= doc.lines; i++) {
    // Skip frontmatter and code blocks
    if (isInFrontmatter(doc, i) || isInCodeBlock(doc, i)) {
      continue;
    }

    const line = doc.line(i);
    const text = line.text;
    const inlineCodeRanges = getInlineCodeRanges(text);

    // Track which positions are already decorated (to avoid overlap)
    const decoratedRanges: Array<{ start: number; end: number }> = [];

    // First, find markdown links [text](url)
    let match;
    MARKDOWN_LINK_REGEX.lastIndex = 0;
    while ((match = MARKDOWN_LINK_REGEX.exec(text)) !== null) {
      const linkStart = match.index;
      const linkEnd = linkStart + match[0].length;

      if (!isInInlineCode(linkStart, linkEnd, inlineCodeRanges)) {
        const from = line.from + linkStart;
        const to = line.from + linkEnd;
        const url = match[2];

        decorations.push(
          Decoration.mark({
            class: 'cm-link',
            attributes: { 'data-url': url },
          }).range(from, to)
        );
        decoratedRanges.push({ start: linkStart, end: linkEnd });
      }
    }

    // Then, find raw URLs (but not ones inside markdown links)
    RAW_URL_REGEX.lastIndex = 0;
    while ((match = RAW_URL_REGEX.exec(text)) !== null) {
      const urlStart = match.index;
      const urlEnd = urlStart + match[0].length;

      // Skip if inside inline code
      if (isInInlineCode(urlStart, urlEnd, inlineCodeRanges)) {
        continue;
      }

      // Skip if already part of a markdown link
      const isInMarkdownLink = decoratedRanges.some(
        range => urlStart >= range.start && urlEnd <= range.end
      );
      if (isInMarkdownLink) {
        continue;
      }

      const from = line.from + urlStart;
      const to = line.from + urlEnd;

      decorations.push(
        Decoration.mark({
          class: 'cm-link',
          attributes: { 'data-url': match[0] },
        }).range(from, to)
      );
    }
  }

  return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
}

export const linkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = linkDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = linkDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// Extension that updates link cursor based on modifier state - listens at document level
export const modifierClassPlugin = ViewPlugin.fromClass(
  class {
    private view: EditorView;
    private handleKeyDown: (e: KeyboardEvent) => void;
    private handleKeyUp: (e: KeyboardEvent) => void;
    private handleBlur: () => void;
    private isActive: boolean = false;

    constructor(view: EditorView) {
      this.view = view;

      this.handleKeyDown = (e: KeyboardEvent) => {
        // Check if the modifier key itself is pressed, or if it's held while pressing another key
        if ((e.key === modifierKeyName || isModifierPressed(e)) && !this.isActive) {
          this.isActive = true;
          this.updateLinkCursors();
        }
      };

      this.handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === modifierKeyName && this.isActive) {
          this.isActive = false;
          this.updateLinkCursors();
        }
      };

      // Remove cursor change when window loses focus
      this.handleBlur = () => {
        if (this.isActive) {
          this.isActive = false;
          this.updateLinkCursors();
        }
      };

      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('keyup', this.handleKeyUp);
      window.addEventListener('blur', this.handleBlur);
    }

    private updateLinkCursors() {
      const links = this.view.dom.querySelectorAll('.cm-link');
      links.forEach((link) => {
        const el = link as HTMLElement;
        if (this.isActive) {
          el.style.setProperty('cursor', 'pointer', 'important');
        } else {
          el.style.removeProperty('cursor');
        }
      });
    }

    update() {
      // Re-apply cursor styles when document changes (new links may appear)
      if (this.isActive) {
        this.updateLinkCursors();
      }
    }

    destroy() {
      document.removeEventListener('keydown', this.handleKeyDown);
      document.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('blur', this.handleBlur);
      // Clean up inline styles
      const links = this.view.dom.querySelectorAll('.cm-link');
      links.forEach((link) => {
        (link as HTMLElement).style.removeProperty('cursor');
      });
    }
  }
);

export const linkTheme = EditorView.baseTheme({
  '.cm-link': {
    color: '#89b4fa', // Catppuccin blue
    textDecoration: 'underline',
    textDecorationColor: 'rgba(137, 180, 250, 0.4)',
  },
});

// Separate DOM event handler for clicks - use mousedown to capture before other handlers
export const linkClickHandler = EditorView.domEventHandlers({
  mousedown: (e) => {
    if (!isModifierPressed(e)) return false;

    // Walk up the DOM tree to find .cm-link element
    let target = e.target as HTMLElement | null;
    while (target && !target.classList.contains('cm-link')) {
      if (target.classList.contains('cm-content')) break;
      target = target.parentElement;
    }

    if (target?.classList.contains('cm-link')) {
      e.preventDefault();
      e.stopPropagation();
      const url = target.getAttribute('data-url');
      if (url) {
        window.dispatchEvent(new CustomEvent('link-click', { detail: url }));
      }
      return true;
    }
    return false;
  },
});
