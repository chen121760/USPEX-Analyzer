/**
 * Parser for USPEX extended_convex_hull file.
 *
 * Format example:
 *   ID   Compositions    Enthalpies     Volumes     Fitness   SYMM    X        Y
 *                        (eV/atom)    (A^3/atom)   (eV/block)              (eV/atom)
 *    2  [    10 28  ]     -1.7829       4.1487      0.0000     82   0.737  -1.0302
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
    // Expected order: enthalpy, volume, fitness, symm, x, y
    if (nums.length < 6) continue;

    results.push({
      id,
      composition,
      enthalpy: nums[0],
      volume: nums[1],
      fitness: nums[2],
      symm: nums[3],
      x: nums[4],
      y: nums[5],
    });
  }

  return results;
}
