import { useEffect, useState, useRef, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { watchImmediate } from '@tauri-apps/plugin-fs';
import { exit } from '@tauri-apps/plugin-process';
import type { UnwatchFn } from '@tauri-apps/plugin-fs';
import { Layout } from './components/layout';
import { NoteEditor } from './components/editor';
import { KanbanBoard } from './components/kanban';
import { useNotesStore } from './stores/notesStore';
import { useSettingsStore } from './stores/settingsStore';
import { useUIStore } from './stores/uiStore';
import type { FileChangeEvent } from './types/folder';
import './styles/globals.css';

// Map Tauri watch event types to our change event types
function mapWatchEventType(type: string): FileChangeEvent['event_type'] {
  if (type.includes('create')) return 'create';
  if (type.includes('remove') || type.includes('delete')) return 'remove';
  return 'modify';
}

function App() {
  const { loadNotes, setActiveNote, initializeCache, processFileChanges, cacheInitialized } =
    useNotesStore();
  const { settings, root, setNotesDirectory } = useSettingsStore();
  const { currentView, setView } = useUIStore();
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  const pendingChangesRef = useRef<FileChangeEvent[]>([]);

  // Track previous profile to detect switches
  const prevProfileIdRef = useRef<string>(root.activeProfileId);

  // Initialize cache when profile changes
  useEffect(() => {
    initializeCache(root.activeProfileId);
  }, [root.activeProfileId, initializeCache]);

  // Handle profile switches - clear active note and set view
  useEffect(() => {
    if (prevProfileIdRef.current !== root.activeProfileId) {
      // Profile changed - clear UI state
      setActiveNote(null);

      // Set view to profile's default view
      if (settings.defaultView !== currentView) {
        setView(settings.defaultView);
      }

      prevProfileIdRef.current = root.activeProfileId;
    }
  }, [root.activeProfileId, settings.defaultView, currentView, setActiveNote, setView]);

  // Load notes when directory changes (includes profile switches)
  useEffect(() => {
    if (settings.notesDirectory && cacheInitialized) {
      loadNotes(settings.notesDirectory);
    }
  }, [settings.notesDirectory, cacheInitialized, loadNotes]);

  // Handle quit shortcut (Ctrl+Q / Cmd+Q)
  const handleQuitShortcut = useCallback((e: KeyboardEvent) => {
    if (e.key === 'q' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      exit(0);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleQuitShortcut);
    return () => document.removeEventListener('keydown', handleQuitShortcut);
  }, [handleQuitShortcut]);

  // Watch for external file changes - use incremental updates
  useEffect(() => {
    if (!settings.notesDirectory || !cacheInitialized) return;

    let unwatch: UnwatchFn | null = null;

    const startWatching = async () => {
      try {
        unwatch = await watchImmediate(
          settings.notesDirectory,
          (event) => {
            // Only process markdown file events
            const mdPaths = event.paths.filter((p) => p.endsWith('.md'));
            if (mdPaths.length === 0) return;

            // Map watch events to our change format
            const eventType = mapWatchEventType(
              typeof event.type === 'string' ? event.type : JSON.stringify(event.type)
            );
            const changes: FileChangeEvent[] = mdPaths.map((p) => ({
              event_type: eventType,
              file_path: p,
            }));

            // Accumulate changes
            pendingChangesRef.current.push(...changes);

            // Debounce to batch rapid changes
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = window.setTimeout(() => {
              const batchedChanges = [...pendingChangesRef.current];
              pendingChangesRef.current = [];

              // Process incrementally instead of full reload
              processFileChanges(settings.notesDirectory, batchedChanges);
            }, 500);
          },
          { recursive: true }
        );
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
      pendingChangesRef.current = [];
    };
  }, [settings.notesDirectory, cacheInitialized, processFileChanges]);

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

  // Get active profile for display
  const activeProfile = root.profiles.find(p => p.id === root.activeProfileId);

  if (!settings.notesDirectory) {
    return (
      <div className="app-setup">
        <div className="app-setup-content">
          <h1 className="app-setup-title">Welcome to Notes</h1>
          {activeProfile && root.profiles.length > 1 && (
            <p className="app-setup-profile">
              Setting up profile: <strong>{activeProfile.name}</strong>
            </p>
          )}
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
        <NoteEditor />
      ) : (
        <KanbanBoard />
      )}
    </Layout>
  );
}

export default App;
