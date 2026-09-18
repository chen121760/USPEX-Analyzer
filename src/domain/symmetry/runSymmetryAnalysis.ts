/**
 * Orchestrates the automatic full-project moyo symmetry precomputation.
 *
 * Starting is idempotent: only one bulk job runs at a time, and structures that
 * already carry a current analysis are skipped. Results stream into the project
 * store in chunks so the UI stays responsive and progress is visible.
 *
 * Every streamed chunk is validated against the `projectId` captured when the
 * job started, so replacing the project mid-run can never write stale results
 * into the new data set.
 */

import type { Structure } from '@/types/structure';
import { useProjectStore } from '@/store/useProjectStore';
import { isSymmetryAnalysisCurrent } from '@/domain/symmetry/symmetryConstants';
import { symmetryService, type BulkJobHandle } from '@/domain/symmetry/symmetryService';
import type { SymmetryJobItem } from '@/domain/symmetry/symmetryProtocol';

let activeJob: BulkJobHandle | null = null;

/** Structures that still need a moyo analysis (skips ones without POSCAR data). */
export function collectPendingSymmetryItems(structures: readonly Structure[]): SymmetryJobItem[] {
  const items: SymmetryJobItem[] = [];
  for (const structure of structures) {
    if (!structure.poscarData) continue;
    if (isSymmetryAnalysisCurrent(structure.symmetry)) continue;
    items.push({ id: structure.id, poscar: structure.poscarData });
  }
  return items;
}

export function isSymmetryAnalysisRunning(): boolean {
  return activeJob !== null;
}

/** Cancel the running bulk job, e.g. when the project is replaced. */
export function cancelSymmetryAnalysis(): void {
  activeJob?.cancel();
  activeJob = null;
  useProjectStore.getState().setSymmetryStatus({ running: false, done: 0, total: 0 });
}

/**
 * Start the bulk analysis if there is anything left to do. Safe to call on
 * every store change: it returns immediately while a job is running or when
 * every structure is already analysed.
 */
export function startSymmetryAnalysis(): void {
  if (activeJob) return;

  const store = useProjectStore.getState();
  if (!store.isDataLoaded) return;

  const projectId = store.projectId;
  const items = [
    ...collectPendingSymmetryItems(store.structures),
    ...collectPendingSymmetryItems(store.userStructures),
  ];
  if (items.length === 0) return;

  store.setSymmetryStatus({ running: true, done: 0, total: items.length });

  /** True while the results still belong to the project that started the job. */
  const stillCurrent = () => useProjectStore.getState().projectId === projectId;

  let abandoned = false;
  /** Stale job: drop it and immediately look for work in the new project. */
  const abandon = () => {
    if (abandoned) return;
    abandoned = true;
    job.cancel();
    activeJob = null;
    useProjectStore.getState().setSymmetryStatus({ running: false, done: 0, total: 0 });
    queueMicrotask(() => startSymmetryAnalysis());
  };

  const job: BulkJobHandle = symmetryService.analyzeAll(items, {
    onProgress: (done, total) => {
      if (!stillCurrent()) {
        abandon();
        return;
      }
      useProjectStore.getState().setSymmetryStatus({ done, total });
    },
    onChunk: (results) => {
      if (!stillCurrent()) {
        abandon();
        return;
      }
      useProjectStore.getState().applySymmetryResults(results);
    },
  });
  activeJob = job;

  job.promise
    .then(({ failed, cancelled }) => {
      if (cancelled) return;
      if (failed > 0) {
        console.warn(`[symmetry] ${failed} of ${items.length} structures could not be analysed`);
      }
    })
    .catch((error) => {
      console.warn('[symmetry] bulk analysis failed:', error);
    })
    .finally(() => {
      if (activeJob !== job) return;
      activeJob = null;
      useProjectStore.getState().setSymmetryStatus({ running: false, done: 0, total: 0 });
    });
}
