/**
 * Parser for USPEX Individuals file.
 *
 * This file contains ALL structures across ALL generations.
 *
 * The exact numeric columns between "Composition" and "KPOINTS" vary by
 * calculation type.  Instead of assuming fixed column positions, this parser
 * reads the header line to build a column-name → index mapping, then
 * extracts every value by name.
 *
 * 3D bulk:
 *   Gen  ID  Origin  Composition  Enthalpy  Volume  Density  [ML_*?]  KPOINTS  SYMM  Q_entr A_order S_order
 *
 * 2D structure search:
 *   Gen  ID  Origin  Composition  Enthalpy  Thick  Surf_area  Spec_surf_area  Fitness  KPOINTS  SYMM  Q_entr A_order S_order
 */

import type { ParsedIndividual, OriginMethod } from '@/types/structure';
import { tokenizeHeader } from './headerUtils';

export interface IndividualsParseResult {
  data: ParsedIndividual[];
  secondObjectiveName: string;
  maxGeneration: number;
  /** Column names actually found in the middle section (between Composition and KPOINTS) */
  midColNames: string[];
}

/**
 * Known numeric column names that appear in the "middle section"
 * (between Composition and KPOINTS).  Anything not in this set is
 * treated as a dynamic extra — it still gets parsed and stored,
 * just not mapped to a dedicated field on ParsedIndividual.
 */
const KNOWN_MIDDLE_COLUMNS = new Set([
  'Enthalpy',
  'Volume',
  'Density',
  'Fitness',
  'Thick',
  'Surf_area',
  'Spec_surf_area',
]);

/** Returns true when a column name looks like a USPEX second-objective (ML_*). */
function isSecondObjectiveCol(name: string): boolean {
  return name.startsWith('ML_');
}

/**
 * Description of where each kind of value lives within a data line,
 * built once from the header and reused for every data row.
 */
interface HeaderMapping {
  /** Column name → 0-based index within the middle section (after `]` before KPOINTS `[`) */
  midMap: Map<string, number>;
  /** Ordered column names for the numeric section after KPOINTS `]` */
  afterKpCols: string[];
  /** Second objective column name (empty string if none) */
  secondObjectiveName: string;
}

/**
 * Build the header mapping from the header line.
 * Returns null when the header cannot be parsed.
 */
function buildHeaderMapping(headerLine: string): HeaderMapping | null {
  const tokens = tokenizeHeader(headerLine);
  if (tokens.length === 0) return null;

  const compIdx = tokens.indexOf('Composition');
  const kpIdx = tokens.indexOf('KPOINTS');
  if (compIdx < 0 || kpIdx < 0 || kpIdx <= compIdx) return null;

  // Columns between Composition and KPOINTS (the "middle section")
  const midCols = tokens.slice(compIdx + 1, kpIdx);
  const midMap = new Map<string, number>();
  midCols.forEach((name, idx) => {
    if (name !== '') midMap.set(name, idx);
  });

  // Columns after KPOINTS
  const afterKpCols = tokens.slice(kpIdx + 1).filter((n) => n !== '');

  // Second objective = first ML_* column (anywhere in the header)
  const secondObjectiveName = tokens.find(isSecondObjectiveCol) ?? '';

  return { midMap, afterKpCols, secondObjectiveName };
}

/**
 * Get a value from the middle-section numeric array by column name.
 */
function getMid(preNums: number[], midMap: Map<string, number>, name: string): number {
  const idx = midMap.get(name);
  if (idx === undefined || idx >= preNums.length) return 0;
  return preNums[idx] ?? 0;
}

/**
 * Get a value from the after-KPOINTS numeric array by column name.
 */
function getPost(postNums: number[], afterKpCols: string[], name: string): number {
  const idx = afterKpCols.indexOf(name);
  if (idx < 0 || idx >= postNums.length) return 0;
  return postNums[idx] ?? 0;
}

/**
 * Collect unknown columns from the middle section into an extras record.
 */
function collectExtras(
  preNums: number[],
  midMap: Map<string, number>,
): Record<string, number> {
  const extras: Record<string, number> = {};
  for (const [name, idx] of midMap) {
    if (
      !KNOWN_MIDDLE_COLUMNS.has(name) &&
      !isSecondObjectiveCol(name) &&
      idx < preNums.length
    ) {
      extras[name] = preNums[idx] ?? 0;
    }
  }
  return extras;
}

// ── Main parser ──────────────────────────────────────────────

