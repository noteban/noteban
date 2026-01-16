import type { AppSettingsRoot, Profile, ProfileSettings, KanbanColumnSettings } from '../types/settings';
import { DEFAULT_PROFILE_SETTINGS, DEFAULT_APP_SETTINGS, SETTINGS_SCHEMA_VERSION } from '../types/settings';
import { DEFAULT_COLUMNS } from '../types/kanban';

// Old format (version 1 or unversioned)
interface LegacySettingsState {
  settings: {
    notesDirectory: string;
    theme: 'dark';
    editorFontSize: number;
    editorFontFamily: string;
    autoSaveDelay: number;
    defaultView: 'notes' | 'kanban';
    columns: KanbanColumnSettings[];
  };
}

function generateProfileId(): string {
  return crypto.randomUUID();
}

// Type guard to detect legacy format
function isLegacyFormat(state: unknown): state is LegacySettingsState {
  return (
    state !== null &&
    typeof state === 'object' &&
    'settings' in state &&
    !('root' in state)
  );
}

export function migrateSettings(
  persistedState: unknown,
  version: number
): { root: AppSettingsRoot; settings: ProfileSettings } {
  // Handle legacy (v1/unversioned) format
  if (version === 0 || isLegacyFormat(persistedState)) {
    const legacy = persistedState as LegacySettingsState;
    const profileId = generateProfileId();

    // Create a profile from existing settings
    const migratedProfile: Profile = {
      id: profileId,
      name: 'Default',
      settings: {
        notesDirectory: legacy.settings?.notesDirectory || '',
        theme: legacy.settings?.theme || 'dark',
        editorFontSize: legacy.settings?.editorFontSize || 16,
        editorFontFamily: legacy.settings?.editorFontFamily || 'monospace',
        autoSaveDelay: legacy.settings?.autoSaveDelay || 1000,
        defaultView: legacy.settings?.defaultView || 'notes',
        columns: legacy.settings?.columns?.length
          ? legacy.settings.columns
          : DEFAULT_COLUMNS,
      },
    };

    const root: AppSettingsRoot = {
      version: SETTINGS_SCHEMA_VERSION,
      activeProfileId: profileId,
      profiles: [migratedProfile],
      disableUpdateChecks: DEFAULT_APP_SETTINGS.disableUpdateChecks,
      enableDebugLogging: DEFAULT_APP_SETTINGS.enableDebugLogging,
    };

    return {
      root,
      settings: migratedProfile.settings,
    };
  }

  // Handle version 2 -> 3 migration (add new app-wide settings)
  if (version === 2) {
    const state = persistedState as { root: AppSettingsRoot; settings: ProfileSettings };
    return {
      root: {
        ...state.root,
        version: SETTINGS_SCHEMA_VERSION,
        disableUpdateChecks: DEFAULT_APP_SETTINGS.disableUpdateChecks,
        enableDebugLogging: DEFAULT_APP_SETTINGS.enableDebugLogging,
      },
      settings: state.settings,
    };
  }

  // Handle version 3+ (current format) - no migration needed
  const state = persistedState as { root: AppSettingsRoot; settings: ProfileSettings };
  return state;
}

export function createDefaultProfile(name: string = 'Default'): Profile {
  return {
    id: generateProfileId(),
    name,
    settings: {
      ...DEFAULT_PROFILE_SETTINGS,
      columns: DEFAULT_COLUMNS,
    },
  };
}

export function createInitialRoot(): AppSettingsRoot {
  const defaultProfile = createDefaultProfile();
  return {
    version: SETTINGS_SCHEMA_VERSION,
    activeProfileId: defaultProfile.id,
    profiles: [defaultProfile],
    disableUpdateChecks: DEFAULT_APP_SETTINGS.disableUpdateChecks,
    enableDebugLogging: DEFAULT_APP_SETTINGS.enableDebugLogging,
  };
}

export { generateProfileId };
