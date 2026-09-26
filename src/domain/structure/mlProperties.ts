import { ML_FIELD_KEYS, type MLFieldKey } from '@/lib/constants';
import type { Structure } from '@/types/structure';

/**
 * Sentinel stored in every MLProperties-derived field when a structure has no
 * row in MLProperties (or when the run has no MLProperties file at all).
 *
 * `NaN` — not `-1` — is deliberate: USPEX ML predictions are routinely
 * negative, e.g. a negative bulk modulus for a mechanically unstable or out-of
 * -training-domain structure.  Treating any negative value as "missing" hides
 * real data, so only a non-finite value means "absent".
 */
export const ML_PROPERTY_MISSING = Number.NaN;

/** Minimal structure shape needed to read MLProperties-derived fields. */
export type MLPropertyCarrier = Pick<Structure, MLFieldKey>;

/** True when the value is a real MLProperties prediction. */
export function isMLPropertyValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Read one MLProperties-derived field, mapping "absent" to `undefined` so
 * charts/filters can skip the point without discarding negative predictions.
 */
export function mlPropertyValue(
  carrier: MLPropertyCarrier,
  key: MLFieldKey,
): number | undefined {
  const value = carrier[key];
  return isMLPropertyValue(value) ? value : undefined;
}

/** True when at least one structure carries real MLProperties data. */
export function hasMLProperties(structures: readonly MLPropertyCarrier[]): boolean {
  return structures.some((structure) =>
    ML_FIELD_KEYS.some((key) => isMLPropertyValue(structure[key])),
  );
}
