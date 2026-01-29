import { useCallback, useMemo, useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { useNotesStore, useSettingsStore, useUIStore } from '../../stores';
import { useDebounce } from '../../hooks/useDebounce';
import { checkboxPlugin, checkboxTheme } from './checkboxPlugin';
import { tagPlugin, tagTheme } from './tagPlugin';
import { tagAutocomplete } from './tagAutocompletePlugin';
import { linkPlugin, linkTheme, modifierClassPlugin, linkClickHandler } from './linkPlugin';
import { imagePlugin } from './imagePlugin';
import { listContinuationKeymap } from './listContinuationPlugin';
import { TagSuggestionButton } from './TagSuggestionButton';
import { useTags } from '../../hooks/useTags';
import { debugLog } from '../../utils/debugLogger';
import './MarkdownEditor.css';

// Catppuccin Mocha theme for CodeMirror
const catppuccinMochaTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1e1e2e',
    color: '#cdd6f4',
    height: '100%',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    backgroundColor: '#1e1e2e',
  },
  '.cm-content': {
    caretColor: '#cba6f7',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    padding: '16px',
  },
  '.cm-cursor': {
    borderLeftColor: '#cba6f7',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(203, 166, 247, 0.35) !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(49, 50, 68, 0.7)',
  },
  '.cm-gutters': {
    backgroundColor: '#181825',
    color: '#7f849c',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#313244',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px',
  },
  '.cm-line': {
    padding: '0 8px',
    background: 'transparent',
  },
}, { dark: true });

// WYSIWYG-style syntax highlighting
const catppuccinHighlighting = HighlightStyle.define([
  // Headers - larger and colored
  { tag: tags.heading1, color: 'var(--editor-h1)', fontWeight: 'bold', fontSize: '1.8em' },
  { tag: tags.heading2, color: 'var(--editor-h2)', fontWeight: 'bold', fontSize: '1.5em' },
  { tag: tags.heading3, color: 'var(--editor-h3)', fontWeight: 'bold', fontSize: '1.3em' },
  { tag: tags.heading4, color: 'var(--editor-h4)', fontWeight: 'bold', fontSize: '1.1em' },
  { tag: tags.heading5, color: 'var(--ctp-teal)', fontWeight: 'bold' },
  { tag: tags.heading6, color: 'var(--ctp-sky)', fontWeight: 'bold' },

  // Emphasis
  { tag: tags.strong, color: 'var(--editor-bold)', fontWeight: 'bold' },
  { tag: tags.emphasis, color: 'var(--editor-italic)', fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },

  // Links
  { tag: tags.link, color: 'var(--editor-link)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--ctp-sapphire)' },

  // Code
  { tag: tags.monospace, color: 'var(--editor-code)', fontFamily: 'var(--font-mono)', backgroundColor: 'var(--ctp-surface0)', padding: '2px 4px', borderRadius: '3px' },

  // Quotes
  { tag: tags.quote, color: 'var(--editor-quote)', fontStyle: 'italic' },

  // Lists
  { tag: tags.list, color: 'var(--ctp-peach)' },

  // Meta (frontmatter, etc.)
  { tag: tags.meta, color: 'var(--ctp-overlay1)' },
  { tag: tags.comment, color: 'var(--ctp-overlay0)' },

  // Processing instructions (markdown markers like #, *, etc.)
  { tag: tags.processingInstruction, color: 'var(--ctp-overlay0)' },

  // Content
  { tag: tags.content, color: 'var(--text-primary)' },
]);

interface MarkdownEditorProps {
  className?: string;
}

