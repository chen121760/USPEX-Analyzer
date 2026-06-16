import { reconstructConvexHull } from '@/lib/convexHullReconstruction';
import { normalizeStructures } from '@/domain/structure/normalizeStructure';
import type { CompositionMode, Structure, SystemType } from '@/types/structure';

/**
 * Pure wrapper around the legacy reconstructed-hull algorithm.
 *
 * The original implementation mutates its Structure[] argument. Stage 5 keeps
 * that compatibility function intact, while parser/domain code can call this
 * wrapper to receive a fresh normalized array.
 */
export function reconstructHullStructures(
  structures: readonly Structure[],
  systemType: SystemType,
  compositionMode: CompositionMode,
  elements: string[],
): Structure[] {
  const normalized = normalizeStructures(structures);
  reconstructConvexHull(normalized, systemType, compositionMode, elements);
  return normalizeStructures(normalized);
}
