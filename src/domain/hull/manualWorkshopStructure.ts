import type { Structure, SystemInfo } from '@/types/structure';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { buildFormula, totalAtoms } from '@/parsers/compositionUtils';

export function manualWorkshopStructure(data: { composition: number[]; enthalpy: number; spaceGroup: number; notes: string },
  info: SystemInfo, id: number): Structure {
  const atoms = totalAtoms(data.composition);
  if (!Number.isFinite(data.enthalpy) || atoms <= 0 || data.composition.length !== info.elements.length
    || data.composition.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid manual composition or enthalpy');
  return normalizeStructure({ id, formula: buildFormula(data.composition, info.elements), composition: data.composition,
    enthalpy: data.enthalpy, enthalpyTotal: data.enthalpy * atoms, spaceGroup: data.spaceGroup,
    fitness: 0, eForm: -1, eHullRecons: -1, generation: 0, origin: 'manual', isUserAdded: true, notes: data.notes });
}
