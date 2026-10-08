import { computeGeometricHull, type WorkshopHullResult } from '@/lib/workshopHull';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import type { Structure, SystemInfo } from '@/types/structure';

export type WorkshopStructure = Structure & { _mergeSeq?: number };

export interface WorkshopDomainHullResult extends Omit<WorkshopHullResult, 'structures'> {
  structures: WorkshopStructure[];
}

function normalizeWorkshopStructure(structure: WorkshopStructure): WorkshopStructure {
  const normalized = normalizeStructure(structure);
  return structure._mergeSeq === undefined
    ? normalized
    : { ...normalized, _mergeSeq: structure._mergeSeq };
}

/**
 * Pure wrapper around the legacy workshop hull calculator.
 *
 * The compatibility implementation still mutates its input array, so callers
 * should use this domain entry point when they need stable source structures.
 */
export function computeWorkshopGeometricHull(
  structures: readonly WorkshopStructure[],
  systemInfo: SystemInfo,
): WorkshopDomainHullResult {
  const normalized = structures.map(normalizeWorkshopStructure);
  const originalFitness = new Map(normalized.map(s => [s, s.fitness]));
  const result = computeGeometricHull(normalized, { ...systemInfo });

  return {
    ...result,
    structures: result.structures.map((structure) =>
      normalizeWorkshopStructure({ ...structure, eHullRecons: systemInfo.systemType === 'quaternary' && systemInfo.compositionMode !== 'fixed'
        ? structure.eHullRecons : structure.fitness,
        fitness: originalFitness.get(structure) ?? Number.NaN } as WorkshopStructure),
    ),
  };
}
