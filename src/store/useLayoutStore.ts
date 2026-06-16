import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getLegacyUIValue, isBoolean } from '@/store/uiPersistence';

interface LayoutState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  dashboardCollapsed: boolean;
  toggleDashboard: () => void;

  hintPanelOpen: boolean;
  toggleHintPanel: () => void;
  setHintPanelOpen: (open: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarCollapsed: getLegacyUIValue('sidebarCollapsed', false, isBoolean),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      dashboardCollapsed: getLegacyUIValue('dashboardCollapsed', false, isBoolean),
      toggleDashboard: () => set((state) => ({ dashboardCollapsed: !state.dashboardCollapsed })),

      hintPanelOpen: getLegacyUIValue('hintPanelOpen', true, isBoolean),
      toggleHintPanel: () => set((state) => ({ hintPanelOpen: !state.hintPanelOpen })),
      setHintPanelOpen: (open) => set({ hintPanelOpen: open }),
    }),
    {
      name: 'uspex-layout-state',
      version: 1,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        dashboardCollapsed: state.dashboardCollapsed,
        hintPanelOpen: state.hintPanelOpen,
      }),
    },
  ),
);
