import { create } from 'zustand';

type View = 'notes' | 'kanban';

interface UIState {
  currentView: View;
  sidebarWidth: number;
  searchQuery: string;
  showSettings: boolean;

  setView: (view: View) => void;
  setSidebarWidth: (width: number) => void;
  setSearchQuery: (query: string) => void;
  setShowSettings: (show: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'notes',
  sidebarWidth: 280,
  searchQuery: '',
  showSettings: false,

  setView: (view) => set({ currentView: view }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setShowSettings: (show) => set({ showSettings: show }),
}));
