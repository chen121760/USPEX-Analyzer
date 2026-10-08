import type { Structure } from '@/types/structure';

export type HullDisplayMetric = 'fitness' | 'reconstructed';

/** Chart-only projection. Never write this array back to a project or use it
 * for project exports: fitness in the canonical data is always raw USPEX. */
export function hullDisplayStructures(structures: readonly Structure[], metric: HullDisplayMetric): Structure[] {
  return metric === 'fitness' ? [...structures] : structures.map(s => ({
    ...s,
    fitness: Number.isFinite(s.eHullRecons) && s.eHullRecons >= 0 ? s.eHullRecons : Number.NaN,
  }));
}

export function fixedRelativeEnergy(s: Structure): number {
  return Number.isFinite(s.eHullRecons) && s.eHullRecons >= 0 ? s.eHullRecons : Number.NaN;
}

/** Geometric reconstruction needs energies and composition, not a USPEX
 * fitness measurement. Keep duplicates and interrupted-run structures. */
export function canImportWorkshopStructure(s: Structure): boolean {
  return Number.isFinite(s.enthalpyTotal) && s.enthalpyTotal <= 900
    && s.composition.length > 0 && s.composition.every(n => Number.isFinite(n) && n >= 0)
    && s.composition.some(n => n > 0);
}
