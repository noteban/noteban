export type KanbanColumnSettings = {
  id: string;
  title: string;
  color: string;
  order: number;
};

// AI Tag Suggestion settings
export type AITagSettings = {
  enabled: boolean;
  serverUrl: string;
  selectedModel: string;
};

export const DEFAULT_AI_SETTINGS: AITagSettings = {
  enabled: false,
  serverUrl: 'http://localhost:11434',
  selectedModel: '',
};

export type SyncProvider = 'local' | 'nextcloud';
export type MobileInteractionMode = 'standard' | 'pie';

export type SyncSettings = {
  provider: SyncProvider;
  enabled: boolean;
  serverUrl: string;
  remoteFolder: string;
  accountDisplayName: string;
  accountLoginName: string;
  userId: string;
  lastSyncStatus: 'idle' | 'syncing' | 'ok' | 'error';
  lastSyncAt: string | null;
  lastSyncError: string | null;
  conflicts: string[];
};

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  provider: 'local',
  enabled: false,
  serverUrl: '',
  remoteFolder: 'Noteban',
  accountDisplayName: '',
  accountLoginName: '',
  userId: '',
  lastSyncStatus: 'idle',
  lastSyncAt: null,
  lastSyncError: null,
  conflicts: [],
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
  ai: AITagSettings;
  sync: SyncSettings;
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
  useNativeDecorations: boolean;
  mobileInteractionMode: MobileInteractionMode;
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
  ai: DEFAULT_AI_SETTINGS,
  sync: DEFAULT_SYNC_SETTINGS,
};

// Keep for backward compatibility
export const DEFAULT_SETTINGS = DEFAULT_PROFILE_SETTINGS;

export const DEFAULT_APP_SETTINGS = {
  disableUpdateChecks: false,
  enableDebugLogging: false,
  useNativeDecorations: false,
  mobileInteractionMode: 'standard' as MobileInteractionMode,
};

export const SETTINGS_SCHEMA_VERSION = 7;
