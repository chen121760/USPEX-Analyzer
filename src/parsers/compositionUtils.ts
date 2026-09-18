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
 * Resolve an atomic composition into amounts of independent USPEX
 * composition blocks from the Parameters.txt numSpecies matrix.
 *
 * For example, [4, 1, 6] in the basis MgO=[1,0,1], HfO2=[0,1,2]
 * resolves to [4, 1].  The least-squares normal equations are exact for
 * valid USPEX compositions; the reconstruction check rejects unrelated or
 * rank-deficient inputs instead of returning misleading coordinates.
 */
export function componentAmountsFromComposition(
  composition: number[],
  basis: number[][],
): number[] | null {
  const componentCount = basis.length;
  const elementCount = composition.length;
  if (
    componentCount === 0 ||
    elementCount === 0 ||
    basis.some((row) => row.length !== elementCount)
  ) {
    return null;
  }

  const matrix = basis.map((rowI) => [
    ...basis.map((rowJ) => rowI.reduce(
      (sum, value, elementIndex) => sum + value * rowJ[elementIndex],
      0,
    )),
    rowI.reduce(
      (sum, value, elementIndex) => sum + value * composition[elementIndex],
      0,
    ),
  ]);

  // Gauss-Jordan elimination with partial pivoting.
  for (let col = 0; col < componentCount; col++) {
    let pivot = col;
    for (let row = col + 1; row < componentCount; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-12) return null;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];

    const divisor = matrix[col][col];
    for (let j = col; j <= componentCount; j++) matrix[col][j] /= divisor;

    for (let row = 0; row < componentCount; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let j = col; j <= componentCount; j++) {
        matrix[row][j] -= factor * matrix[col][j];
      }
    }
  }

  const amounts = matrix.map((row) => row[componentCount]);
  const scale = Math.max(1, ...composition.map(Math.abs));
  const amountTolerance = 1e-8;
  const reconstructionTolerance = 1e-8 * scale;
  if (amounts.some((value) => !Number.isFinite(value) || value < -amountTolerance)) return null;

  const cleaned = amounts.map((value) => Math.abs(value) <= amountTolerance ? 0 : value);
  // USPEX defines structures as non-negative integer combinations of the
  // numSpecies building blocks.  A merely real-valued solution (for example
  // 0.5 AC + 0.5 AB + 0.5 BC for atomic composition ABC) is not a valid block
  // decomposition and must not be used as a hull coordinate.
  if (cleaned.some((value) => Math.abs(value - Math.round(value)) > amountTolerance)) {
    return null;
  }
  const integerAmounts = cleaned.map((value) => Math.round(value));
  for (let elementIndex = 0; elementIndex < elementCount; elementIndex++) {
    const reconstructed = integerAmounts.reduce(
      (sum, amount, componentIndex) => sum + amount * basis[componentIndex][elementIndex],
      0,
    );
    if (Math.abs(reconstructed - composition[elementIndex]) > reconstructionTolerance) return null;
  }

  return integerAmounts;
}

/** Return normalized component fractions for a numSpecies composition basis. */
export function componentFractionsFromComposition(
  composition: number[],
  basis: number[][],
): number[] | null {
  const amounts = componentAmountsFromComposition(composition, basis);
  if (!amounts) return null;
  const total = amounts.reduce((sum, value) => sum + value, 0);
  return total > 0 ? amounts.map((value) => value / total) : null;
}

