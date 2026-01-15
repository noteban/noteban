import { useCallback, useEffect, useRef } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { open } from '@tauri-apps/plugin-shell';
import { useUpdateStore } from '../stores';

const isLinux = navigator.platform.toLowerCase().includes('linux');
const GITHUB_RELEASES_URL = 'https://github.com/i-doll/note-kanban/releases/latest';

// Set to true to mock update availability in dev mode
const DEV_MOCK_UPDATE = false;

export function useUpdater() {
  const {
    isChecking,
    updateAvailable,
    error,
    isDownloading,
    downloadProgress,
    isDismissed,
    setChecking,
    setUpdateAvailable,
    setError,
    setDownloading,
    setDownloadProgress,
    dismissUpdate,
  } = useUpdateStore();

  const updateRef = useRef<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    if (isChecking) return;

    setChecking(true);
    setError(null);

    try {
      // Dev mode mock for testing UI
      if (import.meta.env.DEV && DEV_MOCK_UPDATE) {
        setUpdateAvailable({
          version: '99.0.0',
          notes: 'Test update for development',
          date: new Date().toISOString(),
        });
        setChecking(false);
        return;
      }

      const update = await check();

      if (update) {
        updateRef.current = update;
        setUpdateAvailable({
          version: update.version,
          notes: update.body || 'See release notes on GitHub.',
          date: update.date || new Date().toISOString(),
        });
      } else {
        updateRef.current = null;
        setUpdateAvailable(null);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
    } finally {
      setChecking(false);
    }
  }, [isChecking, setChecking, setError, setUpdateAvailable]);

  const downloadAndInstall = useCallback(async () => {
    if (isLinux) {
      await open(GITHUB_RELEASES_URL);
      return;
    }

    if (!updateRef.current) {
      setError('No update available');
      return;
    }

    setDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      let downloaded = 0;
      let contentLength = 0;

      await updateRef.current.downloadAndInstall((event) => {
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
      console.error('Failed to download/install update:', err);
      setError(err instanceof Error ? err.message : 'Failed to install update');
    } finally {
      setDownloading(false);
    }
  }, [setDownloading, setError, setDownloadProgress]);

  const openReleasesPage = useCallback(async () => {
    await open(GITHUB_RELEASES_URL);
  }, []);

  // Check for updates on mount with a small delay
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdates();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return {
    isChecking,
    updateAvailable,
    error,
    isDownloading,
    downloadProgress,
    isDismissed,
    isLinux,
    checkForUpdates,
    downloadAndInstall,
    openReleasesPage,
    dismissUpdate,
  };
}
