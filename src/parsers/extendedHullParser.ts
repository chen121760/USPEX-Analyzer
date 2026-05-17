/**
 * Parser for USPEX extended_convex_hull file.
 *
 * The exact numeric columns after "Compositions" vary by calculation type.
 * Instead of assuming fixed column positions, this parser reads the header
 * line to build a column-name → index mapping, then extracts every value
 * by name.
 *
 * 3D bulk (binary):
 *   ID  Compositions  Enthalpies    Volumes     Fitness  SYMM  X       Y
 *                     (eV/atom)  (A^3/atom)  (eV/block)           (eV/block)
 *
 * 3D bulk (ternary):
 *   ID  Compositions  Enthalpies    Volumes     Fitness  SYMM  X1      X2      Y
 *
 * 2D structure search (binary):
 *   ID  Compositions  Enthalpies   Thickness     Fitness  SYMM  X       Y
 *                     (eV/atom)      (A)      (eV/block)           (eV/block)
 */

import type { ParsedExtendedHull } from '@/types/structure';
import { tokenizeHeader } from './headerUtils';

/**
 * Known column names that appear after "Compositions" in the hull header.
 * Anything not in this set goes to extras.
 */
const KNOWN_HULL_COLUMNS = new Set([
  'Enthalpies', 'Enthalpy',
  'Volumes', 'Volume',
  'Thickness',
  'Surf_Area', 'Surf_area',
  'Fitness',
  'SYMM',
  'X', 'X1', 'X2', 'X3',
  'Y',
]);

interface HullMapping {
  /** Column name → 0-based index within the flat numeric section after `]` */
  colMap: Map<string, number>;
  /** Indices of X-coordinate columns (X, X1, X2, ...) */
  xIndices: number[];
  /** Index of the Y column */
  yIndex: number;
}

/**
 * Build the column mapping from the header line.
 * Returns null when the header cannot be parsed.
 */
function buildHullMapping(headerLine: string): HullMapping | null {
  const tokens = tokenizeHeader(headerLine);
  if (tokens.length === 0) return null;

  const compIdx = tokens.indexOf('Compositions');
  if (compIdx < 0) return null;

  const afterComp = tokens.slice(compIdx + 1).filter((t) => t !== '');
  const colMap = new Map<string, number>();
  const xIndices: number[] = [];
  let yIndex = -1;

  afterComp.forEach((name, idx) => {
    colMap.set(name, idx);
    if (name === 'Y') yIndex = idx;
    if (name === 'X' || /^X\d+$/.test(name)) xIndices.push(idx);
  });

  if (colMap.size === 0) return null;
  return { colMap, xIndices, yIndex };
}

/**
 * Get a value from the flat numeric array by trying multiple column name aliases.
 * Returns the first non-zero value found, or 0 if none of the names exist.
 */
function getHull(nums: number[], colMap: Map<string, number>, names: string[]): number {
  for (const name of names) {
    const idx = colMap.get(name);
    if (idx !== undefined && idx < nums.length) {
      const v = nums[idx];
      if (!isNaN(v)) return v;
    }
  }
  return 0;
}

/**
 * Collect unknown columns from the flat numeric section into an extras record.
 */
function collectHullExtras(
  nums: number[],
  colMap: Map<string, number>,
): Record<string, number> {
  const extras: Record<string, number> = {};
  for (const [name, idx] of colMap) {
    if (!KNOWN_HULL_COLUMNS.has(name) && idx < nums.length) {
      extras[name] = nums[idx] ?? 0;
    }
  }
  return extras;
}

// ── Main parser ──────────────────────────────────────────────

export function parseExtendedConvexHull(content: string): ParsedExtendedHull[] {
  const lines = content.split('\n');

  // ── Step 1: find header line & build mapping ──
  let mapping: HullMapping | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('ID') && trimmed.includes('Compositions')) {
      mapping = buildHullMapping(trimmed);
      break;
    }
  }

  // Fallback for badly formatted files — assume 3D column order
  if (!mapping) {
    const fallback = new Map([
      ['Enthalpies', 0], ['Volumes', 1], ['Fitness', 2], ['SYMM', 3],
    ]);
    mapping = { colMap: fallback, xIndices: [4], yIndex: 5 };
  }

  const { colMap, xIndices, yIndex } = mapping;

  // ── Step 2: parse data lines ──
  const results: ParsedExtendedHull[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Skip header/unit lines — data lines start with an integer ID
    const firstToken = trimmed.split(/\s+/)[0];
    const id = parseInt(firstToken, 10);
    if (isNaN(id)) continue;

    // Extract composition from [ ... ]
    const compMatch = trimmed.match(/\[\s*([\d\s]+)\s*\]/);
    if (!compMatch) continue;

    const composition = compMatch[1]
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((n) => !isNaN(n));

    // Everything after the closing bracket → flat numeric fields
    const afterBracket = trimmed.split(']')[1];
    if (!afterBracket) continue;

    const nums = afterBracket.trim().split(/\s+/).map(Number);
    if (nums.some(isNaN)) continue;

    // Extract by name instead of by hardcoded index
    const enthalpy = getHull(nums, colMap, ['Enthalpies', 'Enthalpy']);
    const volume = getHull(nums, colMap, ['Volumes', 'Volume']);
    const thickness = getHull(nums, colMap, ['Thickness']);
    const surfArea = getHull(nums, colMap, ['Surf_Area', 'Surf_area']);
    const fitness = getHull(nums, colMap, ['Fitness']);
    const symm = getHull(nums, colMap, ['SYMM']);

    // X coordinates: ordered by their column positions
    const x = xIndices.map((i) => (i < nums.length ? nums[i] : 0));
    // Y: the Y column
    const y = yIndex >= 0 && yIndex < nums.length ? nums[yIndex] : 0;

    // Unknown columns → extras
    const extras = collectHullExtras(nums, colMap);

    results.push({
      id,
      composition,
      enthalpy,
      volume,
      fitness,
      symm,
      x,
      y,
      thickness,
      surfArea,
      extras,
    });
  }

  return results;
}
