import type { Structure, SystemInfo } from '@/types/structure';
import type { WorkshopGroup } from '@/modules/HullWorkshop/types';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { validateStructures, validateSystemInfo } from '@/domain/project/validateProject';

export function workshopCompatibilityError(source: SystemInfo, target: SystemInfo): string | null {
  if (source.elements.length !== target.elements.length || source.elements.some(el => !target.elements.includes(el))) return 'Element sets do not match';
  const p = source.externalPressure, q = target.externalPressure;
  if ((p == null) !== (q == null) || (p != null && q != null && Math.abs(p - q) > 0.001)) return 'External pressures do not match';
  const basis = (info: SystemInfo) => (info.compositionBasis?.length ? info.compositionBasis
    : info.elements.map((_, i) => info.elements.map((__, j) => +(i === j))))
    .map(row => target.elements.map(el => row[info.elements.indexOf(el)]).join(',')).sort();
  if (JSON.stringify(basis(source)) !== JSON.stringify(basis(target))) return 'Composition blocks do not match';
  return null;
}

/** Remap atomic counts before deriving any coordinates or formation energies. */
export function remapWorkshopStructure(s: Structure, source: SystemInfo, target: SystemInfo): Structure {
  return { ...normalizeStructure(s), composition: target.elements.map(el => s.composition[source.elements.indexOf(el)]), hullX: [] };
}

/** Validate the complete batch before returning any groups for insertion. */
export function prepareWorkshopGroups(groups: WorkshopGroup[], context?: SystemInfo | null): WorkshopGroup[] {
  const target = context ?? groups[0]?.systemInfo;
  if (!target) return [];
  validateSystemInfo(target);
  return groups.map(group => {
    validateSystemInfo(group.systemInfo);
    validateStructures(group.structures, group.systemInfo.elements.length);
    const error = workshopCompatibilityError(group.systemInfo, target);
    if (error) throw new Error(error);
    return { ...group, structures: group.structures.map(s => remapWorkshopStructure(s, group.systemInfo, target)),
      systemInfo: { ...target, compositionMode: group.systemInfo.compositionMode ?? 'varcomp', referenceInfo: undefined } };
  });
}
