/**
 * POSCAR writer utilities for exporting structures.
 */

import type { Structure, CustomNamePart } from '@/types/structure';

/**
 * Build a filename for an exported structure.
 *
 * nameParts: array of part codes:
 *   1 = sort index (001, 002, ...)
 *   2 = structure ID (EA134)
 *   3 = space group (SG71)
 *   4 = fitness (Ed0.0000)
 *   5 = second objective (Obj92.7)
 *   6 = formula (Ti3H8)
 */
export function buildExportFilename(
  index: number,
  structure: Structure,
  nameParts: number[],
  padding: number,
  secondObjPrefix: string = 'Obj',
  customNameParts: CustomNamePart[] = [],
): string {
  const segments: string[] = [];

  for (const part of nameParts) {
    switch (part) {
      case 1:
        segments.push(String(index + 1).padStart(padding, '0'));
        break;
      case 2:
        segments.push(`EA${structure.id}`);
        break;
      case 3:
        segments.push(`SG${structure.spaceGroup}`);
        break;
      case 4:
        segments.push(
          `Ed${structure.fitness >= 0 ? structure.fitness.toFixed(4) : 'NA'}`,
        );
        break;
      case 5: {
        const paretoVal = structure.extraProps
          ? Object.entries(structure.extraProps).find(([k]) => k.endsWith('-Pareto_ranking'))?.[1]
          : undefined;
        segments.push(`${secondObjPrefix}${paretoVal != null ? paretoVal.toFixed(1) : 'NA'}`);
        break;
      }
      case 6:
        segments.push(structure.formula || 'Unknown');
        break;
    }
  }

  for (const cp of customNameParts) {
    const direct = (structure as unknown as Record<string, unknown>)[cp.field];
    const raw = direct !== undefined ? direct : structure.extraProps?.[cp.field];
    if (raw == null) continue;
    const num = Number(raw);
    if (isNaN(num)) continue;
    const formatted = Number.isInteger(num) ? String(num) : num.toFixed(3);
    const prefix = cp.label.trim();
    segments.push(prefix ? `${prefix}${formatted}` : formatted);
  }

  return segments.join('-') + '.vasp';
}

export interface CSVOptions {
  hasPareto?: boolean;
  hasML?: boolean;
  hasFingerprint?: boolean;
}

/**
 * Generate a CSV string from structures.
 * Optional flags mirror the DataTable column visibility logic:
 * columns for Pareto, ML elastic properties, and fingerprint are only
 * included when the corresponding data is actually present.
 */
export function structuresToCSV(structures: Structure[], opts: CSVOptions = {}): string {
  const { hasPareto = false, hasML = false, hasFingerprint = false } = opts;

  const headers = [
    'ID', 'Formula', 'Composition', 'SpaceGroup', 'Generation',
    'Enthalpy_eV_atom', 'Volume_A3_atom', 'Fitness_eV_block',
    'Density_g_cm3', 'Origin', 'ParentIDs',
    ...(hasPareto ? ['ParetoFront', 'ExtraProps'] : []),
    ...(hasML ? ['BulkModulus_GPa', 'ShearModulus_GPa', 'YoungModulus_GPa', 'PoissonRatio', 'PughRatio', 'VickersHardness_GPa', 'FractureToughness'] : []),
    ...(hasFingerprint ? ['Q_Entropy', 'A_Order', 'S_Order'] : []),
    'Tags', 'Notes',
  ];

  const rows = structures.map((s) => [
    s.id,
    s.formula,
    `"${s.composition.join(' ')}"`,
    s.spaceGroup,
    s.generation,
    s.enthalpy,
    s.volume,
    s.fitness,
    s.density,
    s.origin,
    `"${s.parentIds.join(' ')}"`,
    ...(hasPareto ? [
      s.paretoFront >= 0 ? s.paretoFront : '',
      Object.entries(s.extraProps ?? {}).map(([k, v]) => `${k}:${v}`).join(';') || '',
    ] : []),
    ...(hasML ? [
      s.bulkModulus >= 0 ? s.bulkModulus : '',
      s.shearModulus >= 0 ? s.shearModulus : '',
      s.youngModulus >= 0 ? s.youngModulus : '',
      s.poissonRatio >= 0 ? s.poissonRatio : '',
      s.pughRatio >= 0 ? s.pughRatio : '',
      s.vickersHardness >= 0 ? s.vickersHardness : '',
      s.fractureToughness >= 0 ? s.fractureToughness : '',
    ] : []),
    ...(hasFingerprint ? [s.qEntropy > 0 ? s.qEntropy : '', s.qEntropy > 0 ? s.aOrder : '', s.qEntropy > 0 ? s.sOrder : ''] : []),
    `"${s.tags.join(', ')}"`,
    `"${s.notes.replace(/"/g, '""')}"`,
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Concatenate multiple POSCAR structures into a single seeds file.
 */
export function buildSeedsFile(structures: Structure[]): string {
  return structures
    .filter((s) => s.poscarData)
    .map((s) => s.poscarData!.trimEnd())
    .join('\n');
}
