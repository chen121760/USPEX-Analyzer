/**
 * Web Worker that runs the `@spglib/moyo-wasm` symmetry analysis.
 *
 * All work happens off the main thread: the WASM module is instantiated once
 * per worker and reused for every structure. The worker is driven through the
 * message protocol in `@/domain/symmetry/symmetryProtocol`.
 */

import init, { analyze_cell } from '@spglib/moyo-wasm';
import wasmUrl from '@spglib/moyo-wasm/moyo_wasm_bg.wasm?url';
import { poscarToMoyoCell } from '@/domain/symmetry/poscarToCell';
import {
  SYMMETRY_ANALYSIS_VERSION,
} from '@/domain/symmetry/symmetryConstants';
import type {
  SymmetryAnalysis,
  SymmetryJobItem,
  SymmetryPoint,
  SymmetryWorkerRequest,
  SymmetryWorkerResponse,
} from '@/domain/symmetry/symmetryProtocol';

/** Minimal worker scope typing — avoids pulling in conflicting DOM/webworker libs. */
const ctx = self as unknown as {
  postMessage: (message: SymmetryWorkerResponse) => void;
  onmessage: ((event: MessageEvent<SymmetryWorkerRequest>) => void) | null;
};

let initPromise: Promise<unknown> | null = null;

function ensureWasm(): Promise<unknown> {
  if (!initPromise) {
    initPromise = init(wasmUrl);
  }
  return initPromise;
}

/**
 * Placeholder point used when a whole structure could not be analysed.
 * Keeping the point array the same length as `symprecs` makes the cached
 * analysis shape uniform, so a permanently failing structure is not retried
 * forever by the auto-runner.
 */
function emptyPoint(symprec: number): SymmetryPoint {
  return { symprec, number: 0, symbol: '', pearson: '', operations: 0, hallNumber: 0 };
}

/** Analyse a single POSCAR at every requested tolerance. */
function analyseItem(item: SymmetryJobItem, symprecs: number[]): SymmetryAnalysis {
  const base: SymmetryAnalysis = {
    version: SYMMETRY_ANALYSIS_VERSION,
    symprecs: [...symprecs],
    points: [],
  };

  let cellJson: string;
  try {
    const parsed = poscarToMoyoCell(item.poscar);
    cellJson = JSON.stringify(parsed.cell);
  } catch (error) {
    return {
      ...base,
      points: symprecs.map(emptyPoint),
      error: error instanceof Error ? error.message : 'POSCAR could not be parsed',
    };
  }

  const points: SymmetryPoint[] = [];
  for (const symprec of symprecs) {
    try {
      const dataset = analyze_cell(cellJson, symprec, 'Standard');
      points.push({
        symprec,
        number: dataset.number,
        symbol: dataset.hm_symbol ?? '',
        pearson: dataset.pearson_symbol ?? '',
        operations: dataset.operations.length,
        hallNumber: dataset.hall_number,
      });
    } catch (error) {
      points.push(emptyPoint(symprec));
      if (!base.error) {
        base.error = error instanceof Error ? error.message : String(error);
      }
    }
  }

  return { ...base, points };
}

/** Id of the job currently being processed; a `cancel` for it stops the loop. */
let activeJobId = -1;
let cancelRequested = false;

ctx.onmessage = async (event) => {
  const message = event.data;

  if (message.type === 'cancel') {
    if (message.jobId === activeJobId) cancelRequested = true;
    return;
  }

  try {
    await ensureWasm();
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      jobId: message.jobId,
      message: `moyo WASM failed to initialise: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  if (message.type === 'analyzeOne') {
    activeJobId = message.jobId;
    try {
      const analysis = analyseItem(message.item, message.symprecs);
      ctx.postMessage({
        type: 'one',
        jobId: message.jobId,
        result: { id: message.item.id, analysis },
      });
    } catch (error) {
      ctx.postMessage({
        type: 'error',
        jobId: message.jobId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      activeJobId = -1;
    }
    return;
  }

  if (message.type !== 'analyzeAll') return;

  activeJobId = message.jobId;
  cancelRequested = false;

  const { items, symprecs, chunkSize } = message;
  const total = items.length;
  const buffer: { id: number; analysis: SymmetryAnalysis }[] = [];
  let done = 0;
  let failed = 0;

  for (const item of items) {
    if (cancelRequested) break;
    let analysis: SymmetryAnalysis;
    try {
      analysis = analyseItem(item, symprecs);
    } catch (error) {
      analysis = {
        version: SYMMETRY_ANALYSIS_VERSION,
        symprecs: [...symprecs],
        points: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (analysis.error) failed += 1;
    buffer.push({ id: item.id, analysis });
    done += 1;

    if (buffer.length >= Math.max(1, chunkSize)) {
      ctx.postMessage({ type: 'chunk', jobId: message.jobId, results: buffer.splice(0, buffer.length) });
      ctx.postMessage({ type: 'progress', jobId: message.jobId, done, total });
    }
  }

  if (buffer.length > 0) {
    ctx.postMessage({ type: 'chunk', jobId: message.jobId, results: buffer.splice(0, buffer.length) });
  }

  ctx.postMessage({
    type: 'done',
    jobId: message.jobId,
    analysed: done,
    failed,
  });

  activeJobId = -1;
  cancelRequested = false;
};
