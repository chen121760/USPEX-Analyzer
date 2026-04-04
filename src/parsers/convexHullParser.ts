/**
 * Parser for USPEX convex_hull file (per-generation snapshots).
 *
 * Format:
 * ---- generation  1 ----
 *    8   0      0.4841
 *    0  15     -1.1109
 *   10  28     -1.7829
 * ---- generation  2 ----
 *    8   0      0.4841
 *    ...
 */

import type { HullGeneration, HullGenerationEntry } from '@/types/structure';

export function parseConvexHullGenerations(content: string): HullGeneration[] {
  const lines = content.split('\n');
  const generations: HullGeneration[] = [];

  let currentGen: number | null = null;
  let currentEntries: HullGenerationEntry[] = [];

  const genPattern = /----\s*generation\s+(\d+)\s*----/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const genMatch = trimmed.match(genPattern);
    if (genMatch) {
      // Save previous generation
      if (currentGen !== null && currentEntries.length > 0) {
        generations.push({
          generation: currentGen,
          entries: currentEntries,
        });
      }

      currentGen = parseInt(genMatch[1], 10);
      currentEntries = [];
      continue;
    }

    // Data line: composition values ... enthalpy
    if (currentGen === null) continue;

    const tokens = trimmed.split(/\s+/).map(Number);
    if (tokens.some(isNaN) || tokens.length < 3) continue;

    // For binary: [n1, n2, enthalpy]
    // For ternary: [n1, n2, n3, enthalpy]
    const enthalpy = tokens[tokens.length - 1];
    const composition = tokens.slice(0, tokens.length - 1);

    currentEntries.push({ composition, enthalpy });
  }

  // Save last generation
  if (currentGen !== null && currentEntries.length > 0) {
    generations.push({
      generation: currentGen,
      entries: currentEntries,
    });
  }

  return generations;
}
