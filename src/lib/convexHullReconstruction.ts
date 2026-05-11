/**
 * Convex hull reconstruction for USPEX Analyzer.
 *
 * Computes independently:
 *   - eForm: formation enthalpy per atom (eV/atom)
 *   - eHullRecons: distance above the reconstructed convex hull (eV/atom)
 *
 * The hull geometry is defined by fitness === 0 structures (from USPEX's own hull).
 * We recalculate E_form with our own reference potentials and compute the
 * distance to the known hull in (composition, E_form) space.
 */

import convexHull from 'convex-hull';
import { ternaryToCartesian, totalAtoms } from '@/parsers/compositionUtils';
import type { Structure, SystemType, CompositionMode } from '@/types/structure';

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

// ── Reference potential extraction ──

const PURITY_THRESHOLD = 0.95;

/**
 * For each element, find the enthalpy (eV/atom) of the "purest" converged structure.
 * Falls back to the maximum fraction found if no structure reaches 95% purity.
 */
export function extractReferencePotentials(
  structures: Structure[],
  elements: string[],
): number[] {
  const n = elements.length;
  const bestEnthalpy: number[] = new Array(n).fill(Infinity);
  const maxFrac: number[] = new Array(n).fill(-1);

  const converged = structures.filter(
    (s) => !s.isUserAdded && s.enthalpyTotal <= 900,
  );

  for (const s of converged) {
    const total = totalAtoms(s.composition);
    if (total === 0) continue;
    for (let i = 0; i < n; i++) {
      const frac = s.composition[i] / total;
      if (frac > maxFrac[i]) {
        maxFrac[i] = frac;
        if (frac >= PURITY_THRESHOLD && s.enthalpy < bestEnthalpy[i]) {
          bestEnthalpy[i] = s.enthalpy;
        }
      }
    }
  }

  // Fallback: for elements without >=95% pure structures, use the maximum-fraction structure
  for (let i = 0; i < n; i++) {
    if (bestEnthalpy[i] === Infinity) {
      let best = Infinity;
      for (const s of converged) {
        const total = totalAtoms(s.composition);
        if (total === 0) continue;
        const frac = s.composition[i] / total;
        if (frac >= maxFrac[i] * 0.99 && s.enthalpy < best) {
          best = s.enthalpy;
        }
      }
      bestEnthalpy[i] = best === Infinity ? 0 : best;
    }
  }

  return bestEnthalpy;
}

// ── Formation enthalpy ──

/**
 * E_form = enthalpy - sum(x_i * mu_i), result in eV/atom.
 */
export function computeFormationEnthalpy(
  s: Structure,
  refPots: number[],
  elements: string[],
): number {
  const total = totalAtoms(s.composition);
  if (total === 0) return 0;
  let eForm = s.enthalpy; // eV/atom
  for (let i = 0; i < elements.length; i++) {
    eForm -= (s.composition[i] / total) * refPots[i];
  }
  return eForm;
}

// ── 2D point-in-segment helpers ──

interface Point2D { x: number; y: number }

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

interface Point3D { x: number; y: number; z: number }

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

// ── Main orchestrator ──

/**
 * Compute eForm and eHullRecons for all USPEX structures.
 * Mutates the structures array in place.
 */
export function reconstructConvexHull(
  structures: Structure[],
  systemType: SystemType,
  compositionMode: CompositionMode,
  elements: string[],
): void {
  // Extract reference potentials from converged USPEX structures
  const refPots = extractReferencePotentials(structures, elements);

  const converged = structures.filter(
    (s) => !s.isUserAdded && s.enthalpyTotal <= 900,
  );

  // Step 1: Compute E_form for all structures
  for (const s of structures) {
    if (s.enthalpyTotal > 900) {
      s.eForm = -1;
      s.eHullRecons = -1;
    } else {
      s.eForm = computeFormationEnthalpy(s, refPots, elements);
    }
  }

  // Step 2: Compute E_HullReconstructed based on composition mode
  if (compositionMode === 'fixed') {
    // Fixed composition: distance = E_form - min(E_form)
    const minEForm = Math.min(
      ...converged.map((s) => s.eForm).filter((e) => isFinite(e)),
    );
    for (const s of converged) {
      s.eHullRecons = s.eForm - minEForm;
    }
    return;
  }

  // Variable composition
  if (systemType === 'binary') {
    // Binary: hull from fitness=0 structures
    const hullStructures = converged.filter((s) => s.fitness === 0);
    const hullPoints: Point2D[] = hullStructures
      .map((s) => ({ x: s.hullX[0] ?? 0, y: s.eForm }))
      .sort((a, b) => a.x - b.x);

    for (const s of converged) {
      const x = s.hullX[0] ?? 0;
      s.eHullRecons = binaryHullDistance(x, s.eForm, hullPoints);
    }
  } else if (systemType === 'ternary') {
    // Ternary: hull from fitness=0 structures in 3D
    const hullStructures = converged.filter((s) => s.fitness === 0);
    const hullPoints3D: Point3D[] = hullStructures.map((s) => {
      const [cx, cy] = ternaryToCartesian(s.composition);
      return { x: cx, y: cy, z: s.eForm };
    });

    for (const s of converged) {
      const [cx, cy] = ternaryToCartesian(s.composition);
      s.eHullRecons = ternaryHullDistance(cx, cy, s.eForm, hullPoints3D);
    }
  } else {
    // Unary: no hull needed
    for (const s of converged) {
      s.eHullRecons = 0;
    }
  }
}
