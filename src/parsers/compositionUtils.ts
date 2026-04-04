/**
 * Composition and formula utility functions.
 */

/**
 * Build a chemical formula string from composition array and element names.
 * e.g., [3, 8] + ["Ti", "H"] → "Ti3H8"
 */
export function buildFormula(composition: number[], elements: string[]): string {
  if (!elements.length || composition.length !== elements.length) {
    return composition.map(String).join('-');
  }

  return elements
    .map((el, i) => {
      const count = composition[i];
      if (count === 0) return '';
      if (count === 1) return el;
      return `${el}${count}`;
    })
    .filter(Boolean)
    .join('');
}

/**
 * Get the reduced formula (GCD-divided).
 * e.g., [10, 28] → [5, 14]
 */
export function reducedComposition(composition: number[]): number[] {
  const g = composition.reduce(gcd);
  return g > 0 ? composition.map((n) => n / g) : composition;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Get the composition ratio string.
 * e.g., [10, 28] + ["Ti", "H"] → "Ti5H14"
 */
export function reducedFormula(composition: number[], elements: string[]): string {
  return buildFormula(reducedComposition(composition), elements);
}

/**
 * Total atoms in a composition.
 */
export function totalAtoms(composition: number[]): number {
  return composition.reduce((a, b) => a + b, 0);
}

/**
 * Convert composition to molar fractions.
 * e.g., [3, 8] → [0.2727, 0.7273]
 */
export function molarFractions(composition: number[]): number[] {
  const total = totalAtoms(composition);
  return total > 0 ? composition.map((n) => n / total) : composition.map(() => 0);
}

/**
 * Convert ternary composition to Cartesian coordinates for triangle plot.
 *
 * Triangle vertices:
 *   A (element 0) → (0, 0)          bottom-left
 *   B (element 1) → (0.5, √3/2)    top
 *   C (element 2) → (1, 0)          bottom-right
 */
export function ternaryToCartesian(composition: number[]): [number, number] {
  const total = totalAtoms(composition);
  if (total === 0) return [0.5, Math.sqrt(3) / 6];

  const xA = composition[0] / total;
  const xB = composition[1] / total;
  const xC = composition[2] / total;

  const x = xA * 0 + xB * 0.5 + xC * 1.0;
  const y = xA * 0 + xB * (Math.sqrt(3) / 2) + xC * 0;

  return [x, y];
}

/**
 * Get composition key string for deduplication.
 * e.g., [3, 8] → "3-8"
 */
export function compositionKey(composition: number[]): string {
  return composition.join('-');
}

/**
 * Get reduced composition key.
 */
export function reducedCompositionKey(composition: number[]): string {
  return reducedComposition(composition).join('-');
}
