/**
 * Parser for USPEX Pareto_ranking file.
 *
 * Format:
 * Pareto  ID   Origin     Composition     Enthalpy   Volume  Density  ML_Young_Modul ConvexHull  KPOINTS   SYMM ...
 * front                                   eV/atom    (A^3)  (g/cm^3)
 *   1    222    Seeds     [     1  5  ]    -1.380    20.106   4.369       92.677        0.201    [ 1  1  1]   1 ...
 */

import type { ParsedPareto } from '@/types/structure';

export interface ParetoParseResult {
  data: ParsedPareto[];
  secondObjectiveName: string;
}

function detectSecondObjective(headerLine: string): string {
  const standard = new Set([
    'Pareto', 'ID', 'Origin', 'Composition', 'Enthalpy', 'Volume',
    'Density', 'ConvexHull', 'KPOINTS', 'SYMM', 'Q_entr', 'A_order',
    'S_order', 'front',
  ]);

  const tokens = headerLine.trim().split(/\s+/);
  for (const t of tokens) {
    if (!standard.has(t)) return t;
  }
  return 'SecondObjective';
}

export function parseParetoRanking(content: string): ParetoParseResult {
  const lines = content.split('\n');
  const results: ParsedPareto[] = [];
  let secondObjectiveName = 'SecondObjective';

  // Detect second objective from header
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Pareto') && trimmed.includes('ID')) {
      secondObjectiveName = detectSecondObjective(trimmed);
      break;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Data lines begin with an integer (Pareto front number)
    const tokens = trimmed.split(/\s+/);
    const front = parseInt(tokens[0], 10);
    if (isNaN(front)) continue;

    const id = parseInt(tokens[1], 10);
    if (isNaN(id)) continue;

    const origin = tokens[2] || 'Unknown';

    // Composition: first [ ... ]
    const compMatch = trimmed.match(/\[\s*([\d\s]+)\s*\]/);
    if (!compMatch) continue;
    const composition = compMatch[1].trim().split(/\s+/).map(Number);

    // After first ]
    const parts = trimmed.split(']');
    if (parts.length < 2) continue;

    const afterComp = parts[1].trim();

    // Find KPOINTS bracket [ ... ]
    const kpMatch = afterComp.match(/\[\s*([\d\s]+)\s*\]/);
    let beforeKP = afterComp;
    let afterKP = '';

    if (kpMatch) {
      const kpIdx = afterComp.indexOf('[');
      beforeKP = afterComp.substring(0, kpIdx).trim();
      const kpEnd = afterComp.indexOf(']', kpIdx);
      afterKP = afterComp.substring(kpEnd + 1).trim();
    }

    // beforeKP: enthalpy volume density secondObj convexHull
    const preNums = beforeKP.split(/\s+/).map(Number);
    const enthalpy = preNums[0] ?? 0;
    const volume = preNums[1] ?? 0;
    const density = preNums[2] ?? 0;
    const secondObjectiveValue = preNums[3] ?? 0;
    const convexHull = preNums[4] ?? 0;

    // afterKP: symm ...
    const postNums = afterKP.split(/\s+/).map(Number).filter((n) => !isNaN(n));
    const symm = postNums[0] ?? 0;

    results.push({
      paretoFront: front,
      id,
      origin,
      composition,
      enthalpy,
      volume,
      density,
      secondObjectiveValue,
      convexHull,
      symm,
    });
  }

  return { data: results, secondObjectiveName };
}
