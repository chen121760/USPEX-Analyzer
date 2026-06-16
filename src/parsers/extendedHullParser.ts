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
import {
  buildNormalizedColumnIndex,
  getTokenByColumnAliases,
  parseBracketedNumbers,
  tokenizeDataRow,
  tokenizeHeader,
} from './headerUtils.ts';

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

const USPEX25_HULL_CORE_COLUMNS = new Set([
  'generation',
  'number',
  'num_atoms_all',
  'energy',
  'cell_volume',
  'origin',
  'parents',
  'e_above_hull',
  'space_group',
  'formation_energy',
]);

function parseNumber(value: string | undefined): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getUspex25Value(
  rowTokens: string[],
  columnMap: Map<string, number>,
  aliases: string[],
): string | undefined {
  return getTokenByColumnAliases(rowTokens, columnMap, aliases);
}

function compositionToHullCoordinates(composition: number[]): number[] {
  const nAtoms = composition.reduce((sum, count) => sum + count, 0);
  if (nAtoms <= 0) return [0];
  if (composition.length === 2) return [composition[1] / nAtoms];
  if (composition.length >= 3) return composition.slice(1).map((count) => count / nAtoms);
  return [0];
}

function collectUspex25HullExtras(
  rowTokens: string[],
  headerTokens: string[],
): Record<string, number> {
  const extras: Record<string, number> = {};

  headerTokens.forEach((name, idx) => {
    if (USPEX25_HULL_CORE_COLUMNS.has(name.toLowerCase())) return;

    const raw = rowTokens[idx];
    if (raw === undefined || raw.startsWith('[')) return;

    const value = Number(raw);
    if (Number.isFinite(value)) {
      extras[name] = value;
    }
  });

  return extras;
}

function parseUspex25ExtendedConvexHull(
  lines: string[],
  headerLine: string,
): ParsedExtendedHull[] {
  const headerTokens = tokenizeHeader(headerLine);
  const columnMap = buildNormalizedColumnIndex(headerTokens);
  const results: ParsedExtendedHull[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === headerLine || trimmed.toLowerCase().startsWith('generation')) continue;

    const rowTokens = tokenizeDataRow(trimmed);
    const id = parseInt(
      getUspex25Value(rowTokens, columnMap, ['number', 'ID']) ?? '',
      10,
    );
    if (!Number.isFinite(id)) continue;

    const composition = parseBracketedNumbers(
      getUspex25Value(rowTokens, columnMap, ['num_atoms_all', 'Compositions']),
    );
    if (composition.length === 0) continue;

    const nAtoms = composition.reduce((sum, count) => sum + count, 0);
    const energy = parseNumber(getUspex25Value(rowTokens, columnMap, ['energy', 'Enthalpies']));
    const cellVolume = parseNumber(getUspex25Value(rowTokens, columnMap, ['cell_volume', 'Volumes']));
    const enthalpy = nAtoms > 0 ? energy / nAtoms : energy;
    const volume = nAtoms > 0 ? cellVolume / nAtoms : cellVolume;
    const fitness = parseNumber(getUspex25Value(rowTokens, columnMap, ['e_above_hull', 'Fitness']));
    const symm = parseNumber(getUspex25Value(rowTokens, columnMap, ['space_group', 'SYMM']));
    const y = parseNumber(getUspex25Value(rowTokens, columnMap, ['formation_energy', 'Y']));

    results.push({
      id,
      composition,
      enthalpy,
      volume,
      fitness,
      symm,
      x: compositionToHullCoordinates(composition),
      y,
      thickness: 0,
      surfArea: 0,
      extras: collectUspex25HullExtras(rowTokens, headerTokens),
    });
  }

  return results;
}

// ── Main parser ──────────────────────────────────────────────

export function parseExtendedConvexHull(content: string): ParsedExtendedHull[] {
  const lines = content.split('\n');

  const uspex25Header = lines
    .map((line) => line.trim())
    .find((line) => {
      const normalized = line.toLowerCase();
      return normalized.startsWith('generation') &&
        normalized.includes('number') &&
        normalized.includes('num_atoms_all') &&
        normalized.includes('e_above_hull');
    });

  if (uspex25Header) {
    return parseUspex25ExtendedConvexHull(lines, uspex25Header);
  }

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
