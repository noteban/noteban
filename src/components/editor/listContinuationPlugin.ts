import { keymap, EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';

/**
 * Handles Enter key in checkbox lists to auto-continue with a new checkbox.
 * Supports formats: `- [ ] `, `* [ ] `, `1. [ ] `, and `[ ] ` (no marker)
 */
function handleEnterInCheckboxList(view: EditorView): boolean {
  const { state } = view;
  const { from } = state.selection.main;

  // Get current line
  const line = state.doc.lineAt(from);
  const lineText = line.text;

  // Only handle if cursor is at or near end of line (allowing trailing whitespace)
  const textAfterCursor = lineText.slice(from - line.from);
  if (textAfterCursor.trim() !== '') {
    return false;
  }

  // Match checkbox line: optional indent, optional list marker, checkbox, then content
  // Examples: "- [ ] task", "  * [x] done", "[ ] no marker", "1. [ ] numbered"
  const checkboxMatch = lineText.match(/^(\s*)([-*]\s+|\d+\.\s+)?\[[ xX]\](\s*)(.*)$/);

  if (!checkboxMatch) {
    return false;
  }

  const [, indent, listMarker, , content] = checkboxMatch;
  const hasContent = content.trim().length > 0;

  if (hasContent) {
    // Line has checkbox with content - continue the list with a new checkbox
    const marker = listMarker || '';
    const newLine = `\n${indent}${marker}[ ] `;

    console.log('Checkbox continuation:', { indent, listMarker, content, newLine });

    view.dispatch({
      changes: { from, to: from, insert: newLine },
      selection: { anchor: from + newLine.length },
    });
    return true;
  } else {
    // Empty checkbox line - stop the list by clearing the line
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' },
    });
    return true;
  }
}

// Use Prec.highest to ensure this keymap takes priority over basicSetup's default Enter handling
export const listContinuationKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Enter',
      run: handleEnterInCheckboxList,
    },
  ])
);
