import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Note, CreateNoteInput, UpdateNoteInput } from '../types/note';
import type {
  NotesWithTagsAndFolders,
  FileChangeEvent,
  IncrementalUpdateResult,
  NoteWithTags,
} from '../types/folder';
import { useFolderStore } from './folderStore';

interface NotesState {
  notes: Note[];
  inlineTags: Map<string, string[]>; // noteId -> inline tags from cache
  activeNoteId: string | null;
  isLoading: boolean;
  error: string | null;
  cacheInitialized: boolean;

  initializeCache: (profileId: string) => Promise<void>;
  loadNotes: (notesDir: string) => Promise<void>;
  processFileChanges: (notesDir: string, changes: FileChangeEvent[]) => Promise<void>;
  createNote: (input: CreateNoteInput) => Promise<Note>;
  updateNote: (input: UpdateNoteInput) => Promise<void>;
  deleteNote: (filePath: string) => Promise<void>;
  moveNote: (filePath: string, targetFolder: string) => Promise<void>;
  setActiveNote: (id: string | null) => void;
  getActiveNote: () => Note | undefined;
  getInlineTags: (noteId: string) => string[];
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  inlineTags: new Map(),
  activeNoteId: null,
  isLoading: false,
  error: null,
  cacheInitialized: false,

  initializeCache: async (profileId: string) => {
    try {
      await invoke('initialize_cache', { profileId });
      set({ cacheInitialized: true });
    } catch (error) {
      console.error('Failed to initialize cache:', error);
      // Continue without cache - will fall back to uncached behavior
      set({ cacheInitialized: true });
    }
  },

  loadNotes: async (notesDir: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke<NotesWithTagsAndFolders>('list_notes_cached', { notesDir });

      const inlineTags = new Map<string, string[]>();
      const notes = result.notes.map((nwt) => {
        inlineTags.set(nwt.note.frontmatter.id, nwt.inline_tags);
        return nwt.note;
      });

      set({ notes, inlineTags, isLoading: false });
      useFolderStore.getState().setFolders(result.folders);
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  processFileChanges: async (notesDir: string, changes: FileChangeEvent[]) => {
    if (changes.length === 0) return;

    try {
      const result = await invoke<IncrementalUpdateResult>('process_file_changes', {
        notesDir,
        changes,
      });

      // Skip update if nothing changed
      if (result.updated_notes.length === 0 && result.removed_paths.length === 0) {
        return;
      }

      set((state) => {
        let newNotes = [...state.notes];
        const newInlineTags = new Map(state.inlineTags);

        // Remove deleted notes
        for (const removedPath of result.removed_paths) {
          const idx = newNotes.findIndex((n) => n.file_path === removedPath);
          if (idx >= 0) {
            const noteId = newNotes[idx].frontmatter.id;
            newInlineTags.delete(noteId);
            newNotes.splice(idx, 1);
          }
        }

        // Update/add changed notes
        for (const nwt of result.updated_notes) {
          const idx = newNotes.findIndex(
            (n) => n.frontmatter.id === nwt.note.frontmatter.id
          );
          if (idx >= 0) {
            newNotes[idx] = nwt.note;
          } else {
            newNotes.push(nwt.note);
          }
          newInlineTags.set(nwt.note.frontmatter.id, nwt.inline_tags);
        }

        // Sort by modified date (newest first)
        newNotes.sort(
          (a, b) =>
            new Date(b.frontmatter.modified).getTime() -
            new Date(a.frontmatter.modified).getTime()
        );

        return { notes: newNotes, inlineTags: newInlineTags };
      });
    } catch (error) {
      console.error('Failed to process file changes:', error);
      // Fall back to full reload on error
      get().loadNotes(notesDir);
    }
  },

  createNote: async (input: CreateNoteInput) => {
    const result = await invoke<NoteWithTags>('create_note', { input });
    set(state => {
      const newInlineTags = new Map(state.inlineTags);
      newInlineTags.set(result.note.frontmatter.id, result.inline_tags);
      return { notes: [result.note, ...state.notes], inlineTags: newInlineTags };
    });
    return result.note;
  },

  updateNote: async (input: UpdateNoteInput) => {
    const result = await invoke<NoteWithTags>('update_note', { input });
    set(state => {
      const newInlineTags = new Map(state.inlineTags);
      newInlineTags.set(result.note.frontmatter.id, result.inline_tags);
      return {
        notes: state.notes.map(n =>
          n.frontmatter.id === result.note.frontmatter.id ? result.note : n
        ),
        inlineTags: newInlineTags,
      };
    });
  },

  deleteNote: async (filePath: string) => {
    await invoke('delete_note', { filePath });
    set(state => ({
      notes: state.notes.filter(n => n.file_path !== filePath),
      activeNoteId: state.notes.find(n => n.file_path === filePath)?.frontmatter.id === state.activeNoteId
        ? null
        : state.activeNoteId,
    }));
  },

  moveNote: async (filePath: string, targetFolder: string) => {
    const movedNote = await invoke<Note>('move_note', { filePath, targetFolder });
    set(state => ({
      notes: state.notes.map(n =>
        n.file_path === filePath ? movedNote : n
      ),
    }));
  },

  setActiveNote: (id: string | null) => set({ activeNoteId: id }),

  getActiveNote: () => {
    const { notes, activeNoteId } = get();
    return notes.find((n) => n.frontmatter.id === activeNoteId);
  },

  getInlineTags: (noteId: string) => {
    return get().inlineTags.get(noteId) || [];
  },
}));
