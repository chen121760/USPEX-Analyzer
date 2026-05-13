/**
 * Per-project persistent store for Hull Workshop data.
 *
 * Workshop groups are saved to IndexedDB so they survive page refreshes
 * and navigation between app modules within the same project session.
 * When the user loads a different USPEX project the workshop data is
 * automatically cleared.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { openDB } from 'idb';
import type { WorkshopGroup } from '@/modules/HullWorkshop/types';
import { useProjectStore } from '@/store/useProjectStore';

/* ------------------------------------------------------------------ */
/*  IndexedDB-backed storage for Zustand persist                        */
/* ------------------------------------------------------------------ */

const WORKSHOP_DB = 'uspex-workshop';
const WORKSHOP_STORE = 'state';
const WORKSHOP_KEY = 'uspex-workshop';

function workshopDB() {
  return openDB(WORKSHOP_DB, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(WORKSHOP_STORE)) {
        db.createObjectStore(WORKSHOP_STORE);
      }
    },
  });
}

// Async IndexedDB storage that matches Zustand's PersistStorage interface.
// Zustand passes/expects parsed { state, version } objects (not raw strings),
// so we JSON-serialize inside the adapter.
const idbStorage = {
  getItem: async (
    name: string,
  ): Promise<{ state: Partial<WorkshopState>; version?: number } | null> => {
    try {
      const db = await workshopDB();
      const record = await db.get(WORKSHOP_STORE, name);
      if (!record?.value) return null;
      return JSON.parse(record.value);
    } catch {
      return null;
    }
  },
  setItem: async (
    name: string,
    value: { state: Partial<WorkshopState>; version?: number },
  ): Promise<void> => {
    try {
      const db = await workshopDB();
      await db.put(WORKSHOP_STORE, { value: JSON.stringify(value), ts: Date.now() }, name);
    } catch (e) {
      console.warn('[workshopStore] persist failed:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await workshopDB();
      await db.delete(WORKSHOP_STORE, name);
    } catch { /* noop */ }
  },
};

// Clean up legacy localStorage key from previous version
try { localStorage.removeItem('uspex-workshop'); } catch { /* noop */ }

/* ------------------------------------------------------------------ */
/*  Store                                                                */
/* ------------------------------------------------------------------ */

interface WorkshopState {
  groups: WorkshopGroup[];
  /** The project this workshop data belongs to.  When the active project
   *  changes this is compared and stale data is discarded. */
  projectId: string;

  setGroups: (groups: WorkshopGroup[]) => void;
  addGroup: (group: WorkshopGroup) => void;
  removeGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  toggleGroupVisibility: (groupId: string) => void;
  clearAll: () => void;
}

export const useWorkshopStore = create<WorkshopState>()(
  persist(
    (set) => ({
      groups: [],
      projectId: '',

      setGroups: (groups) => set({ groups }),

      addGroup: (group) =>
        set((s) => ({ groups: [...s.groups, group] })),

      removeGroup: (groupId) =>
        set((s) => ({
          groups: s.groups.filter((g) => g.id !== groupId),
        })),

      renameGroup: (groupId, name) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, name } : g,
          ),
        })),

      toggleGroupVisibility: (groupId) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, visible: !g.visible } : g,
          ),
        })),

      clearAll: () => set({ groups: [], projectId: '' }),
    }),
    {
      name: WORKSHOP_KEY,
      storage: idbStorage,
      partialize: (state) => ({
        groups: state.groups,
        projectId: state.projectId,
      }),
    },
  ),
);

/* ------------------------------------------------------------------ */
/*  Cross-store subscription: clear workshop when project changes      */
/* ------------------------------------------------------------------ */

// Track the latest projectId from the project store.
// When it differs from the workshop's stored projectId we know the user
// loaded a different project → discard stale workshop data.
useProjectStore.subscribe((state) => {
  const pid = state.projectId;
  if (!pid) return; // no project loaded yet — nothing to sync

  const workshop = useWorkshopStore.getState();

  // Same project — nothing to do
  if (workshop.projectId === pid) return;

  // First time assigning a projectId (fresh start or after clearAll)
  if (!workshop.projectId) {
    useWorkshopStore.setState({ projectId: pid });
    return;
  }

  // Different project — clear workshop and adopt the new projectId
  useWorkshopStore.setState({ groups: [], projectId: pid });
});
