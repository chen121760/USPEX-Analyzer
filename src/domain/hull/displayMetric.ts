import type { Structure, SystemInfo } from '@/types/structure';
import type { WorkshopGroup } from '@/modules/HullWorkshop/types';

export type HullDisplayMetric = 'fitness' | 'reconstructed';

/** Chart-only projection. Never write this array back to a project or use it
 * for project exports: fitness in the canonical data is always raw USPEX. */
export function hullDisplayStructures(structures: readonly Structure[], metric: HullDisplayMetric): Structure[] {
  return metric === 'fitness' ? [...structures] : structures.map(s => ({
    ...s,
    fitness: Number.isFinite(s.eHullRecons) && s.eHullRecons >= 0 ? s.eHullRecons : Number.NaN,
    fitnessKind: 'distance',
  }));
}

export function fixedRelativeEnergy(s: Structure): number {
  return Number.isFinite(s.eHullRecons) && s.eHullRecons >= 0 ? s.eHullRecons : Number.NaN;
}

/** Membership comes from the USPEX result file, independently of Fitness. */
export function hasWorkshopSelection(info: SystemInfo): boolean {
  const selection = info.uspexSelection;
  if (!selection || !Array.isArray(selection.ids)) return false;
  const validSource = info.compositionMode === 'fixed'
    ? ['goodStructures', 'goodStructures_POSCARS'].includes(selection.source)
    : info.compositionMode === 'varcomp' && selection.source === 'extended_convex_hull';
  return !!validSource && selection.ids.every(id => Number.isSafeInteger(id) && id > 0)
    && new Set(selection.ids).size === selection.ids.length;
}

export function selectWorkshopStructures(structures: readonly Structure[], info: SystemInfo): Structure[] {
  if (!hasWorkshopSelection(info)) return [];
  const retainedIds = new Set(info.uspexSelection!.ids);
  return structures.filter(s => retainedIds.has(s.id)
    && Number.isFinite(s.enthalpyTotal) && s.enthalpyTotal <= 900
    && s.composition.length > 0 && s.composition.every(n => Number.isFinite(n) && n >= 0)
    && s.composition.some(n => n > 0));
}

/** Apply the project import rule to persisted groups as well as new imports.
 * Manual and external groups keep their explicit candidate structures. Legacy
 * project groups without retained IDs require the USPEX files to be reloaded. */
export function workshopEligibleGroups(groups: readonly WorkshopGroup[]): WorkshopGroup[] {
  return groups.map(group => group.importSource === 'json' && !group.sourceRecorded
    ? { ...group, structures: [] } : group.importSource !== 'project' ? group : {
    ...group,
    structures: selectWorkshopStructures(group.structures, group.systemInfo),
  });
}
