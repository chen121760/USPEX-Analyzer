import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getLegacyUIValue, isString, isStringArray } from '@/store/uiPersistence';

interface MarkState {
  markActiveTags: string[];
  markEaInput: string;
  setMarkActiveTags: (tags: string[]) => void;
  setMarkEaInput: (input: string) => void;
  clearMarks: () => void;
}

export const useMarkStore = create<MarkState>()(
  persist(
    (set) => ({
      markActiveTags: getLegacyUIValue('markActiveTags', [], isStringArray),
      markEaInput: getLegacyUIValue('markEaInput', '', isString),
      setMarkActiveTags: (tags) => set({ markActiveTags: tags }),
      setMarkEaInput: (input) => set({ markEaInput: input }),
      clearMarks: () => set({ markActiveTags: [], markEaInput: '' }),
    }),
    {
      name: 'uspex-mark-state',
      version: 1,
      partialize: (state) => ({
        markActiveTags: state.markActiveTags,
        markEaInput: state.markEaInput,
      }),
    },
  ),
);
