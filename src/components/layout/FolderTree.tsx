import { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
} from 'lucide-react';
import { useFolderStore, useNotesStore, useSettingsStore, useUIStore } from '../../stores';
import { FolderContextMenu } from './FolderContextMenu';
import { ContextMenu } from './ContextMenu';
import { extractTags } from '../../utils/tagParser';
import type { Folder as FolderType } from '../../types/folder';
import type { Note } from '../../types/note';
import './FolderTree.css';

interface FolderNodeProps {
  folder: FolderType | null;
  depth: number;
  notesDir: string;
}

function FolderNode({ folder, depth, notesDir }: FolderNodeProps) {
  const { folders, expandedFolders, toggleFolder, selectedFolder, selectFolder } =
    useFolderStore();
  const { notes, activeNoteId, setActiveNote, deleteNote, updateNote } = useNotesStore();
  const { filterTag, searchQuery } = useUIStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [noteContextMenu, setNoteContextMenu] = useState<{ note: Note; x: number; y: number } | null>(null);
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingNoteId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingNoteId]);

  const relativePath = folder?.relative_path ?? '';
  const isExpanded = relativePath === '' || expandedFolders.has(relativePath);
  const isSelected = selectedFolder === (relativePath || null);

  // Get notes in this folder (not recursive), filtered by tag and search query
  const folderNotes = useMemo(() => {
    let filtered = notes.filter((note) => {
      const noteDir = note.file_path.substring(0, note.file_path.lastIndexOf('/'));
      const expectedDir = relativePath ? `${notesDir}/${relativePath}` : notesDir;
      return noteDir === expectedDir;
    });

    // Apply tag filter
    if (filterTag) {
      filtered = filtered.filter((note) => {
        const noteTags = extractTags(note.content);
        return noteTags.includes(filterTag);
      });
    }

    // Apply search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((note) => {
        const noteTags = extractTags(note.content);
        return (
          note.frontmatter.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query) ||
          noteTags.some((tag) => tag.toLowerCase().includes(query))
        );
      });
    }

    return filtered;
  }, [notes, notesDir, relativePath, filterTag, searchQuery]);

  // Get child folders
  const childFolders = useMemo(() => {
    return folders.filter((f) => {
      const parts = f.relative_path.split('/');
      const parentPath = parts.slice(0, -1).join('/');
      return parentPath === relativePath;
    });
  }, [folders, relativePath]);

  const hasChildren = childFolders.length > 0 || folderNotes.length > 0;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (relativePath !== '') {
      toggleFolder(relativePath);
    }
  };

  const handleSelect = () => {
    selectFolder(relativePath || null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleNoteClick = (note: Note) => {
    setActiveNote(note.frontmatter.id);
  };

  const handleNoteContextMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    setNoteContextMenu({ note, x: e.clientX, y: e.clientY });
  };

  const handleNoteDelete = async () => {
    if (!noteContextMenu) return;
    try {
      await deleteNote(noteContextMenu.note.file_path);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
    setNoteContextMenu(null);
  };

  const handleNoteStartRename = () => {
    if (!noteContextMenu) return;
    setRenamingNoteId(noteContextMenu.note.frontmatter.id);
    setRenameValue(noteContextMenu.note.frontmatter.title);
    setNoteContextMenu(null);
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

  const handleNoteDragStart = (e: React.DragEvent, note: Note) => {
    e.dataTransfer.setData('note-path', note.file_path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const filePath = e.dataTransfer.getData('note-path');
    if (filePath) {
      const targetDir = relativePath ? `${notesDir}/${relativePath}` : notesDir;
      await useNotesStore.getState().moveNote(filePath, targetDir);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="folder-node">
      <div
        className={`folder-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleSelect}
        onContextMenu={handleContextMenu}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <button
          className="folder-toggle"
          onClick={handleToggle}
          tabIndex={-1}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span style={{ width: 14 }} />
          )}
        </button>
        {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
        <span className="folder-name">{folder?.name ?? 'Notes'}</span>
      </div>

      {isExpanded && (
        <div className="folder-children">
          {childFolders.map((child) => (
            <FolderNode
              key={child.relative_path}
              folder={child}
              depth={depth + 1}
              notesDir={notesDir}
            />
          ))}
          {folderNotes.map((note) => (
            <div
              key={note.frontmatter.id}
              className={`folder-note ${
                activeNoteId === note.frontmatter.id ? 'active' : ''
              }`}
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              onClick={() => handleNoteClick(note)}
              onContextMenu={(e) => handleNoteContextMenu(e, note)}
              draggable={renamingNoteId !== note.frontmatter.id}
              onDragStart={(e) => handleNoteDragStart(e, note)}
            >
              <FileText size={14} />
              {renamingNoteId === note.frontmatter.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  className="folder-note-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => handleRenameKeyDown(e, note)}
                  onBlur={() => handleRenameSubmit(note)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="folder-note-title">{note.frontmatter.title}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {contextMenu && (
        <FolderContextMenu
          folder={folder}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {noteContextMenu && (
        <ContextMenu
          x={noteContextMenu.x}
          y={noteContextMenu.y}
          onClose={() => setNoteContextMenu(null)}
          onDelete={handleNoteDelete}
          onRename={handleNoteStartRename}
        />
      )}
    </div>
  );
}

export function FolderTree() {
  const { settings } = useSettingsStore();

  if (!settings.notesDirectory) return null;

  return (
    <div className="folder-tree">
      <FolderNode folder={null} depth={0} notesDir={settings.notesDirectory} />
    </div>
  );
}
