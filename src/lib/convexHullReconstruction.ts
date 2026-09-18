/**
 * Convex hull reconstruction for USPEX Analyzer.
 *
 * Computes independently:
 *   - eForm: formation enthalpy per atom, or per numSpecies block
 *   - eHullRecons: distance above the reconstructed convex hull in the same unit
 *
 * The hull geometry is defined by fitness === 0 structures (from USPEX's own hull).
 * We recalculate E_form with our own reference potentials and compute the
 * distance to the known hull in (composition, E_form) space.
 */

import convexHull from 'convex-hull';
import {
  buildFormula,
  componentAmountsFromComposition,
  compositionBasisRank,
  ternaryToCartesian,
  totalAtoms,
} from '@/parsers/compositionUtils';
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

// ── Reference potentials ──

/**
 * Reference chemical potentials are extracted from exact endmembers only: a
 * structure whose composition consists solely of one component — a pure
 * elemental phase for the atomic basis, a single numSpecies block for the
 * composition-block basis.
 *
 * Near-endmember phases are deliberately rejected.  Using A19B1 as the "A"
 * reference shifts every reported formation enthalpy by roughly
 * (mu_B - mu_A + dHf(A19B1)) / 20, which is the same order of magnitude as the
 * physics being reported, and it makes E_form depend on which phases the search
 * happened to visit rather than on the elements themselves.  When a component
 * has no exact endmember the potential is reported as missing and the affected
 * structures are marked invalid instead of receiving a pseudo-reference.
 *
 * Reference extraction is a pure function of the structure set: it must be
 * invariant under any permutation of the input rows.  The previous
 * implementation nested the enthalpy update inside the purity update
 * (`if (frac > maxFrac) { maxFrac = frac; if (frac >= 0.95 && ...) }`), so two
 * equally pure phases could never be compared and the extracted potential was
 * decided by which row of Individuals came first.
 */
export interface ReferenceResolution {
  /** Normalization the potentials are expressed in. */
  kind: 'elemental' | 'component';
  /** Energy unit of formation enthalpies computed with these potentials. */
  unit: 'eV/atom' | 'eV/block';
  /** Component labels aligned with `potentials`. */
  labels: string[];
  /** Known potentials; NaN for every index listed in `missing`. */
  potentials: number[];
  /** Component indices that have no exact endmember in this dataset. */
  missing: number[];
  /** Convenience flag: `missing.length === 0`. */
  complete: boolean;
  /** Why the resolution is incomplete (or 'ok'). */
  reason: 'ok' | 'missing-endmember' | 'rank-deficient';
}

/** Relative tolerance for "all other components are zero". */
const ENDMEMBER_TOLERANCE = 1e-9;

/** True when the declared numSpecies basis is usable for this dataset. */
export function usesComponentBasis(
  compositionMode: CompositionMode,
  compositionBasis: number[][],
): boolean {
  return compositionMode === 'varcomp' &&
    compositionBasis.length >= 2 &&
    compositionBasisRank(compositionBasis) === compositionBasis.length;
}

/** True when every component except `index` is zero. */
function isEndmemberOf(amounts: number[], index: number): boolean {
  if (!(amounts[index] > 0)) return false;
  for (let i = 0; i < amounts.length; i++) {
    if (i !== index && Math.abs(amounts[i]) > ENDMEMBER_TOLERANCE) return false;
  }
  return true;
}

/** Total energy of one structure in eV (cell), not per atom. */
function totalEnergyOf(s: Structure): number {
  return Number.isFinite(s.enthalpyTotal)
    ? s.enthalpyTotal
    : s.enthalpy * totalAtoms(s.composition);
}

function missingIndices(potentials: number[]): number[] {
  const missing: number[] = [];
  for (let i = 0; i < potentials.length; i++) {
    if (!Number.isFinite(potentials[i])) missing.push(i);
  }
  return missing;
}

/**
 * Resolve the reference potentials of a dataset.
 *
 * `kind: 'component'` is used when a valid numSpecies basis is declared,
 * otherwise the atomic (elemental) basis is used.  Callers that need to report
 * missing references must use this function: the -1 written into `eForm` is a
 * display sentinel and must never be used to infer reference availability.
 */
