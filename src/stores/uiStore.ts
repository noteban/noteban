import { create } from 'zustand';

type View = 'notes' | 'kanban';

interface UIState {
  currentView: View;
  sidebarWidth: number;
  searchQuery: string;
  showSettings: boolean;
  showAbout: boolean;
  filterTag: string | null;

  setView: (view: View) => void;
  setSidebarWidth: (width: number) => void;
  setSearchQuery: (query: string) => void;
  setShowSettings: (show: boolean) => void;
  setShowAbout: (show: boolean) => void;
  setFilterTag: (tag: string | null) => void;
  clearTagFilter: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'notes',
  sidebarWidth: 280,
  searchQuery: '',
  showSettings: false,
  showAbout: false,
  filterTag: null,

  setView: (view) => set({ currentView: view }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowAbout: (show) => set({ showAbout: show }),
  setFilterTag: (tag) => set({ filterTag: tag }),
  clearTagFilter: () => set({ filterTag: null }),
}));
