import {
  reconstructConvexHull,
  type ReferenceResolution,
} from '@/lib/convexHullReconstruction';
import { normalizeStructures } from '@/domain/structure/normalizeStructure';
import type { CompositionMode, Structure, SystemType } from '@/types/structure';

export interface HullReconstructionResult {
  /** Fresh, normalized structures with eForm / eHullRecons filled in. */
  structures: Structure[];
  /** Which reference potentials were available when E_form was computed. */
  references: ReferenceResolution;
}

/**
 * Pure wrapper around the legacy reconstructed-hull algorithm.
 *
 * The original implementation mutates its Structure[] argument. Stage 5 keeps
 * that compatibility function intact, while parser/domain code can call this
 * wrapper to receive a fresh normalized array plus the reference resolution
 * that was used (needed to report references the dataset does not provide).
 */
export function reconstructHullStructures(
  structures: readonly Structure[],
  systemType: SystemType,
  compositionMode: CompositionMode,
  elements: string[],
  compositionBasis: number[][] = [],
): HullReconstructionResult {
  const normalized = normalizeStructures(structures);
  const references = reconstructConvexHull(
    normalized,
    systemType,
    compositionMode,
    elements,
    compositionBasis,
  );
  return { structures: normalizeStructures(normalized), references };
}
