import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TagFilter, TagFilterOperator } from '../types/tagFilter';
import {
  createEmptyTagFilter,
  hasTagFilter as checkHasTagFilter,
  addTagToFilter,
  removeTagFromFilter,
  setOperatorAtIndex,
} from '../utils/tagFilterParser';

type View = 'notes' | 'kanban';

interface UIState {
  currentView: View;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  searchQuery: string;
  showSettings: boolean;
  showAbout: boolean;
  tagFilter: TagFilter;

  setView: (view: View) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setSearchQuery: (query: string) => void;
  setShowSettings: (show: boolean) => void;
  setShowAbout: (show: boolean) => void;
  setTagFilter: (filter: TagFilter) => void;
  setFilterTag: (tag: string) => void;
  addTagToFilter: (tag: string, operator?: TagFilterOperator) => void;
  removeTagFromFilter: (tag: string) => void;
  setOperatorAtIndex: (index: number, operator: TagFilterOperator) => void;
  clearTagFilter: () => void;
  hasTagFilter: () => boolean;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      currentView: 'notes',
      sidebarWidth: 280,
      sidebarCollapsed: false,
      searchQuery: '',
      showSettings: false,
      showAbout: false,
      tagFilter: createEmptyTagFilter(),

      setView: (view) => set({ currentView: view }),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setShowSettings: (show) => set({ showSettings: show }),
      setShowAbout: (show) => set({ showAbout: show }),

      setTagFilter: (filter) => set({ tagFilter: filter }),

      setFilterTag: (tag) => set({
        tagFilter: {
          tags: [tag],
          operators: [],
        },
      }),

      addTagToFilter: (tag, operator = 'AND') => set((state) => ({
        tagFilter: addTagToFilter(state.tagFilter, tag, operator),
      })),

      removeTagFromFilter: (tag) => set((state) => ({
        tagFilter: removeTagFromFilter(state.tagFilter, tag),
      })),

      setOperatorAtIndex: (index, operator) => set((state) => ({
        tagFilter: setOperatorAtIndex(state.tagFilter, index, operator),
      })),

      clearTagFilter: () => set({ tagFilter: createEmptyTagFilter() }),

      hasTagFilter: () => checkHasTagFilter(get().tagFilter),
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
