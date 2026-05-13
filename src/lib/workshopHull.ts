/**
 * Pure-geometric convex hull computation for the Hull Workshop.
 *
 * Unlike reconstructConvexHull(), this uses ALL structures to define the
 * convex hull geometry — NOT just fitness===0 structures.  This is essential
 * for workshop use where imported CSV data has no USPEX fitness field (or
 * fitness values from different calculation runs that are not comparable).
 *
 * Strategy:
 *   1. extractReferencePotentials() on all valid structures
 *   2. computeFormationEnthalpy() for each structure
 *   3. Binary:  computeLowerHull2D() on ALL (x, eForm) points,
 *                then binaryHullDistance() for each structure.
 *   4. Ternary: pass ALL structures into ternaryHullDistance().
 *               The convex-hull package computes the 3D convex hull
 *               internally — interior points are excluded from faces
 *               automatically, and upper faces are filtered by normal.z.
 *   5. Fixed:   eHullRecons = eForm - min(eForm).
 */

import convexHull from 'convex-hull';
import {
  extractReferencePotentials,
  computeFormationEnthalpy,
  computeLowerHull2D,
  binaryHullDistance,
  computeTernaryLowerFaces,
  ternaryHullDistanceFromFaces,
  type Point2D,
  type Point3D,
  type TernaryLowerFace,
} from './convexHullReconstruction';
import { ternaryToCartesian, totalAtoms } from '@/parsers/compositionUtils';
import type { Structure, SystemInfo } from '@/types/structure';

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface WorkshopHullResult {
  /** Structures with hull fields set (mutated in place) */
  structures: Structure[];
  /** Binary-only: convex hull line points for display (solid = current) */
  hullLine?: Point2D[];
  /** Binary-only: old hull before user-added expansion (dashed) */
  oldHullLine?: Point2D[];
  /** Ternary-only: tie-line edges for display (solid = current) */
  hullEdges?: { p1: [number, number]; p2: [number, number] }[];
  /** Ternary-only: old edges before user-added expansion (dashed) */
  oldHullEdges?: { p1: [number, number]; p2: [number, number] }[];
  /** True when user-added structures expanded the hull */
  hullExpanded?: boolean;
}

/**
 * Compute a geometric convex hull on arbitrary Structure data.
 *
 * Two-pass strategy with user-added structure handling:
 *   Pass 1: compute hull WITHOUT user-added structures → old hull.
 *   If any user-added structure lands on/below the old hull (fitness≤0),
 *   Pass 2: recompute WITH user-added → new hull, update all fitness.
 *   Otherwise user-added fitness stays as distance to the old hull.
 */
