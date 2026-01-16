import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettingsRoot, Profile, ProfileSettings, KanbanColumnSettings } from '../types/settings';
import { DEFAULT_PROFILE_SETTINGS, SETTINGS_SCHEMA_VERSION } from '../types/settings';
import { DEFAULT_COLUMNS } from '../types/kanban';
import { migrateSettings, createInitialRoot, generateProfileId } from '../utils/settingsMigration';
import { debugLog } from '../utils/debugLogger';

interface SettingsState {
  // Root state
  root: AppSettingsRoot;

  // Derived - active profile's settings for convenience
  settings: ProfileSettings;

  // Profile management
  createProfile: (name: string, copyFromId?: string) => string;
  renameProfile: (id: string, name: string) => void;
  deleteProfile: (id: string) => boolean;
  switchProfile: (id: string) => void;

  // Settings updates (operate on active profile)
  setNotesDirectory: (dir: string) => void;
  setEditorFontSize: (size: number) => void;
  setEditorFontFamily: (family: string) => void;
  setAutoSaveDelay: (delay: number) => void;
  setDefaultView: (view: 'notes' | 'kanban') => void;
  setColumns: (columns: KanbanColumnSettings[]) => void;

  // App-wide settings
  setDisableUpdateChecks: (disable: boolean) => void;
  setEnableDebugLogging: (enable: boolean) => void;

  // Getters
  getActiveProfile: () => Profile | undefined;
  getAllProfiles: () => Profile[];
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      // Helper to update active profile's settings
      const updateActiveProfileSettings = (
        updater: (settings: ProfileSettings) => ProfileSettings
      ) => {
        set((state) => {
          const newSettings = updater(state.settings);
          return {
            root: {
              ...state.root,
              profiles: state.root.profiles.map((p) =>
                p.id === state.root.activeProfileId
                  ? { ...p, settings: newSettings }
                  : p
              ),
            },
            settings: newSettings,
          };
        });
      };

      const initialRoot = createInitialRoot();
      const initialProfile = initialRoot.profiles[0];

      return {
        root: initialRoot,
        settings: initialProfile.settings,

        createProfile: (name: string, copyFromId?: string) => {
          const { root } = get();
          const sourceSettings = copyFromId
            ? root.profiles.find((p) => p.id === copyFromId)?.settings
            : undefined;

          const newProfile: Profile = {
            id: generateProfileId(),
            name,
            settings: sourceSettings
              ? { ...sourceSettings, notesDirectory: '' }
              : { ...DEFAULT_PROFILE_SETTINGS, columns: DEFAULT_COLUMNS },
          };

          debugLog.log('Creating new profile:', { name, id: newProfile.id, copiedFrom: copyFromId || 'none' });

          set((state) => ({
            root: {
              ...state.root,
              profiles: [...state.root.profiles, newProfile],
            },
          }));

          return newProfile.id;
        },

        renameProfile: (id: string, name: string) => {
          set((state) => ({
            root: {
              ...state.root,
              profiles: state.root.profiles.map((p) =>
                p.id === id ? { ...p, name } : p
              ),
            },
          }));
        },

        deleteProfile: (id: string) => {
          const { root } = get();

          // Cannot delete the last profile
          if (root.profiles.length <= 1) {
            return false;
          }

          const remainingProfiles = root.profiles.filter((p) => p.id !== id);

          // Determine new active profile if deleting the active one
          let newActiveId = root.activeProfileId;
          if (id === root.activeProfileId) {
            newActiveId = remainingProfiles[0].id;
          }

          const newActiveProfile = remainingProfiles.find(
            (p) => p.id === newActiveId
          )!;

          set({
            root: {
              ...root,
              activeProfileId: newActiveId,
              profiles: remainingProfiles,
            },
            settings: newActiveProfile.settings,
          });

          return true;
        },

        switchProfile: (id: string) => {
          const { root } = get();
          const profile = root.profiles.find((p) => p.id === id);

          if (!profile) return;

          debugLog.log('Switching profile:', { from: root.activeProfileId, to: id, profileName: profile.name });

          set({
            root: {
              ...root,
              activeProfileId: id,
            },
            settings: profile.settings,
          });
        },

        setNotesDirectory: (dir: string) => {
          debugLog.log('Setting notes directory:', dir);
          updateActiveProfileSettings((s) => ({ ...s, notesDirectory: dir }));
        },

        setEditorFontSize: (size: number) => {
          updateActiveProfileSettings((s) => ({ ...s, editorFontSize: size }));
        },

        setEditorFontFamily: (family: string) => {
          updateActiveProfileSettings((s) => ({ ...s, editorFontFamily: family }));
        },

        setAutoSaveDelay: (delay: number) => {
          updateActiveProfileSettings((s) => ({ ...s, autoSaveDelay: delay }));
        },

        setDefaultView: (view: 'notes' | 'kanban') => {
          updateActiveProfileSettings((s) => ({ ...s, defaultView: view }));
        },

        setColumns: (columns: KanbanColumnSettings[]) => {
          updateActiveProfileSettings((s) => ({ ...s, columns }));
        },

        setDisableUpdateChecks: (disable: boolean) => {
          debugLog.log('Setting disableUpdateChecks:', disable);
          set((state) => ({
            root: {
              ...state.root,
              disableUpdateChecks: disable,
            },
          }));
        },

        setEnableDebugLogging: (enable: boolean) => {
          debugLog.log('Setting enableDebugLogging:', enable);
          set((state) => ({
            root: {
              ...state.root,
              enableDebugLogging: enable,
            },
          }));
        },

        getActiveProfile: () => {
          const { root } = get();
          return root.profiles.find((p) => p.id === root.activeProfileId);
        },

        getAllProfiles: () => {
          return get().root.profiles;
        },
      };
    },
    {
      name: 'notes-kanban-settings',
      version: SETTINGS_SCHEMA_VERSION,
      migrate: migrateSettings,
    }
  )
);
