import { create } from 'zustand';

export interface UpdateInfo {
  version: string;
  notes: string;
  date: string;
}

interface UpdateState {
  isChecking: boolean;
  updateAvailable: UpdateInfo | null;
  error: string | null;
  isDownloading: boolean;
  downloadProgress: number;
  dismissedVersion: string | null;

  setChecking: (checking: boolean) => void;
  setUpdateAvailable: (update: UpdateInfo | null) => void;
  setError: (error: string | null) => void;
  setDownloading: (downloading: boolean) => void;
  setDownloadProgress: (progress: number) => void;
  dismissUpdate: (version: string) => void;
  resetDismissal: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  isChecking: false,
  updateAvailable: null,
  error: null,
  isDownloading: false,
  downloadProgress: 0,
  dismissedVersion: null,

  setChecking: (checking) => set({ isChecking: checking }),
  setUpdateAvailable: (update) => set({ updateAvailable: update }),
  setError: (error) => set({ error }),
  setDownloading: (downloading) => set({ isDownloading: downloading }),
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
  dismissUpdate: (version) => set({ dismissedVersion: version }),
  resetDismissal: () => set({ dismissedVersion: null }),
}));
