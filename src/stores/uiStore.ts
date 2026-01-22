import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type View = 'notes' | 'kanban';

interface UIState {
  currentView: View;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  searchQuery: string;
  showSettings: boolean;
  showAbout: boolean;
  filterTag: string | null;

  setView: (view: View) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setSearchQuery: (query: string) => void;
  setShowSettings: (show: boolean) => void;
  setShowAbout: (show: boolean) => void;
  setFilterTag: (tag: string | null) => void;
  clearTagFilter: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentView: 'notes',
      sidebarWidth: 280,
      sidebarCollapsed: false,
      searchQuery: '',
      showSettings: false,
      showAbout: false,
      filterTag: null,

      setView: (view) => set({ currentView: view }),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setShowSettings: (show) => set({ showSettings: show }),
      setShowAbout: (show) => set({ showAbout: show }),
      setFilterTag: (tag) => set({ filterTag: tag }),
      clearTagFilter: () => set({ filterTag: null }),
    }),
    {
      name: 'noteban-ui',
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
