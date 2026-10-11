import type { Structure } from '@/types/structure';

/** Read the original USPEX value without confusing a signed objective with a hull distance. */
export function fitnessValue(
  structure: Pick<Structure, 'fitness' | 'fitnessKind'>,
): number | undefined {
  if (!Number.isFinite(structure.fitness)) return undefined;
  return structure.fitnessKind === 'objective' || structure.fitness >= 0
    ? structure.fitness : undefined;
}
