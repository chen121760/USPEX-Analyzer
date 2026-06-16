import type { LatticeParams, Structure } from '@/types/structure';

export type StructureLike = Partial<Structure> & { id: number };

function cloneNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? [...value] : [];
}

function normalizeHullX(value: unknown): number[] {
  if (Array.isArray(value)) return [...value];
  return typeof value === 'number' ? [value] : [];
}

function normalizeExtraProps(value: Structure['extraProps']): Structure['extraProps'] {
  if (!value || Object.keys(value).length === 0) return undefined;
  return { ...value };
}

function cloneLatticeParams(value: LatticeParams | undefined): LatticeParams | undefined {
  return value ? { ...value } : undefined;
}

/**
 * Convert parser, saved-project, and workshop structures into the canonical
 * in-app shape while preserving dynamic scientific fields.
 */
export function normalizeStructure(structure: StructureLike): Structure {
  const enthalpy = structure.enthalpy ?? 0;
  const volume = structure.volume ?? 0;

  return {
    id: structure.id,
    formula: structure.formula ?? `ID${structure.id}`,
    composition: cloneNumberArray(structure.composition),
    generation: structure.generation ?? 0,

    enthalpy,
    enthalpyTotal: structure.enthalpyTotal ?? enthalpy,
    volume,
    volumeTotal: structure.volumeTotal ?? volume,
    fitness: structure.fitness ?? -1,
    spaceGroup: structure.spaceGroup ?? 0,
    hullX: normalizeHullX(structure.hullX),
    hullY: structure.hullY ?? 0,

    origin: structure.origin ?? 'Unknown',
    parentIds: cloneNumberArray(structure.parentIds),
    parentEnthalpy: structure.parentEnthalpy ?? 0,
    density: structure.density ?? 0,

    paretoFront: structure.paretoFront ?? -1,
    extraProps: normalizeExtraProps(structure.extraProps),

    bulkModulus: structure.bulkModulus ?? -1,
    shearModulus: structure.shearModulus ?? -1,
    youngModulus: structure.youngModulus ?? -1,
    poissonRatio: structure.poissonRatio ?? -1,
    pughRatio: structure.pughRatio ?? -1,
    vickersHardness: structure.vickersHardness ?? -1,
    fractureToughness: structure.fractureToughness ?? -1,

    qEntropy: structure.qEntropy ?? 0,
    aOrder: structure.aOrder ?? 0,
    sOrder: structure.sOrder ?? 0,
    kpoints: structure.kpoints ? [...structure.kpoints] : undefined,

    poscarData: structure.poscarData,
    latticeParams: cloneLatticeParams(structure.latticeParams),

    tags: structure.tags ? [...structure.tags] : [],
    isUserAdded: structure.isUserAdded ?? false,
    notes: structure.notes ?? '',

    groupName: structure.groupName,
    groupColor: structure.groupColor,

    eForm: structure.eForm ?? -1,
    eHullRecons: structure.eHullRecons ?? -1,
  };
}

export function normalizeStructures(structures: readonly StructureLike[]): Structure[] {
  return structures.map(normalizeStructure);
}
