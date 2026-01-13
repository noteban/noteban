import { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
} from 'lucide-react';
import { useFolderStore, useNotesStore, useSettingsStore, useUIStore } from '../../stores';
import { FolderContextMenu } from './FolderContextMenu';
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
  const { notes, activeNoteId, setActiveNote } = useNotesStore();
  const { filterTag, searchQuery } = useUIStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null
  );

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
              draggable
              onDragStart={(e) => handleNoteDragStart(e, note)}
            >
              <FileText size={14} />
              <span className="folder-note-title">{note.frontmatter.title}</span>
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
