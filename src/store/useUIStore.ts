import { create } from 'zustand';
import type { Structure } from '@/types/structure';
import { useFilterStore } from '@/store/useFilterStore';
import { useTableStore } from '@/store/useTableStore';

interface UIState {
  viewerStructureId: number | null;
  openViewer: (id: number) => void;
  closeViewer: () => void;

  viewerWorkshopStructure: Structure | null;
  openWorkshopViewer: (structure: Structure) => void;

  clearProjectFilters: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  viewerStructureId: null,
  openViewer: (id) => set({ viewerStructureId: id }),
  closeViewer: () => set({ viewerStructureId: null, viewerWorkshopStructure: null }),

  viewerWorkshopStructure: null,
  openWorkshopViewer: (structure) =>
    set({ viewerStructureId: structure.id, viewerWorkshopStructure: structure }),

  clearProjectFilters: () => {
    useTableStore.getState().clearTableFilters();
    useFilterStore.getState().clearFilterState();
  },
}));
