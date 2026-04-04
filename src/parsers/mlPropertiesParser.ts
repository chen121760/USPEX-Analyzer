/**
 * Parser for USPEX MLProperties file.
 *
 * Format:
 * ID   Modulus:Bulk, Shear, Youngs  Ratio:Poissons,Pughs Vicker-Hard Toughness
 *             (GPa)  (GPa)   (GPa)                           (GPa)  (MPa*m^1/2)
 *     1         0.0    0.0     0.0         0.250   0.500     10.00      5.00
 */

import type { ParsedMLProperties } from '@/types/structure';

export function parseMLProperties(content: string): ParsedMLProperties[] {
  const lines = content.split('\n');
  const results: ParsedMLProperties[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Data lines start with an integer ID
    const tokens = trimmed.split(/\s+/);
    const id = parseInt(tokens[0], 10);
    if (isNaN(id)) continue;

    // Skip if not enough numeric columns
    const nums = tokens.slice(1).map(Number);
    if (nums.length < 7 || nums.some(isNaN)) continue;

    results.push({
      id,
      bulkModulus: nums[0],
      shearModulus: nums[1],
      youngModulus: nums[2],
      poissonRatio: nums[3],
      pughRatio: nums[4],
      vickersHardness: nums[5],
      fractureToughness: nums[6],
    });
  }

  return results;
}
