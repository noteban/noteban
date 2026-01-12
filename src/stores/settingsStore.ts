import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { DEFAULT_COLUMNS } from '../types/kanban';

interface SettingsState {
  settings: AppSettings;
  setNotesDirectory: (dir: string) => void;
  setEditorFontSize: (size: number) => void;
  setAutoSaveDelay: (delay: number) => void;
  setDefaultView: (view: 'notes' | 'kanban') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        ...DEFAULT_SETTINGS,
        columns: DEFAULT_COLUMNS,
      },

      setNotesDirectory: (dir) =>
        set((state) => ({
          settings: { ...state.settings, notesDirectory: dir },
        })),

      setEditorFontSize: (size) =>
        set((state) => ({
          settings: { ...state.settings, editorFontSize: size },
        })),

      setAutoSaveDelay: (delay) =>
        set((state) => ({
          settings: { ...state.settings, autoSaveDelay: delay },
        })),

      setDefaultView: (view) =>
        set((state) => ({
          settings: { ...state.settings, defaultView: view },
        })),
    }),
    {
      name: 'notes-kanban-settings',
    }
  )
);
