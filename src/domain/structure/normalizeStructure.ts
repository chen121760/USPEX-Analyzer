import type { LatticeParams, Structure, SymmetryAnalysis } from '@/types/structure';
import { ML_FIELD_KEYS, USPEX_OBJECTIVE_PLACEHOLDER, type MLFieldKey } from '@/lib/constants';
import { isMLPropertyValue, ML_PROPERTY_MISSING } from './mlProperties';

export type StructureLike = Partial<Structure> & { id: number };

/**
 * Older saved projects wrote `-1` into every MLProperties-derived field when
 * the run had no MLProperties data.  MLProperties never reports all seven
 * columns as exactly -1, so that combination is the only case migrated to the
 * `NaN` sentinel; genuine negative predictions are preserved.
 */
function mlPropertiesFromLegacy(structure: StructureLike): Record<MLFieldKey, number> {
  const legacyMissing = ML_FIELD_KEYS.every((key) => structure[key] === -1);
  const values = {} as Record<MLFieldKey, number>;
  for (const key of ML_FIELD_KEYS) {
    const value = structure[key];
    values[key] = !legacyMissing && isMLPropertyValue(value) ? value : ML_PROPERTY_MISSING;
  }
  return values;
}

function cloneNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? [...value] : [];
}

function normalizeHullX(value: unknown): number[] {
  if (Array.isArray(value)) return [...value];
  return typeof value === 'number' ? [value] : [];
}

/**
 * Copy dynamic fields, turning USPEX's "property not evaluated" placeholder into
 * a missing value.
 *
 * `Individuals` writes 100000 into an objective column it never evaluated, so a
 * `ML_Bulk_Modul-Individuals` cell would otherwise read `100000.0000` next to the
 * `-4.7` that `MLProperties` actually predicted, and a chart using that field
 * would stretch its axis to 1e5.  The column is kept so the UI can show "—".
 */
function normalizeExtraProps(value: Structure['extraProps']): Structure['extraProps'] {
  if (!value || Object.keys(value).length === 0) return undefined;
  const normalized: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    const measured = typeof entry === 'number' && Number.isFinite(entry) && entry < USPEX_OBJECTIVE_PLACEHOLDER;
    normalized[key] = typeof entry === 'number' && !measured ? Number.NaN : entry;
  }
  return normalized;
}

function cloneLatticeParams(value: LatticeParams | undefined): LatticeParams | undefined {
  return value ? { ...value } : undefined;
}

function cloneSymmetry(value: SymmetryAnalysis | undefined): SymmetryAnalysis | undefined {
  if (!value || !Array.isArray(value.points)) return undefined;
  return {
    version: value.version,
    symprecs: Array.isArray(value.symprecs) ? [...value.symprecs] : [],
    points: value.points.map((point) => ({ ...point })),
    error: value.error,
  };
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

    ...mlPropertiesFromLegacy(structure),

    qEntropy: structure.qEntropy ?? 0,
    aOrder: structure.aOrder ?? 0,
    sOrder: structure.sOrder ?? 0,
    kpoints: structure.kpoints ? [...structure.kpoints] : undefined,

    poscarData: structure.poscarData,
    latticeParams: cloneLatticeParams(structure.latticeParams),
    symmetry: cloneSymmetry(structure.symmetry),

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
