/**
 * Parser for USPEX origin file.
 *
 * Format:
 *  ID    Origin    Enthalpy   Parent-E   Parent-ID
 *    1   Seeds       26.289    26.289  [         0]
 *  349   Heredity    -1.418    -1.425  [    18   191]
 */

import type { ParsedOrigin, OriginMethod } from '@/types/structure';

export function parseOrigin(content: string): ParsedOrigin[] {
  const lines = content.split('\n');
  const results: ParsedOrigin[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Data lines start with an integer ID
    const tokens = trimmed.split(/\s+/);
    const id = parseInt(tokens[0], 10);
    if (isNaN(id)) continue;

    // Origin method — use whatever value is in the file
    const origin: OriginMethod = tokens[1] || 'Unknown';

    const enthalpy = parseFloat(tokens[2]) || 0;
    const parentEnthalpy = parseFloat(tokens[3]) || 0;

    // Parent IDs from [ ... ]
    const bracketMatch = trimmed.match(/\[\s*([\d\s]+)\s*\]/);
    let parentIds: number[] = [];
    if (bracketMatch) {
      parentIds = bracketMatch[1]
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0); // filter out 0 (= no parent)
    }

    results.push({
      id,
      origin,
      enthalpy,
      parentEnthalpy,
      parentIds,
    });
  }

  return results;
}
