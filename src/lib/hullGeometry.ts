import convexHull from 'convex-hull';

// ── 3D geometry helpers (replicated from ternaryHull.ts) ──

function cross3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function faceNormal(v0: number[], v1: number[], v2: number[]): [number, number, number] {
  return cross3(
    [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]],
    [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]],
  );
}

// ── 2D point-in-segment helpers ──

export interface Point2D { x: number; y: number }

/* ------------------------------------------------------------------ */
/*  2D lower convex hull — Andrew's monotone chain                    */
/* ------------------------------------------------------------------ */

/**
 * Compute the 2D lower convex hull of a set of (x, y) points.
 * Uses Andrew's monotone chain algorithm (single pass, lower envelope only).
 * Points are sorted by x (then y); cross-product <= 0 pops non-hull points.
 *
 * The lower hull is a function of x, so only the lowest-energy point at a given
 * x can be on it.  Keeping the others would draw a vertical segment at that
 * composition (visible whenever a run has several structures of one composition
 * on the hull, e.g. pure-element polymorphs) and would make "the hull energy at
 * x" ambiguous.
 */
export function computeLowerHull2D(points: Point2D[]): Point2D[] {
  if (points.length < 2) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique: Point2D[] = [];
  for (const p of sorted) {
    // Sorted by y within an x, so the first one seen is the lowest.  The
    // tolerance matters: 2/6, 3/9 and 1/3 are the same composition but not the
    // same double, and without it those duplicates reappear as zero-width
    // vertical segments in the drawn hull.
    if (unique.length > 0 && p.x - unique[unique.length - 1].x < 1e-9) continue;
    unique.push(p);
  }
  if (unique.length < 2) return unique;

  const hull: Point2D[] = [];
  for (const p of unique) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) <= 0) {
        hull.pop();
      } else {
        break;
      }
    }
    hull.push(p);
  }
  return hull;
}

/**
 * Vertical distance from point (px, py) to the hull segment (a, b).
 * Returns the energy above hull: pz - hull_z at the same x.
 * If px is outside [a.x, b.x], returns Infinity (not under this segment).
 */
function verticalDistToSeg(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  if (px < ax - 1e-12 || px > bx + 1e-12) return Infinity;
  // Linear interpolation of hull energy at px
  const dx = bx - ax;
  if (Math.abs(dx) < 1e-12) {
    // Vertical segment — use closest endpoint
    return py - Math.min(ay, by);
  }
  const t = (px - ax) / dx;
  // Clamp t for numerical stability
  const tc = Math.max(0, Math.min(1, t));
  const hullY = ay + (by - ay) * tc;
  return py - hullY;
}

// ── Binary (2D) hull distance ──

/**
 * Compute distance above hull for binary system.
 * Hull is defined by fitness=0 structures sorted by hullX[0].
 * Distance = vertical distance (eV/atom) from (x, E_form) to the hull.
 */
export function binaryHullDistance(
  x: number,
  eForm: number,
  hullPoints: Point2D[],
): number {
  if (hullPoints.length < 2) return 0;
  let minDist = Infinity;
  for (let i = 0; i < hullPoints.length - 1; i++) {
    const d = verticalDistToSeg(x, eForm, hullPoints[i].x, hullPoints[i].y, hullPoints[i + 1].x, hullPoints[i + 1].y);
    if (d < minDist) minDist = d;
  }
  // If x is left of the leftmost hull point, distance to leftmost is fine
  if (x < hullPoints[0].x) {
    const d = eForm - hullPoints[0].y;
    if (d < minDist) minDist = d;
  }
  if (x > hullPoints[hullPoints.length - 1].x) {
    const d = eForm - hullPoints[hullPoints.length - 1].y;
    if (d < minDist) minDist = d;
  }
  return Math.max(0, minDist);
}

// ── Ternary (3D) hull distance ──

export interface Point3D { x: number; y: number; z: number }

/** Pre-computed lower hull face for O(1) distance queries. */
export interface TernaryLowerFace {
  v0: Point3D;
  v1: Point3D;
  v2: Point3D;
}

/**
 * Pre-compute the lower convex hull faces from a set of 3D points.
 * Call this ONCE, then use ternaryHullDistanceFromFaces() for each point.
 * This avoids the O(N * convex_hull(N)) trap of calling ternaryHullDistance()
 * repeatedly on the same hull.
 */
export function computeTernaryLowerFaces(
  hullPoints3D: Point3D[],
): TernaryLowerFace[] {
  if (hullPoints3D.length < 4) return [];

  const coords = hullPoints3D.map((p) => [p.x, p.y, p.z] as [number, number, number]);
  let faces: number[][];
  try {
    faces = convexHull(coords);
  } catch {
    return [];
  }

  if (!faces || faces.length === 0) return [];

  const result: TernaryLowerFace[] = [];

  for (const face of faces) {
    if (face.length < 3) continue;
    const v0 = coords[face[0]];
    const v1 = coords[face[1]];
    const v2 = coords[face[2]];

    const normal = faceNormal(v0, v1, v2);
    if (normal[2] >= -1e-10) continue;

    result.push({
      v0: { x: v0[0], y: v0[1], z: v0[2] },
      v1: { x: v1[0], y: v1[1], z: v1[2] },
      v2: { x: v2[0], y: v2[1], z: v2[2] },
    });
  }

  return result;
}

