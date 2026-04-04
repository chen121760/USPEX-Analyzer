/**
 * Auto-save hook — persists project data to IndexedDB.
 * Restores on page load if data exists and is < 7 days old.
 */

import { useEffect, useRef } from 'react';
import { openDB, type IDBPDatabase } from 'idb';
import { useProjectStore } from '@/store/useProjectStore';
import type { ProjectFile } from '@/types/structure';

const DB_NAME = 'uspex-analyzer';
const STORE_NAME = 'project-data';
const KEY = 'current-session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

/**
 * Save current project state to IndexedDB.
 */
async function saveToDB(project: ProjectFile): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, { project, timestamp: Date.now() }, KEY);
  } catch (e) {
    console.warn('[usePersistence] Save failed:', e);
  }
}

/**
 * Attempt to restore project from IndexedDB.
 * Returns project if found and not expired, null otherwise.
 */
async function restoreFromDB(): Promise<ProjectFile | null> {
  try {
    const db = await getDB();
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
    const db = await getDB();
    await db.delete(STORE_NAME, KEY);
  } catch (e) {
    console.warn('[usePersistence] Clear failed:', e);
  }
}

/**
 * Hook: auto-save project to IndexedDB on changes (debounced 2s).
 */
export function useAutoSave(): void {
  const isDataLoaded = useProjectStore((s) => s.isDataLoaded);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isDataLoaded) return;

    // Debounce saves
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const project = useProjectStore.getState().exportProjectFile();
      saveToDB(project);
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDataLoaded]);

  // Subscribe to structure/tag changes
  useEffect(() => {
    const unsub = useProjectStore.subscribe((state) => {
      if (!state.isDataLoaded) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const project = useProjectStore.getState().exportProjectFile();
        saveToDB(project);
      }, 2000);
    });

    return unsub;
  }, []);
}

/**
 * Hook: attempt to restore from IndexedDB on mount.
 * Returns true if data was restored.
 */
export function useRestoreSession(): { restored: boolean; loading: boolean } {
  const isDataLoaded = useProjectStore((s) => s.isDataLoaded);
  const loadProjectFile = useProjectStore((s) => s.loadProjectFile);

  useEffect(() => {
    if (isDataLoaded) return;

    restoreFromDB().then((project) => {
      if (project && !useProjectStore.getState().isDataLoaded) {
        loadProjectFile(project);
        console.log('[usePersistence] Session restored from IndexedDB');
      }
    });
  }, []); // run once on mount

  return { restored: isDataLoaded, loading: false };
}
