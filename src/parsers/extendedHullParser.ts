/**
 * Parser for USPEX extended_convex_hull file.
 *
 * Binary format:
 *   ID   Compositions    Enthalpies     Volumes     Fitness   SYMM    X        Y
 *                        (eV/atom)    (A^3/atom)   (eV/block)              (eV/atom)
 *    2  [    10 28  ]     -1.7829       4.1487      0.0000     82   0.737  -1.0302
 *
 * Ternary format (X has TWO values):
 *   14  [  16  0  0 ]      8.0624      16.6948      0.0000    229  -0.866 -0.500   0.0000
 *
 * After the closing bracket:
 *   enthalpy, volume, fitness, symm, ...x[compLen-1]..., y
 */

import type { ParsedExtendedHull } from '@/types/structure';

export function parseExtendedConvexHull(content: string): ParsedExtendedHull[] {
  const lines = content.split('\n');
  const results: ParsedExtendedHull[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Skip header/unit lines — data lines start with an integer
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

    // Extract remaining fields after the closing bracket
    const afterBracket = trimmed.split(']')[1];
    if (!afterBracket) continue;

    const nums = afterBracket.trim().split(/\s+/).map(Number);

    // Number of X coordinates = composition.length - 1
    // Binary (compLen=2): numX=1, total expected = 4 + 1 + 1 = 6
    // Ternary (compLen=3): numX=2, total expected = 4 + 2 + 1 = 7
    const numX = Math.max(1, composition.length - 1);
    if (nums.length < 4 + numX + 1) continue;

    const enthalpy = nums[0];
    const volume = nums[1];
    const fitness = nums[2];
    const symm = nums[3];
    const x = nums.slice(4, 4 + numX);
    const y = nums[4 + numX];

    results.push({
      id,
      composition,
      enthalpy,
      volume,
      fitness,
      symm,
      x,
      y,
    });
  }

  return results;
}