/**
 * Fast vertical distance above ternary hull using pre-computed lower faces.
 * Avoids re-running convexHull().
 */
export function ternaryHullDistanceFromFaces(
  px: number, py: number, pz: number,
  lowerFaces: TernaryLowerFace[],
): number {
  if (lowerFaces.length === 0) return 0;

  let minDist = Infinity;

  for (const { v0, v1, v2 } of lowerFaces) {
    if (!pointInTriangle2D(px, py, v0.x, v0.y, v1.x, v1.y, v2.x, v2.y)) {
      continue;
    }
    const hullZ = barycentricZ(px, py, v0, v1, v2);
    const dist = pz - hullZ;
    if (dist < minDist) minDist = dist;
  }

  if (minDist === Infinity) {
    const allZ = lowerFaces.flatMap((f) => [f.v0.z, f.v1.z, f.v2.z]);
    const minZ = allZ.length > 0 ? Math.min(...allZ) : 0;
    minDist = pz - minZ;
  }

  return Math.max(0, minDist);
}

/**
 * Check whether (px, py) lies inside the 2D projection of triangle (a, b, c).
 * Uses barycentric technique: point inside if all three sub-triangle areas
 * have the same sign.
 */
function pointInTriangle2D(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): boolean {
  const sign = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
    (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);

  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);

  const hasNeg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12;
  const hasPos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;

  return !(hasNeg && hasPos); // all same sign (or zero) = inside
}

/**
 * Barycentric interpolation of z at (px, py) within triangle (v0, v1, v2).
 */
function barycentricZ(
  px: number, py: number,
  v0: Point3D, v1: Point3D, v2: Point3D,
): number {
  const det = (v1.y - v2.y) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.y - v2.y);
  if (Math.abs(det) < 1e-12) return v0.z; // degenerate
  const w0 = ((v1.y - v2.y) * (px - v2.x) + (v2.x - v1.x) * (py - v2.y)) / det;
  const w1 = ((v2.y - v0.y) * (px - v2.x) + (v0.x - v2.x) * (py - v2.y)) / det;
  const w2 = 1 - w0 - w1;
  return w0 * v0.z + w1 * v1.z + w2 * v2.z;
}

/**
 * Compute distance above hull for ternary system.
 * Hull is defined by fitness=0 structures as 3D points (cartX, cartY, E_form).
 * Uses the convex-hull npm package on those points to get the face indices,
 * then for each lower face, computes the vertical (energy) distance.
 */
export function ternaryHullDistance(
  px: number, py: number, pz: number,
  hullPoints3D: Point3D[],
): number {
  if (hullPoints3D.length < 4) {
    // Degenerate: not enough points for a 3D hull
    // Find min E_form and return vertical distance
    const minZ = Math.min(...hullPoints3D.map((p) => p.z));
    return pz - minZ;
  }

  const coords = hullPoints3D.map((p) => [p.x, p.y, p.z]);
  let faces: number[][];
  try {
    faces = convexHull(coords);
  } catch {
    // convex-hull fails on degenerate input
    const minZ = Math.min(...hullPoints3D.map((p) => p.z));
    return Math.max(0, pz - minZ);
  }

  if (!faces || faces.length === 0) {
    const minZ = Math.min(...hullPoints3D.map((p) => p.z));
    return Math.max(0, pz - minZ);
  }

  let minDist = Infinity;

  for (const face of faces) {
    if (face.length < 3) continue; // not a triangle
    const v0 = coords[face[0]];
    const v1 = coords[face[1]];
    const v2 = coords[face[2]];

    // Only consider lower faces (normal pointing downward in energy direction)
    const normal = faceNormal(v0, v1, v2);
    if (normal[2] >= -1e-10) continue; // upper or vertical face, skip

    // Check if (px, py) projects inside this face's 2D projection
    if (!pointInTriangle2D(px, py, v0[0], v0[1], v1[0], v1[1], v2[0], v2[1])) {
      continue;
    }

    // Barycentric interpolation of hull energy at (px, py)
    const p0: Point3D = { x: v0[0], y: v0[1], z: v0[2] };
    const p1: Point3D = { x: v1[0], y: v1[1], z: v1[2] };
    const p2: Point3D = { x: v2[0], y: v2[1], z: v2[2] };
    const hullZ = barycentricZ(px, py, p0, p1, p2);
    const dist = pz - hullZ;

    if (dist < minDist) minDist = dist;
  }

  // If the point doesn't project inside any lower face, fall back to
  // min distance to all hull points
  if (minDist === Infinity) {
    const minZ = Math.min(...hullPoints3D.map((p) => p.z));
    minDist = pz - minZ;
  }

  return Math.max(0, minDist);
}
