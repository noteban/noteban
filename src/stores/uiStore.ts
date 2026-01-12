import { create } from 'zustand';

type View = 'notes' | 'kanban';

interface UIState {
  currentView: View;
  sidebarWidth: number;
  searchQuery: string;

  setView: (view: View) => void;
  setSidebarWidth: (width: number) => void;
  setSearchQuery: (query: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'notes',
  sidebarWidth: 280,
  searchQuery: '',

  setView: (view) => set({ currentView: view }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