export function MarkdownEditor({ className }: MarkdownEditorProps) {
  const { notes, activeNoteId, updateNote } = useNotesStore();
  const { settings } = useSettingsStore();
  const { setFilterTag } = useUIStore();
  const { tagsByFrequency } = useTags();
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Listen for tag clicks from the editor plugin
  useEffect(() => {
    const handleTagClick = (e: CustomEvent<string>) => {
      setFilterTag(e.detail);
    };

    window.addEventListener('tag-click', handleTagClick as EventListener);
    return () => window.removeEventListener('tag-click', handleTagClick as EventListener);
  }, [setFilterTag]);

  // Listen for link clicks from the editor plugin (Cmd/Ctrl+click)
  useEffect(() => {
    const handleLinkClick = (e: CustomEvent<string>) => {
      import('@tauri-apps/plugin-shell').then(({ open }) => {
        open(e.detail);
      });
    };

    window.addEventListener('link-click', handleLinkClick as EventListener);
    return () => window.removeEventListener('link-click', handleLinkClick as EventListener);
  }, []);

  // Focus editor when active note changes
  useEffect(() => {
    if (activeNoteId) {
      // Use requestAnimationFrame to ensure CodeMirror has mounted
      // This handles the case where we go from no note to having a note
      requestAnimationFrame(() => {
        editorRef.current?.view?.focus();
      });
    }
  }, [activeNoteId]);

  const activeNote = useMemo(
    () => notes.find(n => n.frontmatter.id === activeNoteId),
    [notes, activeNoteId]
  );

  const debouncedSave = useDebounce(
    useCallback(async (content: string) => {
      if (!activeNote) return;
      try {
        // Extract title from first H1 heading
        const h1Match = content.match(/^#\s+(.+)$/m);
        const title = h1Match ? h1Match[1].trim() : activeNote.frontmatter.title;

        await updateNote({
          file_path: activeNote.file_path,
          content,
          title: title !== activeNote.frontmatter.title ? title : undefined,
        });
      } catch (error) {
        debugLog.error('Failed to save note:', error);
      }
    }, [activeNote, updateNote]),
    settings.autoSaveDelay
  );

  const handleChange = useCallback((value: string) => {
    debouncedSave(value);
  }, [debouncedSave]);

  const handleInsertTag = useCallback((tag: string) => {
    const view = editorRef.current?.view;
    if (!view) return;

    const pos = view.state.selection.main.head;
    const doc = view.state.doc;

    // Check if there's a space or newline before cursor, or if we're at the start
    const charBefore = pos > 0 ? doc.sliceString(pos - 1, pos) : '';
    const needsSpaceBefore = pos > 0 && charBefore !== ' ' && charBefore !== '\n' && charBefore !== '\t';

    const insertText = (needsSpaceBefore ? ' ' : '') + `#${tag} `;
    view.dispatch({
      changes: { from: pos, insert: insertText },
      selection: { anchor: pos + insertText.length },
    });
    view.focus();
  }, []);

  const extensions: Extension[] = useMemo(() => {
    const exts: Extension[] = [
      listContinuationKeymap,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      catppuccinMochaTheme,
      syntaxHighlighting(catppuccinHighlighting),
      EditorView.lineWrapping,
      checkboxPlugin,
      checkboxTheme,
      tagPlugin,
      tagTheme,
      tagAutocomplete(tagsByFrequency),
      linkPlugin,
      modifierClassPlugin,
      linkTheme,
      linkClickHandler,
      EditorView.theme({
        '.cm-content': {
          fontSize: `${settings.editorFontSize}px`,
        },
        // Selection styling - placed last to override other themes
        '.cm-selectionBackground': {
          backgroundColor: 'rgba(203, 166, 247, 0.4) !important',
        },
        '&.cm-focused .cm-selectionBackground': {
          backgroundColor: 'rgba(203, 166, 247, 0.4) !important',
        },
        '.cm-selectionLayer .cm-selectionBackground': {
          backgroundColor: 'rgba(203, 166, 247, 0.4) !important',
        },
        // Ensure selection is visible on active line
        '.cm-activeLine .cm-selectionBackground': {
          backgroundColor: 'rgba(203, 166, 247, 0.5) !important',
        },
      }),
    ];

    // Add image plugin when a note is active
    if (activeNote?.file_path) {
      exts.push(imagePlugin(activeNote.file_path));
    }

    return exts;
  }, [settings.editorFontSize, activeNote?.file_path, tagsByFrequency]);

  if (!activeNote) {
    return (
      <div className={`markdown-editor-empty ${className || ''}`}>
        <p>Select a note to start editing</p>
        <p className="markdown-editor-empty-hint">or create a new note from the sidebar</p>
      </div>
    );
  }

  return (
    <div className={`markdown-editor ${className || ''}`}>
      <div className="markdown-editor-toolbar">
        <TagSuggestionButton onInsertTag={handleInsertTag} />
      </div>
      <CodeMirror
        ref={editorRef}
        value={activeNote.content}
        extensions={extensions}
        onChange={handleChange}
        height="100%"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          rectangularSelection: true,
          crosshairCursor: false,
          highlightSelectionMatches: true,
        }}
      />
    </div>
  );
}
