/**
 * Lower-hull distance in four-dimensional (composition, energy) space.
 *
 * A quaternary system has three independent mole fractions plus the formation
 * energy, so its energy above the hull is the vertical distance to the lower
 * envelope of a 4D point cloud.  The cloud lives in
 * `(x, y, z, E_form)` with `x/y/z` the mole fractions of the first three
 * components (the fourth follows from `1 - x - y - z`); the lower envelope is
 * the set of facets of the 4D convex hull whose outward normal points down in
 * energy.
 *
 * This is the quaternary counterpart of `computeLowerHull2D` (binary) and
 * `computeTernaryLowerFaces` (ternary) in `convexHullReconstruction.ts`, and it
 * is only used when a run provides no hull distance of its own (USPEX writes it
 * into `extended_convex_hull`, which an interrupted run leaves header-only).
 *
 * Geometry note: for any point, the vertical distance to *any* lower facet is
 * an upper bound of the true energy above hull, and the facet whose projection
 * contains the point attains it, so the minimum over all lower facets is exact
 * — no point-in-simplex test is needed.
 */

import convexHull from 'convex-hull';

/** One structure in hull space: three mole fractions plus the formation energy. */
export interface Point4D {
  x: number;
  y: number;
  z: number;
  e: number;
}

/** Plane `E = a + b0*x + b1*y + b2*z`, stored as `[b0, b1, b2, a]`. */
export type LowerPlane4D = [number, number, number, number];

/** Below this determinant a facet is degenerate (coplanar vertices). */
const DETERMINANT_TOLERANCE = 1e-12;

/** Outward normals with an energy component above this are upper facets. */
const LOWER_FACET_TOLERANCE = 1e-9;

type Vec4 = [number, number, number, number];

function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/**
 * Generalized cross product of three vectors in R^4: the unique direction
 * orthogonal to all three, from the signed 3x3 minors of `[e1; e2; e3]`.
 */
function normal4(e1: Vec4, e2: Vec4, e3: Vec4): Vec4 {
  const rows = [e1, e2, e3];
  const result: number[] = [];
  for (let column = 0; column < 4; column++) {
    const columns = [0, 1, 2, 3].filter((index) => index !== column);
    const minor = rows.map((row) => columns.map((index) => row[index]));
    result.push((column % 2 === 0 ? 1 : -1) * det3(minor));
  }
  return result as Vec4;
}

function dot4(a: Vec4, b: Vec4): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/**
 * Solve the hyperplane through four affinely independent vertices:
 * `E = a + b0*x + b1*y + b2*z` (Gauss-Jordan with partial pivoting).
 */
function solvePlane(vertices: number[][]): LowerPlane4D | null {
  const m = vertices.map((vertex) => [
    vertex[0],
    vertex[1],
    vertex[2],
    1,
    vertex[3],
  ]);

  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) {
      if (Math.abs(m[row][column]) > Math.abs(m[pivot][column])) pivot = row;
    }
    [m[column], m[pivot]] = [m[pivot], m[column]];
    if (Math.abs(m[column][column]) < DETERMINANT_TOLERANCE) return null;
    for (let row = 0; row < 4; row++) {
      if (row === column) continue;
      const factor = m[row][column] / m[column][column];
      for (let k = column; k < 5; k++) m[row][k] -= factor * m[column][k];
    }
  }

  return [
    m[0][4] / m[0][0],
    m[1][4] / m[1][1],
    m[2][4] / m[2][2],
    m[3][4] / m[3][3],
  ];
}

/**
 * Lower-hull planes of a 4D point cloud.
 *
 * Returns an empty array when the cloud is too small or degenerate; callers
 * must treat that as "hull not available" rather than as "everything is on the
 * hull".
 */
export function computeQuaternaryLowerPlanes(
  points: readonly Point4D[],
): LowerPlane4D[] {
  // A 4D hull needs at least a 4-simplex (5 vertices).
  if (points.length < 5) return [];

  const coords = points.map((point) => [point.x, point.y, point.z, point.e]);

  let facets: number[][];
  try {
    facets = convexHull(coords);
  } catch {
    return [];
  }
  if (!facets || facets.length === 0) return [];

  // The centroid lies strictly inside the hull, so it orients each facet's
  // normal outwards.
  const centroid: Vec4 = [0, 0, 0, 0];
  for (const point of coords) {
    for (let i = 0; i < 4; i++) centroid[i] += point[i] / coords.length;
  }

  const planes: LowerPlane4D[] = [];
  for (const facet of facets) {
    if (facet.length !== 4) continue;
    const vertices = facet.map((index) => coords[index]);

    const e1 = vertices[1].map((v, i) => v - vertices[0][i]) as Vec4;
    const e2 = vertices[2].map((v, i) => v - vertices[0][i]) as Vec4;
    const e3 = vertices[3].map((v, i) => v - vertices[0][i]) as Vec4;

    let normal = normal4(e1, e2, e3);
    const length = Math.hypot(normal[0], normal[1], normal[2], normal[3]);
    if (!(length > DETERMINANT_TOLERANCE)) continue;
    normal = normal.map((value) => value / length) as Vec4;

    const toCentroid = vertices[0].map((v, i) => centroid[i] - v) as Vec4;
    // The centroid lies strictly inside the hull, so the outward normal points
    // away from it: n · (centroid - v0) must be negative.
    if (dot4(normal, toCentroid) > 0) {
      normal = normal.map((value) => -value) as Vec4;
    }
    // Outward normal pointing down in energy = lower (stable) facet.
    if (normal[3] >= -LOWER_FACET_TOLERANCE) continue;

    const plane = solvePlane(vertices);
    if (plane) planes.push(plane);
  }

  return planes;
}

/**
 * Vertical distance (same unit as `e`, i.e. eV/atom or eV/block) from a point
 * to the lower hull, i.e. its energy above hull.
 *
 * `NaN` means the hull is not available.  Small negative values caused by
 * floating-point error are clamped to zero.
 */
export function quaternaryHullDistance(
  x: number,
  y: number,
  z: number,
  e: number,
  planes: readonly LowerPlane4D[],
): number {
  if (planes.length === 0) return Number.NaN;

  let best = Infinity;
  for (const [b0, b1, b2, a] of planes) {
    const distance = e - (a + b0 * x + b1 * y + b2 * z);
    if (distance < best) best = distance;
  }
  return Number.isFinite(best) ? Math.max(0, best) : Number.NaN;
}
