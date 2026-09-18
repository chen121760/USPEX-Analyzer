/**
 * Message protocol between the main thread and the moyo symmetry Web Worker.
 */

import type { SymmetryAnalysis, SymmetryPoint } from '@/types/structure';

export interface SymmetryJobItem {
  /** Structure id (project structures and user structures share the numbering space). */
  id: number;
  /** Raw POSCAR text; the worker parses it itself. */
  poscar: string;
}

export interface SymmetryJobResult {
  id: number;
  analysis: SymmetryAnalysis;
}

export type SymmetryWorkerRequest =
  | {
      type: 'analyzeAll';
      jobId: number;
      items: SymmetryJobItem[];
      symprecs: number[];
      /** How many results to batch into a single `chunk` message. */
      chunkSize: number;
    }
  | {
      type: 'analyzeOne';
      jobId: number;
      item: SymmetryJobItem;
      symprecs: number[];
    }
  | { type: 'cancel'; jobId: number };

export type SymmetryWorkerResponse =
  | { type: 'progress'; jobId: number; done: number; total: number }
  | { type: 'chunk'; jobId: number; results: SymmetryJobResult[] }
  | { type: 'one'; jobId: number; result: SymmetryJobResult }
  | { type: 'done'; jobId: number; analysed: number; failed: number }
  | { type: 'error'; jobId: number; message: string };

export type { SymmetryAnalysis, SymmetryPoint };
