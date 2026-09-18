/**
 * Main-thread facade over the moyo symmetry Web Worker.
 *
 * Two workers are used so that a long full-project run never blocks the
 * on-demand analysis requested from the structure detail view:
 *  - `bulk`        — the automatic full-project precomputation
 *  - `interactive` — single-structure requests (detail view, custom symprec)
 *
 * Workers (and their WASM instances) are created lazily and kept alive.
 */

import type { SymmetryAnalysis, SymmetryPoint } from '@/types/structure';
import {
  SYMMETRY_ANALYSIS_VERSION,
  SYMMETRY_SYMPRECS,
} from '@/domain/symmetry/symmetryConstants';
import type {
  SymmetryJobItem,
  SymmetryJobResult,
  SymmetryWorkerRequest,
  SymmetryWorkerResponse,
} from '@/domain/symmetry/symmetryProtocol';

const CHUNK_SIZE = 64;

type WorkerRole = 'bulk' | 'interactive';

interface BulkJobOptions {
  onChunk?: (results: SymmetryJobResult[]) => void;
  onProgress?: (done: number, total: number) => void;
}

export interface BulkJobHandle {
  jobId: number;
  cancel: () => void;
  promise: Promise<{ analysed: number; failed: number; cancelled: boolean }>;
}

class SymmetryService {
  private workers: Partial<Record<WorkerRole, Worker>> = {};
  private nextJobId = 1;
  private pending = new Map<
    number,
    {
      role: WorkerRole;
      settle: (value: unknown) => void;
      reject: (reason: Error) => void;
      onChunk?: (results: SymmetryJobResult[]) => void;
      onProgress?: (done: number, total: number) => void;
      cancelled: boolean;
    }
  >();

  private getWorker(role: WorkerRole): Worker {
    const existing = this.workers[role];
    if (existing) return existing;

    const worker = new Worker(new URL('../../workers/symmetry.worker.ts', import.meta.url), {
      type: 'module',
      name: `moyo-symmetry-${role}`,
    });
    worker.onmessage = (event: MessageEvent<SymmetryWorkerResponse>) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      const error = new Error(event.message || 'moyo symmetry worker crashed');
      for (const [jobId, job] of this.pending) {
        if (job.role !== role) continue;
        job.reject(error);
        this.pending.delete(jobId);
      }
      // Drop the broken worker so the next request creates a fresh one.
      worker.terminate();
      delete this.workers[role];
    };
    this.workers[role] = worker;
    return worker;
  }

  private handleMessage(message: SymmetryWorkerResponse): void {
    const job = this.pending.get(message.jobId);
    if (!job) return;

    switch (message.type) {
      case 'progress':
        job.onProgress?.(message.done, message.total);
        break;
      case 'chunk':
        job.onChunk?.(message.results);
        break;
      case 'one':
        job.settle(message.result.analysis);
        this.pending.delete(message.jobId);
        break;
      case 'done':
        job.settle({
          analysed: message.analysed,
          failed: message.failed,
          cancelled: job.cancelled,
        });
        this.pending.delete(message.jobId);
        break;
      case 'error':
        job.reject(new Error(message.message));
        this.pending.delete(message.jobId);
        break;
    }
  }

  /**
   * Kick off the full-project analysis. Results stream back through
   * `onChunk`, so the caller can persist them incrementally.
   */
  analyzeAll(items: SymmetryJobItem[], options: BulkJobOptions = {}): BulkJobHandle {
    const jobId = this.nextJobId++;
    const worker = this.getWorker('bulk');
    const symprecs = [...SYMMETRY_SYMPRECS];

    const promise = new Promise<{ analysed: number; failed: number; cancelled: boolean }>(
      (resolve, reject) => {
        this.pending.set(jobId, {
          role: 'bulk',
          settle: resolve as (value: unknown) => void,
          reject,
          onChunk: options.onChunk,
          onProgress: options.onProgress,
          cancelled: false,
        });
      },
    );

    const request: SymmetryWorkerRequest = {
      type: 'analyzeAll',
      jobId,
      items,
      symprecs,
      chunkSize: CHUNK_SIZE,
    };
    worker.postMessage(request);

    return {
      jobId,
      cancel: () => {
        const job = this.pending.get(jobId);
        if (job) job.cancelled = true;
        worker.postMessage({ type: 'cancel', jobId } satisfies SymmetryWorkerRequest);
      },
      promise,
    };
  }

  /** Analyse one POSCAR at every default tolerance (used when nothing is cached). */
  analyzeOne(item: SymmetryJobItem): Promise<SymmetryAnalysis> {
    return this.analyzeAt(item, [...SYMMETRY_SYMPRECS]);
  }

  /**
   * Analyse one POSCAR at an explicit tolerance list. Returns the full analysis
   * so callers can pick out the requested point.
   */
  analyzeAt(item: SymmetryJobItem, symprecs: number[]): Promise<SymmetryAnalysis> {
    const jobId = this.nextJobId++;
    const worker = this.getWorker('interactive');

    const promise = new Promise<SymmetryAnalysis>((resolve, reject) => {
      this.pending.set(jobId, {
        role: 'interactive',
        settle: resolve as (value: unknown) => void,
        reject,
        cancelled: false,
      });
    });

    worker.postMessage({
      type: 'analyzeOne',
      jobId,
      item,
      symprecs,
    } satisfies SymmetryWorkerRequest);

    return promise;
  }

  /** Analyse one POSCAR at a single custom tolerance and return just that point. */
  async analyzeSinglePoint(item: SymmetryJobItem, symprec: number): Promise<SymmetryPoint> {
    const analysis = await this.analyzeAt(item, [symprec]);
    const point = analysis.points[0];
    if (!point) throw new Error(analysis.error ?? 'no symmetry result');
    if (analysis.error && !point.number) throw new Error(analysis.error);
    return point;
  }

  /** Disposal hook for tests / hot reload. */
  terminate(): void {
    for (const worker of Object.values(this.workers)) worker?.terminate();
    this.workers = {};
    this.pending.clear();
  }
}

export const symmetryService = new SymmetryService();
export { SYMMETRY_ANALYSIS_VERSION };