export function computeGeometricHull(
  structures: Structure[],
  systemInfo: SystemInfo,
): WorkshopHullResult {
  const { elements, systemType, compositionMode } = systemInfo;

  if (structures.length === 0) {
    return { structures, hullLine: [], hullEdges: [] };
  }

  const refPots = extractReferencePotentials(structures, elements);

  for (const s of structures) {
    if (s.enthalpyTotal > 900) {
      s.eForm = -1;
      s.fitness = -1;
    } else {
      s.eForm = computeFormationEnthalpy(s, refPots, elements);
      s.hullY = s.eForm;
    }
  }

  ensureHullX(structures, elements);

  if (compositionMode === 'fixed') {
    const valid = structures.filter((s) => !s.isUserAdded && s.enthalpyTotal <= 900);
    const eForms = valid.map((s) => s.eForm).filter((e) => isFinite(e));
    const minEForm = eForms.length > 0 ? Math.min(...eForms) : 0;
    const allValid = structures.filter((s) => s.enthalpyTotal <= 900);
    for (const s of allValid) {
      s.fitness = s.eForm - minEForm;
    }
    // Recompute if user-added lowered the minimum
    const user = allValid.filter((s) => s.isUserAdded);
    const minUA = user.length > 0 ? Math.min(...user.map((s) => s.eForm)) : Infinity;
    if (minUA < minEForm) {
      const newMin = Math.min(minEForm, minUA);
      for (const s of allValid) {
        s.fitness = s.eForm - newMin;
      }
      return { structures, hullExpanded: true };
    }
    return { structures };
  }

  if (systemType === 'binary') {
    const valid = structures.filter((s) => !s.isUserAdded && s.enthalpyTotal <= 900);
    const userAdded = structures.filter((s) => s.isUserAdded && s.enthalpyTotal <= 900);
    const oldResult = computeBinaryHull(structures, valid);
    // Compute fitness for user-added against old hull
    computeFitnessForUserAdded(userAdded, oldResult.hullLine, systemType);

    // Check if any user-added expanded the hull
    const expanded = userAdded.some((s) => s.fitness <= 0);
    if (expanded && oldResult.hullLine && userAdded.length > 0) {
      const allValid = [...valid, ...userAdded];
      const newResult = computeBinaryHull(structures, allValid);
      return {
        structures: newResult.structures,
        hullLine: newResult.hullLine,
        oldHullLine: oldResult.hullLine,
        hullExpanded: true,
      };
    }
    return { structures: oldResult.structures, hullLine: oldResult.hullLine };
  }

  if (systemType === 'ternary') {
    const valid = structures.filter((s) => !s.isUserAdded && s.enthalpyTotal <= 900);
    const userAdded = structures.filter((s) => s.isUserAdded && s.enthalpyTotal <= 900);
    const oldResult = computeTernaryHull(structures, valid);
    // Pre-compute lower faces from non-user-added hull so we can accurately
    // measure each user-added structure's vertical distance to the old hull
    // WITHOUT re-running convexHull() for every structure.
    const oldHullPoints3D: Point3D[] = valid.map((s) => {
      const [cx, cy] = ternaryToCartesian(s.composition);
      return { x: cx, y: cy, z: s.eForm };
    });
    const oldLowerFaces = oldHullPoints3D.length >= 4
      ? computeTernaryLowerFaces(oldHullPoints3D)
      : [];
    computeFitnessForUserAdded(userAdded, undefined, systemType, oldLowerFaces);

    const expanded = userAdded.some((s) => s.fitness <= 0);
    if (expanded && userAdded.length > 0) {
      const allValid = [...valid, ...userAdded];
      const newResult = computeTernaryHull(structures, allValid);
      return {
        structures: newResult.structures,
        hullEdges: newResult.hullEdges,
        oldHullEdges: oldResult.hullEdges,
        hullExpanded: true,
      };
    }
    return { structures: oldResult.structures, hullEdges: oldResult.hullEdges };
  }

  // Unary
  const uv = structures.filter((s) => !s.isUserAdded && s.enthalpyTotal <= 900);
  for (const s of uv) s.fitness = 0;
  return { structures };
}

