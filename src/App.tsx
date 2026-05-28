import { useEffect, useState, useRef, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { watchImmediate } from '@tauri-apps/plugin-fs';
import { exit } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import type { UnwatchFn } from '@tauri-apps/plugin-fs';
import { Layout, SettingsModal } from './components/layout';
import { NoteEditor } from './components/editor';
import { KanbanBoard } from './components/kanban';
import { useNotesStore } from './stores/notesStore';
import { useSettingsStore } from './stores/settingsStore';
import { useUIStore } from './stores/uiStore';
import { useSyncStore } from './stores/syncStore';
import type { FileChangeEvent } from './types/folder';
import { initDebugLogging, debugLog } from './utils/debugLogger';
import { setWindowTitle } from './utils/windowTitle';
import { isMobile } from './utils/platform';
import './styles/globals.css';

// Map Tauri watch event types to our change event types
function mapWatchEventType(type: string): FileChangeEvent['event_type'] {
  if (type.includes('create')) return 'create';
  if (type.includes('remove') || type.includes('delete')) return 'remove';
  return 'modify';
}

function App() {
  const { notes, loadNotes, setActiveNote, initializeCache, processFileChanges, cacheInitialized } =
    useNotesStore();
  const { settings, root, setNotesDirectory } = useSettingsStore();
  const { currentView, setView, setShowSettings } = useUIStore();
  const { syncNow, loadStatus, ensureNextcloudNotesDirectory } = useSyncStore();
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  const pendingChangesRef = useRef<FileChangeEvent[]>([]);
  const autoSyncTimerRef = useRef<number | null>(null);
  const lastAutoSyncRef = useRef(0);
  const prevNotesSignatureRef = useRef('');

  // Track previous profile to detect switches
  const prevProfileIdRef = useRef<string>(root.activeProfileId);

  // Initialize cache when profile changes
  useEffect(() => {
    initializeCache(root.activeProfileId);
  }, [root.activeProfileId, initializeCache]);

  // Initialize debug logging when enabled
  useEffect(() => {
    if (root.enableDebugLogging) {
      initDebugLogging();
    }
  }, [root.enableDebugLogging]);

  useEffect(() => {
    if (settings.sync.provider === 'nextcloud') {
      loadStatus();
    }
  }, [root.activeProfileId, settings.sync.provider, loadStatus]);

  useEffect(() => {
    if (
      settings.sync.provider !== 'nextcloud' ||
      !settings.sync.enabled ||
      !cacheInitialized
    ) {
      return;
    }

    ensureNextcloudNotesDirectory().catch((error) => {
      debugLog.error('Failed to prepare Nextcloud notes directory:', error);
    });
  }, [
    root.activeProfileId,
    settings.sync.provider,
    settings.sync.enabled,
    settings.notesDirectory,
    cacheInitialized,
    ensureNextcloudNotesDirectory,
  ]);

  // Check for initial profile from command line argument and set window title
  useEffect(() => {
    const initializeWindow = async () => {
      try {
        const initialProfileId = await invoke<string | null>('get_initial_profile');
        const state = useSettingsStore.getState();

        if (initialProfileId && initialProfileId !== state.root.activeProfileId) {
          // Verify the profile exists and switch to it
          const profileExists = state.root.profiles.some(p => p.id === initialProfileId);
          if (profileExists) {
            state.switchProfile(initialProfileId);
          }
        }

        // Set window title after any profile switch
        const currentState = useSettingsStore.getState();
        const activeProfile = currentState.root.profiles.find(
          p => p.id === currentState.root.activeProfileId
        );
        setWindowTitle(activeProfile?.name ?? null, currentState.root.profiles.length > 1);
      } catch (error) {
        debugLog.error('Failed to initialize window:', error);
      }
    };
    initializeWindow();
  }, []);

  // Update window title when profile changes
  useEffect(() => {
    const activeProfile = root.profiles.find(p => p.id === root.activeProfileId);
    setWindowTitle(activeProfile?.name ?? null, root.profiles.length > 1);
  }, [root.activeProfileId, root.profiles]);

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
    if (isMobile) return;
    if (e.key === 'q' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      exit(0);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleQuitShortcut);
    return () => document.removeEventListener('keydown', handleQuitShortcut);
  }, [handleQuitShortcut]);

  const scheduleAutoSync = useCallback((delayMs = 8000) => {
    if (
      settings.sync.provider !== 'nextcloud' ||
      !settings.sync.enabled ||
      !settings.notesDirectory ||
      !cacheInitialized
    ) {
      return;
    }

    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = window.setTimeout(() => {
      const now = Date.now();
      if (now - lastAutoSyncRef.current < 30_000) {
        return;
      }
      lastAutoSyncRef.current = now;
      syncNow().catch((error) => {
        debugLog.error('Automatic sync failed:', error);
      });
    }, delayMs);
  }, [
    settings.sync.provider,
    settings.sync.enabled,
    settings.notesDirectory,
    cacheInitialized,
    syncNow,
  ]);

  useEffect(() => {
    if (settings.sync.provider === 'nextcloud' && settings.sync.enabled && settings.notesDirectory) {
      scheduleAutoSync(1000);
    }

    return () => {
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
      }
    };
  }, [
    root.activeProfileId,
    settings.sync.provider,
    settings.sync.enabled,
    settings.notesDirectory,
    scheduleAutoSync,
  ]);

  useEffect(() => {
    const signature = notes
      .map((note) => `${note.frontmatter.id}:${note.frontmatter.modified}:${note.file_path}`)
      .join('|');
    if (!signature || signature === prevNotesSignatureRef.current) {
      prevNotesSignatureRef.current = signature;
      return;
    }
    prevNotesSignatureRef.current = signature;
    scheduleAutoSync();
  }, [notes, scheduleAutoSync]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleAutoSync(500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scheduleAutoSync]);

  // Watch for external file changes - use incremental updates
  useEffect(() => {
    if (!settings.notesDirectory || !cacheInitialized || isMobile) return;

    let unwatch: UnwatchFn | null = null;

    const startWatching = async () => {
      try {
        debugLog.log('Starting file watcher for directory:', settings.notesDirectory);
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

            debugLog.log('File watcher event:', { type: eventType, paths: mdPaths });

            // Accumulate changes
            pendingChangesRef.current.push(...changes);

            // Debounce to batch rapid changes
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = window.setTimeout(() => {
              const batchedChanges = [...pendingChangesRef.current];
              pendingChangesRef.current = [];

              debugLog.log(`Processing ${batchedChanges.length} batched file changes`);
              // Process incrementally instead of full reload
              processFileChanges(settings.notesDirectory, batchedChanges);
            }, 500);
          },
          { recursive: true }
        );
        debugLog.log('File watcher started successfully');
      } catch (error) {
        debugLog.error('Failed to start file watcher:', error);
      }
    };

    startWatching();

    return () => {
      if (unwatch) {
        debugLog.log('Stopping file watcher');
        unwatch();
      }
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
      debugLog.error('Failed to select folder:', error);
    } finally {
      setIsSelectingFolder(false);
    }
  };

  const handleUseLocalStorage = async () => {
    try {
      const dir = await invoke<string>('get_default_notes_dir', {
        profileId: root.activeProfileId,
      });
      setNotesDirectory(dir);
    } catch (error) {
      debugLog.error('Failed to prepare local notes directory:', error);
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
            {isMobile
              ? 'Connect Nextcloud to sync your markdown notes, or keep a local notebook on this device.'
              : 'Select a folder where your notes will be stored as markdown files.'}
          </p>
          {isMobile ? (
            <div className="app-setup-actions">
              <button
                className="app-setup-button"
                onClick={() => setShowSettings(true)}
              >
                Connect Nextcloud
              </button>
              <button
                className="app-setup-button secondary"
                onClick={handleUseLocalStorage}
              >
                Use Local Only
              </button>
            </div>
          ) : (
            <button
              className="app-setup-button"
              onClick={handleSelectFolder}
              disabled={isSelectingFolder}
            >
              {isSelectingFolder ? 'Selecting...' : 'Choose Notes Folder'}
            </button>
          )}
        </div>
        <SettingsModal />
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
