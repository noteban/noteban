import { useEffect, useRef, useState } from 'react';
import { FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useFolderStore, useSettingsStore, useNotesStore } from '../../stores';
import type { Folder } from '../../types/folder';
import './ContextMenu.css';

interface FolderContextMenuProps {
  folder: Folder | null;
  x: number;
  y: number;
  onClose: () => void;
}

export function FolderContextMenu({
  folder,
  x,
  y,
  onClose,
}: FolderContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { createFolder, renameFolder, deleteFolder } = useFolderStore();
  const { loadNotes } = useNotesStore();
  const { settings } = useSettingsStore();
  const [mode, setMode] = useState<'menu' | 'create' | 'rename'>('menu');
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleCreateFolder = async () => {
    if (!settings.notesDirectory || !inputValue.trim()) return;
    try {
      await createFolder(
        settings.notesDirectory,
        inputValue.trim(),
        folder?.relative_path
      );
      onClose();
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleRename = async () => {
    if (!folder || !inputValue.trim()) return;
    try {
      await renameFolder(folder.path, inputValue.trim());
      if (settings.notesDirectory) {
        await loadNotes(settings.notesDirectory);
      }
      onClose();
    } catch (error) {
      console.error('Failed to rename folder:', error);
    }
  };

  const handleDelete = async () => {
    if (!folder) return;
    if (confirm(`Delete folder "${folder.name}" and all its contents?`)) {
      try {
        await deleteFolder(folder.path);
        if (settings.notesDirectory) {
          await loadNotes(settings.notesDirectory);
        }
        onClose();
      } catch (error) {
        console.error('Failed to delete folder:', error);
      }
    }
  };

  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 150);

  if (mode === 'create' || mode === 'rename') {
    return (
      <div
        ref={menuRef}
        className="context-menu"
        style={{ left: adjustedX, top: adjustedY }}
      >
        <div style={{ padding: 'var(--spacing-sm)' }}>
          <input
            type="text"
            className="context-menu-input"
            placeholder={mode === 'create' ? 'Folder name...' : 'New name...'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (mode === 'create') {
                  handleCreateFolder();
                } else {
                  handleRename();
                }
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            autoFocus
            style={{
              width: '100%',
              padding: 'var(--spacing-sm)',
              fontSize: 'var(--font-size-sm)',
              backgroundColor: 'var(--ctp-surface1)',
              color: 'var(--text-primary)',
              border: '1px solid var(--ctp-surface2)',
              borderRadius: 'var(--radius-sm)',
              outline: 'none',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <button
        className="context-menu-item"
        onClick={() => {
          setMode('create');
          setInputValue('');
        }}
      >
        <FolderPlus size={14} />
        <span>New Subfolder</span>
      </button>
      {folder && (
        <>
          <button
            className="context-menu-item"
            onClick={() => {
              setMode('rename');
              setInputValue(folder.name);
            }}
          >
            <Pencil size={14} />
            <span>Rename</span>
          </button>
          <button
            className="context-menu-item context-menu-item-danger"
            onClick={handleDelete}
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </>
      )}
    </div>
  );
}
