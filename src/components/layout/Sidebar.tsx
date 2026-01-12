import { useState, useRef, useEffect } from 'react';
import { Plus, FileText } from 'lucide-react';
import { useNotesStore, useSettingsStore, useUIStore } from '../../stores';
import { format } from 'date-fns';
import { ContextMenu } from './ContextMenu';
import type { Note } from '../../types/note';
import './Sidebar.css';

interface ContextMenuState {
  note: Note;
  x: number;
  y: number;
}

export function Sidebar() {
  const { notes, activeNoteId, setActiveNote, createNote, deleteNote, updateNote } = useNotesStore();
  const { settings } = useSettingsStore();
  const { currentView, searchQuery } = useUIStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const filteredNotes = notes.filter(note => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      note.frontmatter.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query) ||
      note.frontmatter.tags.some(tag => tag.toLowerCase().includes(query))
    );
  });

  useEffect(() => {
    if (renamingNoteId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingNoteId]);

  const handleNewNote = async () => {
    if (!settings.notesDirectory) return;
    try {
      const note = await createNote({
        notes_dir: settings.notesDirectory,
        title: 'Untitled',
        content: '',
        column: 'todo',
      });
      setActiveNote(note.frontmatter.id);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    setContextMenu({ note, x: e.clientX, y: e.clientY });
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    try {
      await deleteNote(contextMenu.note.file_path);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
    setContextMenu(null);
  };

  const handleStartRename = () => {
    if (!contextMenu) return;
    setRenamingNoteId(contextMenu.note.frontmatter.id);
    setRenameValue(contextMenu.note.frontmatter.title);
    setContextMenu(null);
  };

  const handleRenameSubmit = async (note: Note) => {
    if (renameValue.trim() && renameValue !== note.frontmatter.title) {
      try {
        await updateNote({
          file_path: note.file_path,
          title: renameValue.trim(),
        });
      } catch (error) {
        console.error('Failed to rename note:', error);
      }
    }
    setRenamingNoteId(null);
    setRenameValue('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, note: Note) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(note);
    } else if (e.key === 'Escape') {
      setRenamingNoteId(null);
      setRenameValue('');
    }
  };

  if (currentView === 'kanban') {
    return null;
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="sidebar-new-btn" onClick={handleNewNote}>
          <Plus size={16} />
          <span>New Note</span>
        </button>
      </div>

      <div className="sidebar-list">
        {filteredNotes.length === 0 ? (
          <div className="sidebar-empty">
            {searchQuery ? 'No notes found' : 'No notes yet'}
          </div>
        ) : (
          filteredNotes.map(note => (
            <button
              key={note.frontmatter.id}
              className={`sidebar-item ${activeNoteId === note.frontmatter.id ? 'active' : ''}`}
              onClick={() => setActiveNote(note.frontmatter.id)}
              onContextMenu={(e) => handleContextMenu(e, note)}
            >
              <FileText size={16} className="sidebar-item-icon" />
              <div className="sidebar-item-content">
                {renamingNoteId === note.frontmatter.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    className="sidebar-item-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(note)}
                    onKeyDown={(e) => handleRenameKeyDown(e, note)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="sidebar-item-title">{note.frontmatter.title}</span>
                )}
                <span className="sidebar-item-date">
                  {format(new Date(note.frontmatter.modified), 'MMM d, yyyy')}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={handleDelete}
          onRename={handleStartRename}
        />
      )}
    </aside>
  );
}