/** Numerical row rank of a numSpecies composition-block matrix. */
export function compositionBasisRank(basis: number[][]): number {
  if (basis.length === 0) return 0;
  const columnCount = Math.max(...basis.map((row) => row.length));
  if (columnCount === 0 || basis.some((row) => row.length !== columnCount)) return 0;

  const matrix = basis.map((row) => [...row]);
  let rank = 0;
  for (let col = 0; col < columnCount && rank < matrix.length; col++) {
    let pivot = rank;
    for (let row = rank + 1; row < matrix.length; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-12) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const divisor = matrix[rank][col];
    for (let j = col; j < columnCount; j++) matrix[rank][j] /= divisor;
    for (let row = 0; row < matrix.length; row++) {
      if (row === rank) continue;
      const factor = matrix[row][col];
      for (let j = col; j < columnCount; j++) {
        matrix[row][j] -= factor * matrix[rank][j];
      }
    }
    rank++;
  }
  return rank;
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

/** Centroid of the regular tetrahedron.  Values are relative to the unshifted embedding. */
export const TETRA_CENTROID: [number, number, number] = [0.5, Math.sqrt(3) / 6, Math.sqrt(6) / 12];

/**
 * Convert quaternary composition to Cartesian coordinates for a 3D tetrahedron plot.
 *
 * The tetrahedron is centered at origin so that turntable rotation orbits its centroid.
 *
 * Regular tetrahedron vertices (centered):
 *   A (element 0) → (-0.5,         -√3/6,   -√6/12)
 *   B (element 1) → ( 0.5,         -√3/6,   -√6/12)
 *   C (element 2) → ( 0,            √3/3,   -√6/12)
 *   D (element 3) → ( 0,            0,       √6/4 )
 *
 * Position = weighted sum of vertices by molar fraction, minus centroid.
 */
export function quaternaryToCartesian(composition: number[]): [number, number, number] {
  const total = totalAtoms(composition);
  if (total === 0) return [0, 0, 0];

  const f0 = composition[0] / total;
  const f1 = composition[1] / total;
  const f2 = composition[2] / total;
  const f3 = composition[3] / total;

  // compute in original space then shift to centroid-origin
  const x = f1 * 1 + f2 * 0.5 + f3 * 0.5 - TETRA_CENTROID[0];
  const y = f2 * (Math.sqrt(3) / 2) + f3 * (Math.sqrt(3) / 6) - TETRA_CENTROID[1];
  const z = f3 * (Math.sqrt(6) / 3) - TETRA_CENTROID[2];

  return [x, y, z];
}

/**
 * Get composition key string for deduplication.
 * e.g., [3, 8] → "3-8"
 */
export function compositionKey(composition: number[]): string {
  return composition.join('-');
}

const COMPOSITION_TOL = 1e-10;

function gcdInt(a: number, b: number): number {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/**
 * Get a stable deduplication key for a composition.
 *
 * For integer (or integer-tolerance) atom counts the key is the
 * colon-separated reduced formula, e.g. [2,10,0,0] → "1:5:0:0".
 * Non-integer compositions fall back to a high-precision normalised
 * string key.  Returns null for obviously invalid inputs.
 *
 * This matches pymatgen's convention of grouping entries by reduced
 * composition so that, e.g., Ti₂O₄ and TiO₂ share the same key.
 */
export function reducedCompositionKey(composition: number[]): string | null {
  if (
    composition.length < 2 ||
    composition.some((v) => !Number.isFinite(v) || v < 0)
  ) {
    return null;
  }

  const total = composition.reduce((sum, v) => sum + v, 0);
  if (!(total > 0)) return null;

  const rounded = composition.map((v) => Math.round(v));
  const integerLike = composition.every(
    (v, idx) => Math.abs(v - rounded[idx]) <= COMPOSITION_TOL,
  );

  if (integerLike) {
    const nonZero = rounded.filter((v) => v !== 0);
    const divisor = nonZero.reduce((g, v) => gcdInt(g, v), 0) || 1;
    return rounded.map((v) => v / divisor).join(':');
  }

  return composition
    .map((v) => v / total)
    .map((v) => v.toPrecision(15))
    .join(':');
}

/**
 * Convert a plain chemical formula string to HTML with subscript numbers.
 * e.g., "Fe2O3" → "Fe<sub>2</sub>O<sub>3</sub>"
 * e.g., "Ca3Al2Si3O12" → "Ca<sub>3</sub>Al<sub>2</sub>Si<sub>3</sub>O<sub>12</sub>"
 *
 * Safe to use with dangerouslySetInnerHTML because the formula is always
 * generated internally by buildFormula() — never from user input.
 */
export function formulaToHtml(formula: string): string {
  // 用正则把所有"连续数字"替换成 <sub>数字</sub>
  // \d+ 匹配一个或多个连续数字
  return formula.replace(/(\d+)/g, '<sub>$1</sub>');
}