export function parseIndividuals(content: string): IndividualsParseResult {
  const lines = content.split('\n');

  // ── Step 1: find header line & build mapping ──
  let mapping: HeaderMapping | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Gen') && trimmed.includes('ID')) {
      mapping = buildHeaderMapping(trimmed);
      break;
    }
  }

  // Fallback for badly formatted files — try hardcoded 3D mapping
  if (!mapping) {
    const fallbackMid = new Map([
      ['Enthalpy', 0], ['Volume', 1], ['Density', 2],
    ]);
    mapping = {
      midMap: fallbackMid,
      afterKpCols: ['SYMM', 'Q_entr', 'A_order', 'S_order'],
      secondObjectiveName: '',
    };
  }

  // ── Step 2: parse data lines ──
  const results: ParsedIndividual[] = [];
  let maxGen = 0;
  const { midMap, afterKpCols, secondObjectiveName } = mapping;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip comment and header lines
    if (trimmed.startsWith('#') || trimmed.startsWith('Gen')) continue;
    // Skip unit lines
    if (/\(eV\)|A\^3|g\/cm|m\^2\/g|\(A\)|\(A\^2\)/.test(trimmed)) continue;

    // Data lines start with two integers: Gen and ID
    const tokens = trimmed.split(/\s+/);
    const gen = parseInt(tokens[0], 10);
    const id = parseInt(tokens[1], 10);
    if (isNaN(gen) || isNaN(id)) continue;

    // Origin is the third token
    const originRaw = tokens[2] || 'Unknown';
    const origin: OriginMethod = originRaw as OriginMethod;

    // Extract composition from first [ ... ]
    const compMatch = trimmed.match(/\[\s*([\d\s]+)\s*\]/);
    if (!compMatch) continue;
    const composition = compMatch[1].trim().split(/\s+/).map(Number);

    // Split by ']' — structure is:
    //   parts[0]: "...Gen ID Origin [ comp_numbers "
    //   parts[1]: " numeric values ... [ kp_numbers "
    //   parts[2]: " symm q_entr a_order s_order ..."
    const parts = trimmed.split(']');
    if (parts.length < 3) continue;

    // ── Middle section (between first `]` and KPOINTS `[`) ──
    const afterComp = parts[1].trim();
    const kpBracketIdx = afterComp.lastIndexOf('[');

    let kpoints: number[] = [];
    let beforeKP = afterComp;

    if (kpBracketIdx >= 0) {
      beforeKP = afterComp.substring(0, kpBracketIdx).trim();
      kpoints = afterComp
        .substring(kpBracketIdx + 1)
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter((n) => !isNaN(n));
    }

    const preNums = beforeKP.split(/\s+/).map(Number);

    // Extract by name instead of by hardcoded index
    const enthalpy = getMid(preNums, midMap, 'Enthalpy');
    const volume = getMid(preNums, midMap, 'Volume');
    const density = getMid(preNums, midMap, 'Density');
    const thickness = getMid(preNums, midMap, 'Thick');
    const surfArea = getMid(preNums, midMap, 'Surf_area');
    const specSurfArea = getMid(preNums, midMap, 'Spec_surf_area');
    const indFitness = getMid(preNums, midMap, 'Fitness');
    const secondObjectiveValue = secondObjectiveName
      ? getMid(preNums, midMap, secondObjectiveName)
      : 0;

    // Unknown columns → extras
    const extras = collectExtras(preNums, midMap);

    // ── After KPOINTS section (parts[2]) ──
    const afterKP = parts[2].trim();
    const postNums = afterKP.split(/\s+/).map(Number).filter((n) => !isNaN(n));

    const symm = getPost(postNums, afterKpCols, 'SYMM');
    const qEntropy = getPost(postNums, afterKpCols, 'Q_entr');
    const aOrder = getPost(postNums, afterKpCols, 'A_order');
    const sOrder = getPost(postNums, afterKpCols, 'S_order');

    if (gen > maxGen) maxGen = gen;

    results.push({
      generation: gen,
      id,
      origin,
      composition,
      enthalpy,
      volume,
      density,
      secondObjectiveValue,
      thickness,
      surfArea,
      specSurfArea,
      indFitness,
      extras,
      kpoints,
      symm,
      qEntropy,
      aOrder,
      sOrder,
    });
  }

  return {
    data: results,
    secondObjectiveName,
    maxGeneration: maxGen,
    midColNames: Array.from(mapping.midMap.keys()),
  };
}
