import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Note, CreateNoteInput, UpdateNoteInput } from '../types/note';

interface NotesState {
  notes: Note[];
  activeNoteId: string | null;
  isLoading: boolean;
  error: string | null;

  loadNotes: (notesDir: string) => Promise<void>;
  createNote: (input: CreateNoteInput) => Promise<Note>;
  updateNote: (input: UpdateNoteInput) => Promise<void>;
  deleteNote: (filePath: string) => Promise<void>;
  setActiveNote: (id: string | null) => void;
  getActiveNote: () => Note | undefined;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  isLoading: false,
  error: null,

  loadNotes: async (notesDir: string) => {
    set({ isLoading: true, error: null });
    try {
      const notes = await invoke<Note[]>('list_notes', { notesDir });
      set({ notes, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createNote: async (input: CreateNoteInput) => {
    const note = await invoke<Note>('create_note', { input });
    set(state => ({ notes: [note, ...state.notes] }));
    return note;
  },

  updateNote: async (input: UpdateNoteInput) => {
    const updatedNote = await invoke<Note>('update_note', { input });
    set(state => ({
      notes: state.notes.map(n =>
        n.frontmatter.id === updatedNote.frontmatter.id ? updatedNote : n
      ),
    }));
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

  setActiveNote: (id: string | null) => set({ activeNoteId: id }),

  getActiveNote: () => {
    const { notes, activeNoteId } = get();
    return notes.find(n => n.frontmatter.id === activeNoteId);
  },
}));
