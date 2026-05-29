import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  NextcloudLoginPoll,
  NextcloudLoginStart,
  NextcloudAccount,
  SyncStatus,
  SyncSummary,
} from '../types/sync';
import { useNotesStore } from './notesStore';
import { useSettingsStore } from './settingsStore';
import { debugLog } from '../utils/debugLogger';
import { openExternalUrl } from '../utils/externalOpen';

interface SyncState {
  isConnecting: boolean;
  isSyncing: boolean;
  error: string | null;
  lastSummary: SyncSummary | null;
  loginSessionId: string | null;

  connectNextcloud: (serverUrl: string) => Promise<NextcloudAccount>;
  disconnectNextcloud: () => Promise<void>;
  syncNow: () => Promise<SyncSummary | null>;
  loadStatus: () => Promise<SyncStatus | null>;
  ensureNextcloudNotesDirectory: () => Promise<string | null>;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentProfileId() {
  return useSettingsStore.getState().root.activeProfileId;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isConnecting: false,
  isSyncing: false,
  error: null,
  lastSummary: null,
  loginSessionId: null,

  ensureNextcloudNotesDirectory: async () => {
    const settingsState = useSettingsStore.getState();
    const profileId = settingsState.root.activeProfileId;
    const { settings } = settingsState;

    if (settings.sync.provider !== 'nextcloud' || !settings.sync.enabled) {
      return settings.notesDirectory || null;
    }

    const defaultDir = await invoke<string>('get_default_notes_dir', { profileId });
    const latestSettingsState = useSettingsStore.getState();

    if (
      latestSettingsState.root.activeProfileId === profileId &&
      latestSettingsState.settings.notesDirectory !== defaultDir
    ) {
      latestSettingsState.setNotesDirectory(defaultDir);
    }

    return defaultDir;
  },

  connectNextcloud: async (serverUrl: string) => {
    set({ isConnecting: true, error: null });
    const profileId = currentProfileId();
    try {
      const login = await invoke<NextcloudLoginStart>('nextcloud_login_start', {
        serverUrl,
      });
      set({ loginSessionId: login.sessionId });
      await openExternalUrl(login.loginUrl);

      const started = Date.now();
      while (Date.now() - started < 20 * 60 * 1000) {
        await delay(1500);
        const result = await invoke<NextcloudLoginPoll>('nextcloud_login_poll', {
          sessionId: login.sessionId,
          profileId,
        });

        if (result.status === 'complete') {
          const settingsStore = useSettingsStore.getState();
          settingsStore.setNextcloudConnected(result.account);
          await get().ensureNextcloudNotesDirectory();
          set({ isConnecting: false, loginSessionId: null });
          return result.account;
        }
      }

      throw new Error('Nextcloud login timed out');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog.error('Failed to connect Nextcloud:', error);
      set({ error: message, isConnecting: false, loginSessionId: null });
      throw error;
    }
  },

  disconnectNextcloud: async () => {
    const profileId = currentProfileId();
    set({ error: null });
    try {
      await invoke('nextcloud_disconnect', { profileId });
    } catch (error) {
      debugLog.error('Failed to remove Nextcloud credentials:', error);
      // Keep disconnect local even if the credential was already gone.
    }
    useSettingsStore.getState().disconnectNextcloud();
  },

  syncNow: async () => {
    const { isSyncing } = get();
    if (isSyncing) return null;

    const settingsState = useSettingsStore.getState();
    const profileId = settingsState.root.activeProfileId;
    const { settings } = settingsState;
    if (settings.sync.provider !== 'nextcloud' || !settings.sync.enabled) {
      return null;
    }

    const notesDirectory = await get().ensureNextcloudNotesDirectory();

    set({ isSyncing: true, error: null });
    settingsState.setSyncSettings({
      lastSyncStatus: 'syncing',
      lastSyncError: null,
    });

    try {
      const summary = await invoke<SyncSummary>('sync_now', {
        profileId,
        remoteFolder: settings.sync.remoteFolder || 'Noteban',
      });

      set({ isSyncing: false, lastSummary: summary });
      settingsState.setSyncSettings({
        lastSyncStatus: summary.errors.length > 0 ? 'error' : 'ok',
        lastSyncAt: summary.finishedAt,
        lastSyncError: summary.errors[0] || null,
        conflicts: summary.conflicts,
      });

      if (notesDirectory) {
        await useNotesStore.getState().loadNotes(notesDirectory);
      }

      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLog.error('Sync failed:', error);
      set({ error: message, isSyncing: false });
      settingsState.setSyncSettings({
        lastSyncStatus: 'error',
        lastSyncAt: new Date().toISOString(),
        lastSyncError: message,
      });
      throw error;
    }
  },

  loadStatus: async () => {
    const profileId = currentProfileId();
    try {
      const status = await invoke<SyncStatus>('get_sync_status', { profileId });
      useSettingsStore.getState().setSyncSettings({
        lastSyncStatus: status.status,
        lastSyncAt: status.lastSyncAt,
        lastSyncError: status.lastError,
        conflicts: status.conflicts,
      });
      return status;
    } catch (error) {
      debugLog.error('Failed to load sync status:', error);
      return null;
    }
  },
}));
