export type KanbanColumnSettings = {
  id: string;
  title: string;
  color: string;
  order: number;
};

// Profile-specific settings
export type ProfileSettings = {
  notesDirectory: string;
  theme: 'dark';
  editorFontSize: number;
  editorFontFamily: string;
  autoSaveDelay: number;
  defaultView: 'notes' | 'kanban';
  columns: KanbanColumnSettings[];
};

// A complete profile with metadata
export type Profile = {
  id: string;
  name: string;
  settings: ProfileSettings;
};

// Root settings structure for the entire app
export type AppSettingsRoot = {
  version: number;
  activeProfileId: string;
  profiles: Profile[];
  disableUpdateChecks: boolean;
  enableDebugLogging: boolean;
};

// Backward compatibility alias
export type AppSettings = ProfileSettings;

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  notesDirectory: '',
  theme: 'dark',
  editorFontSize: 16,
  editorFontFamily: 'monospace',
  autoSaveDelay: 1000,
  defaultView: 'notes',
  columns: [],
};

// Keep for backward compatibility
export const DEFAULT_SETTINGS = DEFAULT_PROFILE_SETTINGS;

export const DEFAULT_APP_SETTINGS = {
  disableUpdateChecks: false,
  enableDebugLogging: false,
};

export const SETTINGS_SCHEMA_VERSION = 3;