export function resolveReferences(
  structures: Structure[],
  elements: string[],
  compositionMode: CompositionMode,
  compositionBasis: number[][] = [],
): ReferenceResolution {
  // Only converged USPEX structures define a reference, and never user-added
  // ones: a user-added enthalpy is a hypothesis, not a measurement.
  const usable = structures.filter(
    (s) => !s.isUserAdded && s.enthalpyTotal <= 900,
  );

  if (usesComponentBasis(compositionMode, compositionBasis)) {
    const componentCount = compositionBasis.length;
    const labels = compositionBasis.map((row) => buildFormula(row, elements));
    const potentials: number[] = new Array(componentCount).fill(Number.NaN);
    for (const s of usable) {
      const amounts = componentAmountsFromComposition(s.composition, compositionBasis);
      if (!amounts) continue;
      const totalBlocks = amounts.reduce((sum, value) => sum + value, 0);
      if (!(totalBlocks > 0)) continue;
      const perBlock = totalEnergyOf(s) / totalBlocks;
      for (let i = 0; i < componentCount; i++) {
        if (!isEndmemberOf(amounts, i)) continue;
        // Several polymorphs of one endmember may exist: keep the ground state.
        if (!Number.isFinite(potentials[i]) || perBlock < potentials[i]) {
          potentials[i] = perBlock;
        }
      }
    }
    const missing = missingIndices(potentials);
    return {
      kind: 'component',
      unit: 'eV/block',
      labels,
      potentials,
      missing,
      complete: missing.length === 0,
      reason: missing.length === 0 ? 'ok' : 'missing-endmember',
    };
  }

  const labels = [...elements];
  const potentials: number[] = new Array(elements.length).fill(Number.NaN);
  for (const s of usable) {
    const total = totalAtoms(s.composition);
    if (!(total > 0)) continue;
    for (let i = 0; i < elements.length; i++) {
      if (!isEndmemberOf(s.composition, i)) continue;
      if (!Number.isFinite(potentials[i]) || s.enthalpy < potentials[i]) {
        potentials[i] = s.enthalpy;
      }
    }
  }
  const missing = missingIndices(potentials);
  return {
    kind: 'elemental',
    unit: 'eV/atom',
    labels,
    potentials,
    missing,
    complete: missing.length === 0,
    reason: missing.length === 0 ? 'ok' : 'missing-endmember',
  };
}

// ── Formation enthalpy ──

/**
 * Standard formation enthalpy of one structure, in the resolution's unit.
 *
 * Returns null when the value is not defined for this structure: either its
 * composition needs a reference potential the dataset does not provide, or the
 * composition cannot be expressed in the declared composition basis.  Callers
 * must treat null as "not available" and must not decide membership by
 * comparing a computed value against the -1 sentinel.
 */
