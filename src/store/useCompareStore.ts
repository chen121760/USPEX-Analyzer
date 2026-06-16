import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getLegacyUIValue, isNumberArray } from '@/store/uiPersistence';

interface CompareState {
  compareIds: number[];
  toggleCompare: (id: number) => void;
  clearCompare: () => void;
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      compareIds: getLegacyUIValue('compareIds', [], isNumberArray),
      toggleCompare: (id) => {
        const { compareIds } = get();
        if (compareIds.includes(id)) {
          set({ compareIds: compareIds.filter((compareId) => compareId !== id) });
        } else if (compareIds.length < 4) {
          set({ compareIds: [...compareIds, id] });
        }
      },
      clearCompare: () => set({ compareIds: [] }),
    }),
    {
      name: 'uspex-compare-state',
      version: 1,
      partialize: (state) => ({
        compareIds: state.compareIds,
      }),
    },
  ),
);
