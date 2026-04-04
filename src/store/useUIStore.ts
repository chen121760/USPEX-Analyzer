/**
 * UI state store — manages sidebar, modals, selected items, etc.
 */

import { create } from 'zustand';

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Structure viewer modal
  viewerStructureId: number | null;
  openViewer: (id: number) => void;
  closeViewer: () => void;

  // Compare mode
  compareIds: number[];
  toggleCompare: (id: number) => void;
  clearCompare: () => void;

  // Selection (for table multi-select)
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  selectMultiple: (ids: number[]) => void;
  clearSelection: () => void;

  // Dashboard collapsed
  dashboardCollapsed: boolean;
  toggleDashboard: () => void;

  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  viewerStructureId: null,
  openViewer: (id) => set({ viewerStructureId: id }),
  closeViewer: () => set({ viewerStructureId: null }),

  compareIds: [],
  toggleCompare: (id) => {
    const { compareIds } = get();
    if (compareIds.includes(id)) {
      set({ compareIds: compareIds.filter((cid) => cid !== id) });
    } else if (compareIds.length < 4) {
      set({ compareIds: [...compareIds, id] });
    }
  },
  clearCompare: () => set({ compareIds: [] }),

  selectedIds: new Set(),
  toggleSelect: (id) => {
    const next = new Set(get().selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selectedIds: next });
  },
  selectMultiple: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),

  dashboardCollapsed: false,
  toggleDashboard: () => set((s) => ({ dashboardCollapsed: !s.dashboardCollapsed })),

  theme: 'light',
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
}));
