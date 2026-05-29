import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen, X } from 'lucide-react';
import { useFolderStore, useNotesStore } from '../../stores';
import { debugLog } from '../../utils/debugLogger';
import type { Note } from '../../types/note';
import './MoveNoteModal.css';

export interface MoveNoteModalProps {
  note: Note;
  notesDir: string;
  onClose: () => void;
}

interface DestinationOption {
  path: string;
  name: string;
  relativePath: string;
  depth: number;
}

function currentRelativeFolder(filePath: string, notesDir: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/';
  const lastSep = filePath.lastIndexOf(sep);
  const dir = lastSep > 0 ? filePath.substring(0, lastSep) : '';
  if (!dir.startsWith(notesDir)) return '';
  return dir
    .substring(notesDir.length)
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/');
}

export function MoveNoteModal({ note, notesDir, onClose }: MoveNoteModalProps) {
  const folders = useFolderStore((s) => s.folders);
  const moveNote = useNotesStore((s) => s.moveNote);

  const currentRel = useMemo(
    () => currentRelativeFolder(note.file_path, notesDir),
    [note.file_path, notesDir],
  );

  const options: DestinationOption[] = useMemo(() => {
    const root: DestinationOption = {
      path: notesDir,
      name: 'Notes',
      relativePath: '',
      depth: 0,
    };
    const fromFolders = folders
      .map<DestinationOption>((f) => ({
        path: f.path,
        name: f.name,
        relativePath: f.relative_path,
        depth: f.relative_path.split(/[/\\]/).length,
      }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return [root, ...fromFolders];
  }, [folders, notesDir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSelect = async (targetPath: string) => {
    try {
      await moveNote(note.file_path, targetPath);
    } catch (error) {
      debugLog.error('Failed to move note:', error);
    }
    onClose();
  };

  const target = typeof document !== 'undefined' ? document.body : null;
  if (!target) return null;

  return createPortal(
    <div className="move-note-overlay" onClick={onClose}>
      <div
        className="move-note-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Move note"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="move-note-header">
          <div className="move-note-title">
            <span className="move-note-eyebrow">Move</span>
            <span className="move-note-name">{note.frontmatter.title}</span>
          </div>
          <button
            type="button"
            className="move-note-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>
        <ul className="move-note-list">
          {options.map((opt) => {
            const isCurrent = opt.relativePath === currentRel;
            return (
              <li key={opt.relativePath || '__root__'}>
                <button
                  type="button"
                  className="move-note-item"
                  data-current={isCurrent ? 'true' : 'false'}
                  disabled={isCurrent}
                  style={{ paddingLeft: `${opt.depth * 16 + 12}px` }}
                  onClick={() => handleSelect(opt.path)}
                >
                  {opt.depth === 0 ? <FolderOpen size={16} /> : <Folder size={16} />}
                  <span className="move-note-item-label">{opt.name}</span>
                  {isCurrent && <span className="move-note-item-badge">Current</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    target,
  );
}
