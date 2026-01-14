import type { Note } from './note';

export type Folder = {
  path: string;
  name: string;
  relative_path: string;
};

export type NotesWithFolders = {
  notes: Note[];
  folders: Folder[];
};

export type NoteWithTags = {
  note: Note;
  inline_tags: string[];
};

export type NotesWithTagsAndFolders = {
  notes: NoteWithTags[];
  folders: Folder[];
};

export type FileChangeEvent = {
  event_type: 'create' | 'modify' | 'remove';
  file_path: string;
};

export type IncrementalUpdateResult = {
  updated_notes: NoteWithTags[];
  removed_paths: string[];
};
