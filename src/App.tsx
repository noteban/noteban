import { useEffect, useState, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { watchImmediate } from '@tauri-apps/plugin-fs';
import type { UnwatchFn } from '@tauri-apps/plugin-fs';
import { Layout } from './components/layout';
import { MarkdownEditor } from './components/editor';
import { KanbanBoard } from './components/kanban';
import { useNotesStore } from './stores/notesStore';
import { useSettingsStore } from './stores/settingsStore';
import { useUIStore } from './stores/uiStore';
import './styles/globals.css';

function App() {
  const { loadNotes } = useNotesStore();
  const { settings, setNotesDirectory } = useSettingsStore();
  const { currentView } = useUIStore();
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);

  // Load notes when directory changes
  useEffect(() => {
    if (settings.notesDirectory) {
      loadNotes(settings.notesDirectory);
    }
  }, [settings.notesDirectory, loadNotes]);

  // Watch for external file changes
  useEffect(() => {
    if (!settings.notesDirectory) return;

    let unwatch: UnwatchFn | null = null;

    const startWatching = async () => {
      try {
        console.log('Starting file watcher for:', settings.notesDirectory);
        unwatch = await watchImmediate(settings.notesDirectory, (event) => {
          console.log('File change detected:', event.type, event.paths);

          // Only reload for relevant file events
          const isRelevant = event.paths.some(p => p.endsWith('.md'));
          if (!isRelevant) {
            console.log('Ignoring non-md file change');
            return;
          }

          // Debounce to avoid rapid reloads during sync
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = window.setTimeout(() => {
            console.log('Reloading notes...');
            loadNotes(settings.notesDirectory);
          }, 500);
        }, { recursive: true });
        console.log('File watcher started successfully');
      } catch (error) {
        console.error('Failed to watch directory:', error);
      }
    };

    startWatching();

    return () => {
      if (unwatch) unwatch();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [settings.notesDirectory, loadNotes]);

  const handleSelectFolder = async () => {
    setIsSelectingFolder(true);
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
    } finally {
      setIsSelectingFolder(false);
    }
  };

  if (!settings.notesDirectory) {
    return (
      <div className="app-setup">
        <div className="app-setup-content">
          <h1 className="app-setup-title">Welcome to Notes</h1>
          <p className="app-setup-description">
            Select a folder where your notes will be stored as markdown files.
          </p>
          <button
            className="app-setup-button"
            onClick={handleSelectFolder}
            disabled={isSelectingFolder}
          >
            {isSelectingFolder ? 'Selecting...' : 'Choose Notes Folder'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      {currentView === 'notes' ? (
        <MarkdownEditor />
      ) : (
        <KanbanBoard />
      )}
    </Layout>
  );
}

export default App;