export function computeFormationEnthalpyWith(
  s: Structure,
  references: ReferenceResolution,
  compositionBasis: number[][] = [],
): number | null {
  if (references.kind === 'component') {
    const amounts = componentAmountsFromComposition(s.composition, compositionBasis);
    if (!amounts) return null;
    const totalBlocks = amounts.reduce((sum, value) => sum + value, 0);
    if (!(totalBlocks > 0)) return null;
    let eForm = totalEnergyOf(s) / totalBlocks;
    for (let i = 0; i < amounts.length; i++) {
      if (amounts[i] === 0) continue;
      const potential = references.potentials[i];
      if (!Number.isFinite(potential)) return null;
      eForm -= (amounts[i] / totalBlocks) * potential;
    }
    return eForm;
  }

  const total = totalAtoms(s.composition);
  if (!(total > 0)) return null;
  let eForm = totalEnergyOf(s) / total; // eV/atom
  for (let i = 0; i < s.composition.length; i++) {
    if (s.composition[i] === 0) continue;
    const potential = references.potentials[i];
    if (!Number.isFinite(potential)) return null;
    eForm -= (s.composition[i] / total) * potential;
  }
  return eForm;
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
 */
export function computeLowerHull2D(points: Point2D[]): Point2D[] {
  if (points.length < 2) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const hull: Point2D[] = [];
  for (const p of sorted) {
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

// ── Main orchestrator ──

/**
 * Compute eForm and eHullRecons for all USPEX structures.
 * Mutates the structures array in place and returns the reference resolution
 * used, so callers can report missing references instead of guessing from the
 * -1 sentinel written into `eForm`.
 */
export function reconstructConvexHull(
  structures: Structure[],
  systemType: SystemType,
  compositionMode: CompositionMode,
  elements: string[],
  compositionBasis: number[][] = [],
): ReferenceResolution {
  const declaredBasis = compositionMode === 'varcomp' && compositionBasis.length >= 2;
  const basisLabels = declaredBasis
    ? compositionBasis.map((row) => buildFormula(row, elements))
    : [];
  const rankDeficient: ReferenceResolution = {
    kind: 'component',
    unit: 'eV/block',
    labels: basisLabels,
    potentials: new Array(compositionBasis.length).fill(Number.NaN),
    missing: compositionBasis.map((_, index) => index),
    complete: false,
    reason: 'rank-deficient',
  };
  if (declaredBasis && compositionBasisRank(compositionBasis) !== compositionBasis.length) {
    // Linearly dependent blocks: no structure has unique block coordinates, so
    // neither E_form nor E_hull is defined for this dataset.
    for (const s of structures) {
      s.eForm = -1;
      s.eHullRecons = -1;
    }
    return rankDeficient;
  }

  // A composition-block hull is normalized per block; the atomic basis
  // naturally reduces to the ordinary elemental eV/atom formulation.
  const references = resolveReferences(structures, elements, compositionMode, compositionBasis);
  const useCompositionBasis = references.kind === 'component';

  // Structures whose E_form is not defined.  This set — not a comparison
  // against the -1 sentinel — decides hull membership, so a legitimate E_form
  // of exactly -1 is not mistaken for a missing value.
  const undefinedFormation = new Set<Structure>();

  // Step 1: Compute E_form for all structures
  for (const s of structures) {
    const formation = s.enthalpyTotal > 900
      ? null
      : computeFormationEnthalpyWith(s, references, compositionBasis);
    if (formation === null) {
      s.eForm = -1;
      s.eHullRecons = -1;
      undefinedFormation.add(s);
    } else {
      s.eForm = formation;
    }
  }

  const converged = structures.filter(
    (s) => !s.isUserAdded && s.enthalpyTotal <= 900 && !undefinedFormation.has(s),
  );

  // Step 2: Compute E_HullReconstructed based on composition mode
  if (compositionMode === 'fixed') {
    // Fixed composition: every structure shares one composition, so the
    // reference gauge cancels and only differences matter.
    const minEForm = Math.min(
      ...converged.map((s) => s.eForm).filter((e) => isFinite(e)),
    );
    for (const s of converged) {
      s.eHullRecons = s.eForm - minEForm;
    }
    return references;
  }

  // Variable composition
  if (systemType === 'binary') {
    // Binary: hull from fitness=0 structures
    const hullStructures = converged.filter((s) => s.fitness <= 0);
    const hullCandidates: Point2D[] = hullStructures
      .map((s) => ({ x: s.hullX[0] ?? 0, y: s.eForm }))
      .sort((a, b) => a.x - b.x);
    const hullPoints = computeLowerHull2D(hullCandidates);

    for (const s of converged) {
      const x = s.hullX[0] ?? 0;
      s.eHullRecons = binaryHullDistance(x, s.eForm, hullPoints);
    }
  } else if (systemType === 'ternary') {
    // Ternary: hull from fitness=0 structures in 3D
    const hullStructures = converged.filter((s) => s.fitness <= 0);
    const hullPoints3D: Point3D[] = hullStructures.map((s) => {
      const plotComposition = useCompositionBasis
        ? componentAmountsFromComposition(s.composition, compositionBasis) ?? s.composition
        : s.composition;
      const [cx, cy] = ternaryToCartesian(plotComposition);
      return { x: cx, y: cy, z: s.eForm };
    });

    // Pre-compute lower faces ONCE instead of per-structure convexHull()
    const lowerFaces = computeTernaryLowerFaces(hullPoints3D);

    for (const s of converged) {
      const plotComposition = useCompositionBasis
        ? componentAmountsFromComposition(s.composition, compositionBasis) ?? s.composition
        : s.composition;
      const [cx, cy] = ternaryToCartesian(plotComposition);
      s.eHullRecons = lowerFaces.length > 0
        ? ternaryHullDistanceFromFaces(cx, cy, s.eForm, lowerFaces)
        : hullPoints3D.length > 0
          ? Math.max(0, s.eForm - Math.min(...hullPoints3D.map(p => p.z)))
          : 0;
    }
  } else if (systemType === 'quaternary') {
    // Quaternary: USPEX already provides hull distance via fitness / e_above_hull.
    // We compute eForm here but skip 4D hull reconstruction.
    for (const s of converged) {
      s.eHullRecons = s.fitness >= 0 ? s.fitness : 0;
    }
  } else {
    // Unary: no hull needed
    for (const s of converged) {
      s.eHullRecons = 0;
    }
  }

  return references;
}
