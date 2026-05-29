import { useCallback, useEffect } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useUpdateStore, useSettingsStore } from '../stores';
import { debugLog } from '../utils/debugLogger';
import { openExternalUrl } from '../utils/externalOpen';
import { isIOS, isLinux } from '../utils/platform';
const GITHUB_RELEASES_URL = 'https://github.com/noteban/noteban/releases/latest';

// Set to true to mock update availability in dev mode
const DEV_MOCK_UPDATE = false;

// Module-level variable to store the Update object so it's shared across all hook instances
let updateObject: Update | null = null;

export function useUpdater() {
  const {
    isChecking,
    updateAvailable,
    error,
    isDownloading,
    downloadProgress,
    dismissedVersion,
    setChecking,
    setUpdateAvailable,
    setError,
    setDownloading,
    setDownloadProgress,
    dismissUpdate,
    resetDismissal,
  } = useUpdateStore();

  const disableUpdateChecks = useSettingsStore((state) => state.root.disableUpdateChecks);
  const isUpdateSupported = !isIOS;

  const checkForUpdates = useCallback(async (manual = true) => {
    if (isChecking) return;
    if (!isUpdateSupported) {
      updateObject = null;
      setUpdateAvailable(null);
      return;
    }

    // Manual check should reset dismissal so notification shows again
    if (manual) {
      resetDismissal();
    }

    debugLog.log('Starting update check...');
    setChecking(true);
    setError(null);

    try {
      // Dev mode mock for testing UI
      if (import.meta.env.DEV && DEV_MOCK_UPDATE) {
        debugLog.log('Using mock update (dev mode)');
        setUpdateAvailable({
          version: '99.0.0',
          notes: 'Test update for development',
          date: new Date().toISOString(),
        });
        setChecking(false);
        return;
      }

      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        debugLog.log('Update available:', { version: update.version, date: update.date });
        updateObject = update;
        setUpdateAvailable({
          version: update.version,
          notes: update.body || 'See release notes on GitHub.',
          date: update.date || new Date().toISOString(),
        });
      } else {
        debugLog.log('No update available, app is up to date');
        updateObject = null;
        setUpdateAvailable(null);
      }
    } catch (err) {
      debugLog.error('Failed to check for updates:', err);
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
    } finally {
      setChecking(false);
    }
  }, [isChecking, isUpdateSupported, setChecking, setError, setUpdateAvailable, resetDismissal]);

  const downloadAndInstall = useCallback(async () => {
    if (!isUpdateSupported) {
      return;
    }

    if (isLinux) {
      await openExternalUrl(GITHUB_RELEASES_URL);
      return;
    }

    if (!updateObject) {
      setError('No update available');
      return;
    }

    setDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      let downloaded = 0;
      let contentLength = 0;

      await updateObject.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            setDownloadProgress(0);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress((downloaded / contentLength) * 100);
            }
            break;
          case 'Finished':
            setDownloadProgress(100);
            break;
        }
      });

      await relaunch();
    } catch (err) {
      debugLog.error('Failed to download/install update:', err);
      setError(err instanceof Error ? err.message : 'Failed to install update');
    } finally {
      setDownloading(false);
    }
  }, [isUpdateSupported, setDownloading, setError, setDownloadProgress]);

  const openReleasesPage = useCallback(async () => {
    await openExternalUrl(GITHUB_RELEASES_URL);
  }, []);

  // Check for updates on mount with a small delay (unless disabled)
  useEffect(() => {
    if (disableUpdateChecks) {
      debugLog.log('Update checks disabled by user setting');
      return;
    }
    if (!isUpdateSupported) {
      debugLog.log('Update checks disabled on iOS');
      updateObject = null;
      setUpdateAvailable(null);
      return;
    }

    debugLog.log('Scheduling automatic update check in 2 seconds...');
    const timer = setTimeout(() => {
      checkForUpdates(false); // Automatic check, don't reset dismissal
    }, 2000);

    return () => clearTimeout(timer);
  }, [disableUpdateChecks, isUpdateSupported, checkForUpdates, setUpdateAvailable]);

  return {
    isChecking,
    updateAvailable,
    error,
    isDownloading,
    downloadProgress,
    dismissedVersion,
    isLinux,
    isUpdateSupported,
    checkForUpdates: () => checkForUpdates(true), // External calls are manual
    downloadAndInstall,
    openReleasesPage,
    dismissUpdate,
  };
}
