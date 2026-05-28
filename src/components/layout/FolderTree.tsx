import { useState, useMemo, useRef, useEffect } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { PieMenu, usePieMenu } from '@noteban/pie-menu';
import type { PieMenuItem, PieMenuOrigin } from '@noteban/pie-menu';
import { useFolderStore, useNotesStore, useSettingsStore, useUIStore } from '../../stores';
import { FolderContextMenu } from './FolderContextMenu';
import { ContextMenu } from './ContextMenu';
import { useTags } from '../../hooks/useTags';
import { matchesTagFilter } from '../../utils/tagFilterMatcher';
import { hasTagFilter } from '../../utils/tagFilterParser';
import { debugLog } from '../../utils/debugLogger';
import { isMobile } from '../../utils/platform';
import type { Folder as FolderType } from '../../types/folder';
import type { Note } from '../../types/note';
import './FolderTree.css';

type TriggerProps = HTMLAttributes<HTMLElement>;

interface MobilePieMenuTriggerProps {
  enabled: boolean;
  items: PieMenuItem[] | ((origin: PieMenuOrigin) => PieMenuItem[]);
  children: (triggerProps: TriggerProps) => ReactNode;
}

function MobilePieMenuTrigger({ enabled, items, children }: MobilePieMenuTriggerProps) {
  const pie = usePieMenu({
    enableContextMenu: true,
    enableLongPress: enabled,
    movementTolerance: 10,
  });

  if (!enabled) {
    return <>{children({})}</>;
  }

  const resolvedItems = typeof items === 'function' ? items(pie.origin) : items;

  return (
    <>
      {children({
        ...pie.triggerProps,
        onClickCapture: (event) => {
          if (pie.open) {
            event.preventDefault();
            event.stopPropagation();
          }
        },
      })}
      <PieMenu
        open={pie.open}
        origin={pie.origin}
        items={resolvedItems}
        onClose={pie.close}
        maxPerPage={4}
        size={216}
        deadZoneRatio={0.28}
        blur
        blurStrength={5}
        className="noteban-mobile-pie-menu"
      />
    </>
  );
}

interface FolderNodeProps {
  folder: FolderType | null;
  depth: number;
  notesDir: string;
}

