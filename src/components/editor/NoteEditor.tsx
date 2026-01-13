import { MarkdownEditor } from './MarkdownEditor';
import './NoteEditor.css';

interface NoteEditorProps {
  className?: string;
}

export function NoteEditor({ className }: NoteEditorProps) {
  return (
    <div className={`note-editor ${className || ''}`}>
      <div className="note-editor-content">
        <MarkdownEditor />
      </div>
    </div>
  );
}
