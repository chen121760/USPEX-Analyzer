/**
 * Parser for USPEX Individuals file.
 *
 * This file contains ALL structures across ALL generations with:
 * - Generation number, ID, Origin method
 * - Composition, Total Enthalpy (eV), Total Volume (Å³), Density
 * - Second objective (e.g., ML_Young_Modul)
 * - KPOINTS, SYMM, Q_entr, A_order, S_order (fingerprints)
 *
 * Format:
 * Gen   ID    Origin   Composition    Enthalpy   Volume  Density  ML_Young_Modul    KPOINTS  SYMM  Q_entr A_order S_order
 *                                       (eV)     (A^3)  (g/cm^3)
 *   1    1   Seeds     [     9 29  ]   999.000   146.896   5.200     -0.000  [ 1  1  1]   1  0.124  2.045  1.783
 */

import type { ParsedIndividual, OriginMethod } from '@/types/structure';

export interface IndividualsParseResult {
  data: ParsedIndividual[];
  secondObjectiveName: string;
  maxGeneration: number;
}

/**
 * Auto-detect the name of the second objective column from the header line.
 */
function detectSecondObjective(headerLine: string): string {
  const standardCols = new Set([
    'Gen', 'ID', 'Origin', 'Composition', 'Enthalpy', 'Volume',
    'Density', 'KPOINTS', 'SYMM', 'Q_entr', 'A_order', 'S_order',
  ]);

  const tokens = headerLine.trim().split(/\s+/);
  for (const token of tokens) {
    if (!standardCols.has(token)) {
      return token;
    }
  }
  return 'SecondObjective';
}

export function parseIndividuals(content: string): IndividualsParseResult {
  const lines = content.split('\n');
  const results: ParsedIndividual[] = [];
  let secondObjectiveName = 'SecondObjective';
  let maxGen = 0;

  // Find header line to detect second objective name
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Gen') && trimmed.includes('ID')) {
      secondObjectiveName = detectSecondObjective(trimmed);
      break;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip comment and header lines
    if (trimmed.startsWith('#') || trimmed.startsWith('Gen')) continue;
    // Skip unit lines (contain eV, A^3, g/cm, etc.)
    if (/\(eV\)|A\^3|g\/cm/.test(trimmed)) continue;

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



    // 修复后：split(']') 会把括号对切开，parts 结构是：
    //   parts[0]: "...Gen ID Origin [ comp_numbers "
    //   parts[1]: " enthalpy volume density [secondObj?] [ kp_numbers "
    //   parts[2]: " symm q_entr a_order s_order"
    const parts = trimmed.split(']');
    if (parts.length < 3) continue; // 必须有两对括号（composition + kpoints）

    const afterComp = parts[1].trim();
    // afterComp 末尾是 KPOINTS 的左半（没有右括号），用 lastIndexOf 找 [
    const kpBracketIdx = afterComp.lastIndexOf('[');

    let kpoints: number[] = [];
    let beforeKP = afterComp;

    if (kpBracketIdx >= 0) {
      // [ 之前：enthalpy volume density [secondObj?]
      beforeKP = afterComp.substring(0, kpBracketIdx).trim();
      // [ 之后（到行尾）：kpoints 数字
      kpoints = afterComp
        .substring(kpBracketIdx + 1)
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter((n) => !isNaN(n));
    }

    // ✅ 关键修复：afterKP 从 parts[2] 取，不是从 parts[1] 内部找 ]
    const afterKP = parts[2].trim();


    // beforeKP: enthalpy volume density secondObj
    const preNums = beforeKP.split(/\s+/).map(Number);
    const enthalpy = preNums[0] ?? 0;
    const volume = preNums[1] ?? 0;
    const density = preNums[2] ?? 0;
    const secondObjective = preNums[3] ?? 0;

    // afterKP: symm q_entr a_order s_order
    const postNums = afterKP.split(/\s+/).map(Number).filter((n) => !isNaN(n));
    const symm = postNums[0] ?? 0;
    const qEntropy = postNums[1] ?? 0;
    const aOrder = postNums[2] ?? 0;
    const sOrder = postNums[3] ?? 0;

    if (gen > maxGen) maxGen = gen;

    results.push({
      generation: gen,
      id,
      origin,
      composition,
      enthalpy,
      volume,
      density,
      secondObjective,
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
  };
}