function FolderNode({ folder, depth, notesDir }: FolderNodeProps) {
  const { folders, expandedFolders, toggleFolder, selectedFolder, selectFolder, deleteFolder } =
    useFolderStore();
  const { notes, activeNoteId, setActiveNote, deleteNote, updateNote, loadNotes } = useNotesStore();
  const { tagFilter, searchQuery, setMobileSidebarOpen } = useUIStore();
  const { root } = useSettingsStore();
  const { getNoteTags } = useTags();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    initialMode?: 'menu' | 'create' | 'rename';
  } | null>(null);
  const [noteContextMenu, setNoteContextMenu] = useState<{ note: Note; x: number; y: number } | null>(null);
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const useMobilePieMenu = isMobile && root.mobileInteractionMode === 'pie';

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
      // Handle both Windows (\) and Unix (/) path separators
      const lastSepIndex = Math.max(note.file_path.lastIndexOf('/'), note.file_path.lastIndexOf('\\'));
      const noteDir = lastSepIndex > 0 ? note.file_path.substring(0, lastSepIndex) : '';
      // Detect separator used in notesDir and use it for path construction
      const sep = notesDir.includes('\\') ? '\\' : '/';
      const expectedDir = relativePath ? `${notesDir}${sep}${relativePath.replace(/\//g, sep)}` : notesDir;
      return noteDir === expectedDir;
    });

    // Apply tag filter
    if (hasTagFilter(tagFilter)) {
      filtered = filtered.filter((note) => {
        const noteTags = getNoteTags(note.frontmatter.id);
        return matchesTagFilter(noteTags, tagFilter);
      });
    }

    // Apply search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((note) => {
        const noteTags = getNoteTags(note.frontmatter.id);
        return (
          note.frontmatter.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query) ||
          noteTags.some((tag) => tag.toLowerCase().includes(query))
        );
      });
    }

    return filtered;
  }, [notes, notesDir, relativePath, tagFilter, searchQuery, getNoteTags]);

  // Get child folders
  const childFolders = useMemo(() => {
    return folders.filter((f) => {
      // Handle both Windows (\) and Unix (/) path separators
      const parts = f.relative_path.split(/[/\\]/);
      const sep = f.relative_path.includes('\\') ? '\\' : '/';
      const parentPath = parts.slice(0, -1).join(sep);
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
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  };

  const handleNoteContextMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    setNoteContextMenu({ note, x: e.clientX, y: e.clientY });
  };

  const handleNoteDelete = async (note: Note) => {
    try {
      await deleteNote(note.file_path);
    } catch (error) {
      debugLog.error('Failed to delete note:', error);
    }
    setNoteContextMenu(null);
  };

  const handleNoteContextDelete = async () => {
    if (!noteContextMenu) return;
    await handleNoteDelete(noteContextMenu.note);
  };

  const handleNoteStartRename = (note: Note) => {
    setRenamingNoteId(note.frontmatter.id);
    setRenameValue(note.frontmatter.title);
    setNoteContextMenu(null);
  };

  const handleNoteContextStartRename = () => {
    if (!noteContextMenu) return;
    handleNoteStartRename(noteContextMenu.note);
  };

  const handleFolderDelete = async () => {
    if (!folder) return;
    if (!confirm(`Delete folder "${folder.name}" and all its contents?`)) return;

    try {
      await deleteFolder(folder.path);
      await loadNotes(notesDir);
    } catch (error) {
      debugLog.error('Failed to delete folder:', error);
    }
  };

  const handleRenameSubmit = async (note: Note) => {
    if (renameValue.trim() && renameValue !== note.frontmatter.title) {
      try {
        await updateNote({
          file_path: note.file_path,
          title: renameValue.trim(),
        });
      } catch (error) {
        debugLog.error('Failed to rename note:', error);
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

  const getFolderPieItems = (origin: PieMenuOrigin): PieMenuItem[] => [
    {
      id: 'select',
      label: 'Open',
      icon: isExpanded ? <FolderOpen size={18} /> : <Folder size={18} />,
      onSelect: handleSelect,
    },
    {
      id: 'new-folder',
      label: 'New',
      icon: <FolderPlus size={18} />,
      onSelect: () => setContextMenu({ x: origin.x, y: origin.y, initialMode: 'create' }),
    },
    ...(folder
      ? [
          {
            id: 'rename',
            label: 'Rename',
            icon: <Pencil size={18} />,
            onSelect: () => setContextMenu({ x: origin.x, y: origin.y, initialMode: 'rename' }),
          },
          {
            id: 'delete',
            label: 'Delete',
            icon: <Trash2 size={18} />,
            danger: true,
            onSelect: handleFolderDelete,
          },
        ]
      : []),
  ];

  const getNotePieItems = (note: Note): PieMenuItem[] => [
    {
      id: 'open',
      label: 'Open',
      icon: <FileText size={18} />,
      onSelect: () => handleNoteClick(note),
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: <Pencil size={18} />,
      onSelect: () => handleNoteStartRename(note),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 size={18} />,
      danger: true,
      onSelect: () => handleNoteDelete(note),
    },
  ];

  return (
    <div className="folder-node">
      <MobilePieMenuTrigger enabled={useMobilePieMenu} items={getFolderPieItems}>
        {(triggerProps) => (
          <div
            className={`folder-row ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={handleSelect}
            onContextMenu={useMobilePieMenu ? undefined : handleContextMenu}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            {...triggerProps}
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
        )}
      </MobilePieMenuTrigger>

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
            <MobilePieMenuTrigger
              key={note.frontmatter.id}
              enabled={useMobilePieMenu}
              items={getNotePieItems(note)}
            >
              {(triggerProps) => (
                <div
                  className={`folder-note ${
                    activeNoteId === note.frontmatter.id ? 'active' : ''
                  }`}
                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                  onClick={() => handleNoteClick(note)}
                  onContextMenu={useMobilePieMenu ? undefined : (e) => handleNoteContextMenu(e, note)}
                  draggable={!useMobilePieMenu && renamingNoteId !== note.frontmatter.id}
                  onDragStart={(e) => handleNoteDragStart(e, note)}
                  {...triggerProps}
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
              )}
            </MobilePieMenuTrigger>
          ))}
        </div>
      )}

      {contextMenu && (
        <FolderContextMenu
          folder={folder}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          initialMode={contextMenu.initialMode}
        />
      )}

      {noteContextMenu && (
        <ContextMenu
          x={noteContextMenu.x}
          y={noteContextMenu.y}
          onClose={() => setNoteContextMenu(null)}
          onDelete={handleNoteContextDelete}
          onRename={handleNoteContextStartRename}
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
