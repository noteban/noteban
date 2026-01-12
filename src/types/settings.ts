export type KanbanColumnSettings = {
  id: string;
  title: string;
  color: string;
  order: number;
};

export type AppSettings = {
  notesDirectory: string;
  theme: 'dark';
  editorFontSize: number;
  editorFontFamily: string;
  autoSaveDelay: number;
  defaultView: 'notes' | 'kanban';
  columns: KanbanColumnSettings[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  notesDirectory: '',
  theme: 'dark',
  editorFontSize: 16,
  editorFontFamily: 'monospace',
  autoSaveDelay: 1000,
  defaultView: 'notes',
  columns: [],
};