/** Compute fitness for user-added structures against the current (old) hull */
function computeFitnessForUserAdded(
  userAdded: Structure[],
  hullLine?: Point2D[],
  systemType?: string,
  lowerFaces?: TernaryLowerFace[],
): void {
  for (const s of userAdded) {
    if (systemType === 'binary' && hullLine) {
      const x = s.hullX[0] ?? 0;
      s.fitness = binaryHullDistance(x, s.eForm, hullLine);
    } else if (systemType === 'ternary' && lowerFaces) {
      const [cx, cy] = ternaryToCartesian(s.composition);
      s.fitness = lowerFaces.length > 0
        ? ternaryHullDistanceFromFaces(cx, cy, s.eForm, lowerFaces)
        : 0;
    } else {
      s.fitness = 0;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Binary hull                                                        */
/* ------------------------------------------------------------------ */

function computeBinaryHull(
  structures: Structure[],
  valid: Structure[],
): WorkshopHullResult {
  // Use ALL valid structures as hull-defining points
  const allPoints: Point2D[] = valid
    .map((s) => ({ x: s.hullX[0] ?? 0, y: s.eForm }))
    .sort((a, b) => a.x - b.x);

  if (allPoints.length < 2) {
    for (const s of valid) s.fitness = 0;
    return { structures, hullLine: [...allPoints] };
  }

  // Compute lower convex hull of ALL points
  const hullLine = computeLowerHull2D(allPoints);

  // Distance of each structure to this hull
  for (const s of valid) {
    const x = s.hullX[0] ?? 0;
    s.fitness = binaryHullDistance(x, s.eForm, hullLine);
  }

  return { structures, hullLine };
}

/* ------------------------------------------------------------------ */
/*  Ternary hull                                                       */
/* ------------------------------------------------------------------ */

function computeTernaryHull(
  structures: Structure[],
  valid: Structure[],
): WorkshopHullResult {
  // Build 3D hull-defining points from all valid structures
  const hullPoints3D: Point3D[] = valid.map((s) => {
    const [cx, cy] = ternaryToCartesian(s.composition);
    return { x: cx, y: cy, z: s.eForm };
  });

  // Pre-compute lower faces ONCE — avoids O(N * convex_hull(N))
  const lowerFaces = hullPoints3D.length >= 4
    ? computeTernaryLowerFaces(hullPoints3D)
    : [];

  // Compute fitness for each structure using the pre-computed faces
  for (const s of valid) {
    const [cx, cy] = ternaryToCartesian(s.composition);
    s.fitness = lowerFaces.length > 0
      ? ternaryHullDistanceFromFaces(cx, cy, s.eForm, lowerFaces)
      : hullPoints3D.length > 0
        ? Math.max(0, s.eForm - Math.min(...hullPoints3D.map(p => p.z)))
        : 0;
  }

  // Build tie-line edges from the hull for display
  const hullEdges = buildTernaryEdges(hullPoints3D);

  return { structures, hullEdges };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Populate hullX from composition if hullX is empty/missing.
 * For binary: hullX[0] = fraction of second element.
 * For ternary: hullX[0], hullX[1] = cartesian coords (or molar fractions
 * of elements 1 and 2, whichever the chart expects — here we set molar
 * fractions since reconstructConvexHull already does the ternaryToCartesian
 * conversion at consumption time).
 */
function ensureHullX(structures: Structure[], elements: string[]): void {
  for (const s of structures) {
    const total = totalAtoms(s.composition);
    if (total === 0) {
      s.hullX = elements.length >= 2 ? new Array(elements.length - 1).fill(0) : [0];
      continue;
    }
    if (elements.length === 2) {
      s.hullX = [s.composition[1] / total];
    } else if (elements.length === 3) {
      s.hullX = [s.composition[0] / total, s.composition[1] / total];
    }
  }
}

/**
 * Build 2D tie-line edges from 3D convex hull lower faces.
 * Replicates a simplified version of computeTernaryHullEdges for display.
 */
function buildTernaryEdges(
  hullPoints3D: Point3D[],
): { p1: [number, number]; p2: [number, number] }[] {
  if (hullPoints3D.length < 4) return [];

  // Deduplicate by (cartX, cartY) — keep the lowest z for each position
  const keyMap = new Map<string, Point3D>();
  for (const p of hullPoints3D) {
    const key = `${p.x.toFixed(8)},${p.y.toFixed(8)}`;
    const existing = keyMap.get(key);
    if (!existing || p.z < existing.z) {
      keyMap.set(key, p);
    }
  }
  const unique = Array.from(keyMap.values());
  if (unique.length < 4) return [];

  // Compute 3D convex hull
  const coords = unique.map((p) => [p.x, p.y, p.z] as [number, number, number]);
  let faceList: number[][] = [];
  try {
    faceList = convexHull(coords);
  } catch {
    return [];
  }
  if (!faceList || faceList.length === 0) return [];

  // Helper: cross product → face normal
  const cross3 = (
    a: [number, number, number],
    b: [number, number, number],
  ): [number, number, number] => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];

  const faceNormal = (v0: number[], v1: number[], v2: number[]): [number, number, number] =>
    cross3(
      [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]],
      [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]],
    );

  // Collect edges from lower faces
  const edgeSet = new Set<string>();
  const edges: { p1: [number, number]; p2: [number, number] }[] = [];

  for (const face of faceList) {
    if (face.length < 3) continue;
    const v0 = coords[face[0]];
    const v1 = coords[face[1]];
    const v2 = coords[face[2]];
    const normal = faceNormal(v0, v1, v2);
    if (normal[2] >= -1e-10) continue; // skip upper / vertical faces, keep only lower hull

    const indices = [face[0], face[1], face[2]];
    for (let i = 0; i < 3; i++) {
      const a = indices[i];
      const b = indices[(i + 1) % 3];
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({
        p1: [unique[a].x, unique[a].y],
        p2: [unique[b].x, unique[b].y],
      });
    }
  }

  return edges;
}
