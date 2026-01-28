import { useState } from 'react';
import { Plus, FolderPlus, X, Tag } from 'lucide-react';
import { useNotesStore, useSettingsStore, useUIStore, useFolderStore } from '../../stores';
import { FolderTree } from './FolderTree';
import { TagCloud } from './TagCloud';
import { hasTagFilter } from '../../utils/tagFilterParser';
import { debugLog } from '../../utils/debugLogger';
import './Sidebar.css';

export function Sidebar() {
  const { createNote, setActiveNote } = useNotesStore();
  const { settings } = useSettingsStore();
  const { currentView, tagFilter, removeTagFromFilter, setOperatorAtIndex, clearTagFilter } = useUIStore();
  const { selectedFolder, createFolder } = useFolderStore();
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleNewNote = async () => {
    if (!settings.notesDirectory) return;
    try {
      const note = await createNote({
        notes_dir: settings.notesDirectory,
        folder_path: selectedFolder || undefined,
        title: 'Untitled',
        content: '',
        column: 'todo',
      });
      setActiveNote(note.frontmatter.id);
    } catch (error) {
      debugLog.error('Failed to create note:', error);
    }
  };

  const handleNewFolder = async () => {
    if (!settings.notesDirectory || !newFolderName.trim()) return;
    try {
      await createFolder(
        settings.notesDirectory,
        newFolderName.trim(),
        selectedFolder || undefined
      );
      setNewFolderName('');
      setIsCreatingFolder(false);
    } catch (error) {
      debugLog.error('Failed to create folder:', error);
    }
  };

  if (currentView === 'kanban') {
    return null;
  }

  const hasActiveFilter = hasTagFilter(tagFilter);

  const handleToggleOperator = (index: number) => {
    const currentOp = tagFilter.operators[index];
    setOperatorAtIndex(index, currentOp === 'AND' ? 'OR' : 'AND');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="sidebar-new-btn" onClick={handleNewNote}>
          <Plus size={16} />
          <span>New Note</span>
        </button>
        <button
          className="sidebar-folder-btn"
          onClick={() => setIsCreatingFolder(true)}
          title="New Folder"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      {isCreatingFolder && (
        <div className="sidebar-new-folder">
          <input
            type="text"
            placeholder="Folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewFolder();
              if (e.key === 'Escape') {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }
            }}
            onBlur={() => {
              if (!newFolderName.trim()) {
                setIsCreatingFolder(false);
              }
            }}
            autoFocus
          />
        </div>
      )}

      {hasActiveFilter && (
        <div className="sidebar-filter-indicator">
          <Tag size={12} />
          <div className="sidebar-filter-tags">
            {tagFilter.tags.map((tag, index) => (
              <span key={tag} className="sidebar-filter-tag-wrapper">
                {index > 0 && (
                  <button
                    className="sidebar-filter-operator"
                    onClick={() => handleToggleOperator(index - 1)}
                    title={`Click to switch to ${tagFilter.operators[index - 1] === 'AND' ? 'OR' : 'AND'}`}
                  >
                    {tagFilter.operators[index - 1] || 'AND'}
                  </button>
                )}
                <span className="sidebar-filter-tag">
                  {tag}
                  {tagFilter.tags.length > 1 && (
                    <button
                      className="sidebar-filter-tag-remove"
                      onClick={() => removeTagFromFilter(tag)}
                      title={`Remove ${tag}`}
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              </span>
            ))}
          </div>
          <button
            className="sidebar-filter-clear"
            onClick={clearTagFilter}
            title="Clear tag filter"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <FolderTree />
      <TagCloud />
    </aside>
  );
}
