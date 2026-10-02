/**
 * Auto-save hook — persists project data to IndexedDB.
 * Restores on page load if data exists and is < 7 days old.
 */

import { useEffect, useRef, useState } from 'react';
import { getProjectDB, saveProjectSnapshot } from '@/lib/projectStorage';
import { createSaveQueue, projectDataChanged } from '@/domain/project/persistence';
import { useProjectStore } from '@/store/useProjectStore';
import type { ProjectFile } from '@/types/structure';

const STORE_NAME = 'project-data';
const KEY = 'current-session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Attempt to restore project from IndexedDB.
 * Returns project if found and not expired, null otherwise.
 */
async function restoreFromDB(): Promise<ProjectFile | null> {
  try {
    const db = await getProjectDB();
    const record = await db.get(STORE_NAME, KEY);

    if (!record || !record.project || !record.timestamp) return null;
    if (Date.now() - record.timestamp > MAX_AGE_MS) return null;

    return record.project as ProjectFile;
  } catch (e) {
    console.warn('[usePersistence] Restore failed:', e);
    return null;
  }
}

/**
 * Clear saved session from IndexedDB.
 */
export async function clearSavedSession(): Promise<void> {
  try {
    const db = await getProjectDB();
    await db.delete(STORE_NAME, KEY);
  } catch (e) {
    console.warn('[usePersistence] Clear failed:', e);
  }
}

/**
 * Hook: auto-save project to IndexedDB on changes (debounced 2s).
 */
export function useAutoSave(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const enqueue = createSaveQueue(saveProjectSnapshot,
      error => {
        console.warn('[usePersistence] Save failed:', error);
        useProjectStore.setState({ persistenceError: error instanceof Error ? error.message : String(error) });
      }, snapshot => {
        if (useProjectStore.getState().projectId === snapshot.projectId) useProjectStore.setState({ persistenceError: null });
      });
    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      const state = useProjectStore.getState();
      if (!state.isDataLoaded || state.isLoading || !state.systemInfo) return;
      timerRef.current = setTimeout(() => {
        const current = useProjectStore.getState();
        if (current.isDataLoaded && !current.isLoading && current.systemInfo) void enqueue(current.exportProjectFile());
      }, 2000);
    };
    schedule();
    const unsub = useProjectStore.subscribe((state, previous) => {
      if (projectDataChanged({ ...state }, { ...previous })) schedule();
    });
    return () => { unsub(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);
}

/**
 * Hook: attempt to restore from IndexedDB on mount.
 * Returns true if data was restored.
 */
export function useRestoreSession(): { restored: boolean; loading: boolean } {
  const isDataLoaded = useProjectStore((s) => s.isDataLoaded);
  const loadProjectFile = useProjectStore((s) => s.loadProjectFile);
  const [loading, setLoading] = useState(!isDataLoaded);

  useEffect(() => {
    let cancelled = false;

    if (isDataLoaded) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    restoreFromDB()
      .then(async (project) => {
        if (cancelled) return;
        if (project && !useProjectStore.getState().isDataLoaded) {
          // Await: the boot screen stays up until the structures are in place.
          await loadProjectFile(project, { preserveFilters: true });
        }
      })
      .catch(error => {
        console.warn('[usePersistence] Restore failed:', error);
        useProjectStore.setState({ persistenceError: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDataLoaded, loadProjectFile]);

  return { restored: isDataLoaded, loading };
}
