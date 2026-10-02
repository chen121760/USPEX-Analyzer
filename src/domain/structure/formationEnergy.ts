import type { Structure, SystemInfo } from '@/types/structure';
import { componentAmountsFromComposition } from '@/parsers/compositionUtils';

/** Missing formation energies never fall back to an energy with a different reference. */
export function formationEnergy(s: Structure | undefined, info?: SystemInfo | null): number | null {
  if (!s || !Number.isFinite(s.eForm) || !Number.isFinite(s.enthalpyTotal) || s.enthalpyTotal > 900) return null;
  const reference = info?.referenceInfo;
  if (reference && !reference.complete) {
    const amounts = info?.compositionBasis?.length
      ? componentAmountsFromComposition(s.composition, info.compositionBasis) : s.composition;
    if (reference.reason === 'rank-deficient' || !amounts
      || reference.labels.some((label, i) => reference.missing.includes(label) && amounts[i] > 1e-10)) return null;
  }
  // Legacy files use -1 for missing values. An available hull distance disambiguates it.
  if (s.eForm === -1 && !(Number.isFinite(s.eHullRecons) && s.eHullRecons >= 0)) return null;
  return s.eForm;
}

export function formationEnergyUnit(info: SystemInfo): string {
  return info.referenceInfo?.unit ?? (info.compositionBasis?.length ? 'eV/block' : 'eV/atom');
}
