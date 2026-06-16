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
