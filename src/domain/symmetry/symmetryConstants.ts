/**
 * Shared constants for the moyo (spglib) symmetry analysis.
 *
 * The USPEX-native space group (`Structure.spaceGroup`, taken from the
 * `SYMM` / `Sym.group` columns) is presented as the first row, `symm-USPEX`.
 * Every other row is a moyo determination at one distance tolerance.
 */

import type { SymmetryAnalysis, SymmetryPoint } from '@/types/structure';

/** Label used for the space group USPEX itself reported. */
export const USPEX_SYMMETRY_LABEL = 'symm-USPEX';

/** Label prefix used for every moyo determination. */
export const MOYO_SYMMETRY_LABEL = 'moyo';

/**
 * Distance tolerances (Å) used for the automatic full-project analysis.
 *
 * `1e-5` is spglib's own default (strictest sensible value), `1e-4`/`1e-3` are
 * common "relaxed structure" choices and `0.1` is close to USPEX's default
 * `symmPrecision`, so the last row is the one most comparable with
 * `symm-USPEX`.
 */
export const SYMMETRY_SYMPRECS: readonly number[] = [1e-5, 1e-4, 1e-3, 1e-2, 0.1];

/**
 * Bumped whenever `SYMMETRY_SYMPRECS`, the stored point shape, or the analysis
 * procedure changes. Cached analyses with an older version are recomputed.
 */
export const SYMMETRY_ANALYSIS_VERSION = 1;

/** Tolerance used for the one-off "custom symprec" probe in the detail view. */
export const SYMMETRY_CUSTOM_PLACEHOLDER = '1e-3';

/**
 * Pretty-print a symprec value: `1e-5 → "1e-5"`, `1e-2 → "1e-2"`, `0.1 → "0.1"`.
 * Values at or above 0.1 Å stay decimal; everything stricter uses exponent form
 * so the tolerance column reads as a consistent list.
 */
export function formatSymprec(symprec: number): string {
  if (!Number.isFinite(symprec) || symprec <= 0) return '—';
  if (symprec >= 0.1) return String(Number(symprec.toPrecision(3)));
  const exponent = Math.floor(Math.log10(symprec) + 1e-9);
  const mantissa = symprec / 10 ** exponent;
  const mantissaText = Number(mantissa.toPrecision(3)).toString();
  return mantissaText === '1' ? `1e${exponent}` : `${mantissaText}e${exponent}`;
}

/**
 * i18n key suffix for the crystal system of an ITA space-group number.
 *
 * The ranges are the standard ITA ones, so the crystal system never has to be
 * stored per structure.
 */
export function crystalSystemKey(spaceGroupNumber: number): string {
  if (spaceGroupNumber <= 0) return 'unknown';
  if (spaceGroupNumber <= 2) return 'triclinic';
  if (spaceGroupNumber <= 15) return 'monoclinic';
  if (spaceGroupNumber <= 74) return 'orthorhombic';
  if (spaceGroupNumber <= 142) return 'tetragonal';
  if (spaceGroupNumber <= 167) return 'trigonal';
  if (spaceGroupNumber <= 194) return 'hexagonal';
  if (spaceGroupNumber <= 230) return 'cubic';
  return 'unknown';
}

/** True when a stored analysis is present and matches the current version/tolerances. */
export function isSymmetryAnalysisCurrent(
  analysis: SymmetryAnalysis | undefined,
): analysis is SymmetryAnalysis {
  if (!analysis) return false;
  if (analysis.version !== SYMMETRY_ANALYSIS_VERSION) return false;
  if (analysis.points.length !== SYMMETRY_SYMPRECS.length) return false;
  return analysis.symprecs.every((value, index) => value === SYMMETRY_SYMPRECS[index]);
}

/** Human-readable tolerance list, e.g. "1e-5 / 1e-4 / 1e-3 / 1e-2 / 0.1 Å". */
export function describeSymprecs(symprecs: readonly number[] = SYMMETRY_SYMPRECS): string {
  return `${symprecs.map(formatSymprec).join(' / ')} Å`;
}

/**
 * Compact one-line summary of how the moyo space group evolves with tolerance,
 * e.g. `"1 → 1 → 1 → 1 → 139"`. Returns `null` when nothing was computed.
 */
export function summariseSymmetryNumbers(
  points: readonly SymmetryPoint[] | undefined,
): string | null {
  if (!points || points.length === 0) return null;
  return points.map((point) => (point.number > 0 ? String(point.number) : '—')).join(' → ');
}
