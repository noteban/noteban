import { autocompletion } from '@codemirror/autocomplete';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { Facet } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Facet to pass tags from React to CodeMirror
export const availableTags = Facet.define<string[], string[]>({
  combine: (values) => values[values.length - 1] ?? [],
});

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

function isInInlineCode(lineText: string, position: number): boolean {
  // Check if position is inside inline code (between backticks)
  let inCode = false;
  for (let i = 0; i < position && i < lineText.length; i++) {
    if (lineText[i] === '`') {
      inCode = !inCode;
    }
  }
  return inCode;
}

// Completion source that matches #tag patterns
function tagCompletionSource(context: CompletionContext): CompletionResult | null {
  const tags = context.state.facet(availableTags);
  if (tags.length === 0) return null;

  // Match # followed by optional letters/numbers
  const word = context.matchBefore(/#[a-zA-Z0-9_-]*/);
  if (!word) return null;

  // Only trigger if we have at least the # character
  if (word.text.length === 0) return null;

  const doc = context.state.doc;
  const pos = context.pos;
  const lineInfo = doc.lineAt(pos);
  const lineNum = lineInfo.number;
  const lineText = lineInfo.text;
  const posInLine = pos - lineInfo.from;

  // Skip autocomplete in frontmatter, code blocks, and inline code
  if (isInFrontmatter(doc, lineNum)) return null;
  if (isInCodeBlock(doc, lineNum)) return null;
  if (isInInlineCode(lineText, posInLine)) return null;

  // Extract the partial tag (without the #)
  const partialTag = word.text.slice(1).toLowerCase();

  // Filter tags that match the partial input
  const matchingTags = tags.filter(tag =>
    tag.toLowerCase().startsWith(partialTag)
  );

  if (matchingTags.length === 0) return null;

  return {
    from: word.from,
    options: matchingTags.map(tag => ({
      label: `#${tag}`,
      type: 'keyword',
      apply: `#${tag}`,
      boost: tags.indexOf(tag) === 0 ? 1 : 0, // Boost first (most frequent) tag
    })),
    validFor: /^#[a-zA-Z0-9_-]*$/,
  };
}

// Theme styling matching Catppuccin Mocha
const tagAutocompleteTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: '#1e1e2e',
    border: '1px solid #45475a',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  },
  '.cm-tooltip-autocomplete ul': {
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: '13px',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '4px 8px',
    color: '#cdd6f4',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#313244',
    color: '#fab387',
  },
  '.cm-tooltip-autocomplete .cm-completionLabel': {
    color: 'inherit',
  },
  '.cm-tooltip-autocomplete .cm-completionMatchedText': {
    color: '#fab387',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
}, { dark: true });

// Export combined extension
export function tagAutocomplete(tags: string[]) {
  return [
    availableTags.of(tags),
    autocompletion({
      override: [tagCompletionSource],
      activateOnTyping: true,
      defaultKeymap: true,
    }),
    tagAutocompleteTheme,
  ];
}
