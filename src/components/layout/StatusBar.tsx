import { useNotesStore } from '../../stores';
import { formatDistanceToNow } from 'date-fns';
import './StatusBar.css';

export function StatusBar() {
  const { notes, activeNoteId } = useNotesStore();
  const activeNote = notes.find(n => n.frontmatter.id === activeNoteId);

  const wordCount = activeNote
    ? activeNote.content.split(/\s+/).filter(w => w.length > 0).length
    : 0;

  const charCount = activeNote ? activeNote.content.length : 0;

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        {activeNote && (
          <>
            <span className="statusbar-item">{wordCount} words</span>
            <span className="statusbar-separator">|</span>
            <span className="statusbar-item">{charCount} chars</span>
          </>
        )}
      </div>
      <div className="statusbar-right">
        {activeNote && (
          <span className="statusbar-item">
            Modified {formatDistanceToNow(new Date(activeNote.frontmatter.modified), { addSuffix: true })}
          </span>
        )}
      </div>
    </footer>
  );
}
