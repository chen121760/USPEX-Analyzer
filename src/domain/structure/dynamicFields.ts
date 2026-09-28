import type { DynamicFieldMetadata, Structure } from '@/types/structure';

const TWO_DIMENSIONAL_FIELD_KEYS = new Set(['Thick', 'Surf_area', 'Spec_surf_area']);

export function collectDynamicFieldKeys(
  structures: readonly Pick<Structure, 'extraProps'>[],
): string[] {
  const keys = new Set<string>();

  for (const structure of structures) {
    for (const key of Object.keys(structure.extraProps ?? {})) {
      keys.add(key);
    }
  }

  return Array.from(keys).sort();
}

export function getStructureFieldValue(structure: Structure, field: string): unknown {
  const direct = (structure as unknown as Record<string, unknown>)[field];
  if (direct !== undefined) return direct;
  return structure.extraProps?.[field];
}

/**
 * Read a dynamic field as a plottable number.
 *
 * `NaN` marks a value USPEX never evaluated (see `normalizeExtraProps`), and a
 * chart has to skip such a point instead of drawing it at 100000.
 */
export function numericStructureFieldValue(structure: Structure, field: string): number | undefined {
  const value = getStructureFieldValue(structure, field);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Source key a dynamic field must be read from.
 *
 * USPEX keeps two views of a custom objective: the raw value in
 * `Pareto_ranking` and the **negated copy** in `Individuals` (so every objective
 * column shares one internal orientation).  The parser therefore writes
 * `{name}-Individuals` and `{name}-Pareto_ranking`, and the plain `{name}`
 * column is defined to be the `Individuals` copy.
 *
 * Reading the plain name through `{name}-Individuals` keeps that definition true
 * for projects saved before the plain column was pinned — such a project can
 * still carry a stale positive `Property_X` that a hull file contributed.
 */
export function resolveDynamicFieldSourceKey(key: string, secondObjectiveName = ''): string {
  return secondObjectiveName !== '' && key === secondObjectiveName
    ? `${secondObjectiveName}-Individuals`
    : key;
}

/**
 * Read a dynamic field for charts and tables, resolving the second objective's
 * plain name to the `Individuals` copy (`resolveDynamicFieldSourceKey`).
 *
 * Falls back to the plain key when the run has no `Individuals` row for that
 * structure (hull-only structures) so the column is never silently blanked.
 */
export function dynamicFieldValue(
  structure: Structure,
  key: string,
  secondObjectiveName = '',
): number | undefined {
  const sourceKey = resolveDynamicFieldSourceKey(key, secondObjectiveName);
  if (sourceKey !== key) {
    const individualsValue = numericStructureFieldValue(structure, sourceKey);
    if (individualsValue !== undefined) return individualsValue;
  }
  return numericStructureFieldValue(structure, key);
}

export function describeDynamicField(
  key: string,
  secondObjectiveName = '',
): DynamicFieldMetadata {
  const isSecondObjective = secondObjectiveName !== '' && (
    key === secondObjectiveName ||
    key === `${secondObjectiveName}-Individuals` ||
    key === `${secondObjectiveName}-Pareto_ranking`
  );

  return {
    key,
    label: key,
    source: 'extraProps',
    category: isSecondObjective
      ? 'secondObjective'
      : TWO_DIMENSIONAL_FIELD_KEYS.has(key)
        ? '2d'
        : 'parserExtra',
  };
}

export function describeDynamicFields(
  keys: readonly string[],
  secondObjectiveName = '',
): DynamicFieldMetadata[] {
  return keys.map((key) => describeDynamicField(key, secondObjectiveName));
}
