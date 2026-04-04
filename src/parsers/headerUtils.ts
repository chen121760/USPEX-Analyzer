/**
 * Shared utilities for parsing USPEX file headers.
 *
 * USPEX files have human-readable headers that name each column.
 * Instead of assuming fixed column positions, we parse the header first
 * to build a name-to-index mapping, then extract values by name.
 */

/**
 * Standard column names that appear in Individuals files.
 * Any column NOT in this set is "dynamic" and goes to the extra map.
 */
export const STANDARD_INDIVIDUALS_COLUMNS = new Set([
  'Gen', 'ID', 'Origin', 'Composition', 'Enthalpy', 'Volume',
  'Density', 'Fitness', 'KPOINTS', 'SYMM', 'Q_entr', 'A_order', 'S_order',
]);

/**
 * Standard column names that appear in extended_convex_hull files.
 */
export const STANDARD_HULL_COLUMNS = new Set([
  'ID', 'Compositions', 'Enthalpies', 'Enthalpy', 'Volumes', 'Volume',
  'Fitness', 'SYMM', 'X', 'Y',
]);

/**
 * Tokenize a header line into column names.
 *
 * Handles:
 * - Single-token names: Gen, ID, Origin, SYMM
 * - Multi-token names: ML_Young_Modul, Q_entr, A_order, S_order
 * - Unit tokens in parentheses that should be skipped: (eV), (A^3), (g/cm^3)
 * - Merged header cells: "Enthalpies     Volumes" with units below
 *
 * For merged cells (unit lines below), the first line has all names,
 * subsequent lines have units. We only tokenize the first non-unit line.
 *
 * @param headerLine Raw header line text
 * @returns Array of column names
 */
export function tokenizeHeader(headerLine: string): string[] {
  const rawTokens = headerLine.trim().split(/\s+/);

  // Skip pure unit tokens (lines like "(eV)", "(A^3)")
  if (rawTokens.every((t) => /^\([^)]+\)$/.test(t))) {
    return [];
  }

  // Filter out standalone unit tokens
  const names = rawTokens.filter((t) => !/^\([^)]+\)$/.test(t));

  // Merge underscore-named tokens back: "Q_entr" → "Q_entr" (already single token)
  // But handle cases where multi-word names got split: "ML_Young_Modul" should be together
  // The raw split on whitespace works for most cases since USPEX uses underscores
  return names;
}

/**
 * From a tokenized header, identify key columns for Individuals files.
 *
 * @param tokens Column names from header
 * @returns Key column identification
 */
export function identifyIndividualsKeyColumns(tokens: string[]): {
  secondObjCol: string | null;
  fitnessCol: string | null;
  otherCols: string[];
} {
  const standard = STANDARD_INDIVIDUALS_COLUMNS;
  const dynamic: string[] = [];

  for (const token of tokens) {
    if (!standard.has(token) && token !== '') {
      dynamic.push(token);
    }
  }

  // Second objective: the LAST dynamic column (the ML_* column)
  // All others (if any) are "extra"
  const secondObjCol = dynamic.length > 0 ? dynamic[dynamic.length - 1] : null;

  // Check for a "Fitness" column (single-objective mode)
  const fitnessCol = tokens.includes('Fitness') ? 'Fitness' : null;

  // Remaining dynamic columns (excluding the second objective)
  const otherCols = dynamic.filter((c) => c !== secondObjCol);

  return { secondObjCol, fitnessCol, otherCols };
}

/**
 * From a tokenized header, identify key columns for extended_convex_hull files.
 *
 * @param tokens Column names from header
 * @returns Key column identification
 */
export function identifyHullKeyColumns(tokens: string[]): {
  formationEnergyCol: string | null;
  fitnessCol: string | null;
  coordCols: string[];
  otherCols: string[];
} {
  const standard = STANDARD_HULL_COLUMNS;
  const dynamic: string[] = [];

  for (const token of tokens) {
    if (!standard.has(token) && token !== '') {
      dynamic.push(token);
    }
  }

  // Formation energy: "Y" column
  const formationEnergyCol = tokens.includes('Y') ? 'Y' : null;

  // Fitness: "Fitness" or "ConvexHull" column
  const fitnessCol = tokens.includes('Fitness') ? 'Fitness' : null;

  // Coordinate columns: "X", "X1", "X2", "Y" (Y is already identified as formation energy)
  const coordCols = tokens.filter((t) => t === 'X' || t === 'X1' || t === 'X2');

  // Other dynamic columns
  const otherCols = dynamic;

  return { formationEnergyCol, fitnessCol, coordCols, otherCols };
}

/**
 * Build a column-name → array-index map from a tokenized header.
 * Only numeric columns are mapped (skip string columns like Origin, Composition).
 *
 * @param tokens Tokenized column names
 * @returns Map of column name to index
 */
export function buildColumnIndexMap(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  tokens.forEach((token, index) => {
    if (token !== '') {
      map.set(token, index);
    }
  });
  return map;
}

/**
 * Detect whether this is a multi-objective calculation based on header tokens.
 *
 * @param tokens Tokenized header names
 * @returns 'multi' if ML_* columns present, 'single' otherwise
 */
export function detectCalculationMode(tokens: string[]): 'single' | 'multi' {
  const hasML = tokens.some((t) => t.startsWith('ML_'));
  return hasML ? 'multi' : 'single';
}
