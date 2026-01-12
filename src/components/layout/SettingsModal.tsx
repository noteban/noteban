import { useEffect, useRef } from 'react';
import { X, FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useSettingsStore, useUIStore } from '../../stores';
import './SettingsModal.css';

export function SettingsModal() {
  const { settings, setNotesDirectory, setEditorFontSize, setAutoSaveDelay } = useSettingsStore();
  const { showSettings, setShowSettings } = useUIStore();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettings(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings, setShowSettings]);

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Notes Folder',
      });
      if (selected && typeof selected === 'string') {
        setNotesDirectory(selected);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  if (!showSettings) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-modal" ref={modalRef}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button
            className="settings-close-btn"
            onClick={() => setShowSettings(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h3>Storage</h3>
            <div className="settings-field">
              <label>Notes Directory</label>
              <div className="settings-folder-input">
                <input
                  type="text"
                  value={settings.notesDirectory || 'Not set'}
                  readOnly
                />
                <button onClick={handleSelectFolder}>
                  <FolderOpen size={16} />
                  Browse
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>Editor</h3>
            <div className="settings-field">
              <label>Font Size</label>
              <div className="settings-range">
                <input
                  type="range"
                  min="12"
                  max="24"
                  value={settings.editorFontSize}
                  onChange={(e) => setEditorFontSize(Number(e.target.value))}
                />
                <span>{settings.editorFontSize}px</span>
              </div>
            </div>
            <div className="settings-field">
              <label>Auto-save Delay</label>
              <div className="settings-range">
                <input
                  type="range"
                  min="500"
                  max="5000"
                  step="500"
                  value={settings.autoSaveDelay}
                  onChange={(e) => setAutoSaveDelay(Number(e.target.value))}
                />
                <span>{settings.autoSaveDelay}ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
