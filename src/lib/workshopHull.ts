/**
 * Pure-geometric convex hull computation for the Hull Workshop.
 *
 * Unlike reconstructConvexHull(), this uses ALL structures to define the
 * convex hull geometry — NOT just fitness===0 structures.  This is essential
 * for workshop use where imported CSV data has no USPEX fitness field (or
 * fitness values from different calculation runs that are not comparable).
 *
 * Strategy:
 *   1. resolveReferences() on all valid structures (exact endmembers only)
 *   2. computeFormationEnthalpyWith() for each structure
 *   3. Binary:  computeLowerHull2D() on ALL (x, eForm) points,
 *                then binaryHullDistance() for each structure.
 *   4. Ternary: pass ALL structures into ternaryHullDistance().
 *               The convex-hull package computes the 3D convex hull
 *               internally — interior points are excluded from faces
 *               automatically, and upper faces are filtered by normal.z.
 *   5. Fixed:   eHullRecons = eForm - min(eForm).
 */

import { buildTernaryHullGeometry } from '@/domain/hull/ternaryHullGeometry';
import {
  computeFormationEnthalpyWith,
  computeLowerHull2D,
  binaryHullDistance,
  resolveReferences,
  usesComponentBasis,
  type Point2D,
  type Point3D,
} from './convexHullReconstruction';
import {
  componentAmountsFromComposition,
  ternaryToCartesian,
  totalAtoms,
} from '@/parsers/compositionUtils';
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
  const compositionBasis = systemInfo.compositionBasis ?? [];
  const declaredBasis = compositionMode === 'varcomp' && compositionBasis.length >= 2;
  const basisUsable = usesComponentBasis(compositionMode, compositionBasis);

  if (structures.length === 0) {
    return { structures, hullLine: [], hullEdges: [] };
  }

  // Fixed-composition ranking uses relative per-atom enthalpy; pure references
  // are unnecessary. Different stoichiometries get independent minima.
  if (compositionMode === 'fixed') {
    const minima = new Map<string, number>();
    const keyOf = (s: Structure) => {
      const total = totalAtoms(s.composition);
      return s.composition.map(n => (n / total).toFixed(10)).join(',');
    };
    const valid = structures.filter(s => Number.isFinite(s.enthalpyTotal) && s.enthalpyTotal <= 900 && totalAtoms(s.composition) > 0);
    for (const s of valid) {
      s.enthalpy = s.enthalpyTotal / totalAtoms(s.composition);
      if (!s.isUserAdded) minima.set(keyOf(s), Math.min(minima.get(keyOf(s)) ?? Infinity, s.enthalpy));
    }
    let expanded = false;
    for (const s of valid) {
      const key = keyOf(s);
      if (s.isUserAdded && s.enthalpy < (minima.get(key) ?? Infinity)) expanded = true;
      minima.set(key, Math.min(minima.get(key) ?? Infinity, s.enthalpy));
    }
    for (const s of structures) s.fitness = s.eHullRecons = -1;
    for (const s of valid) s.fitness = s.eHullRecons = Math.max(0, s.enthalpy - minima.get(keyOf(s))!);
    return { structures, hullExpanded: expanded };
  }

  if (declaredBasis && !basisUsable) {
    // Linearly dependent composition blocks: E_form is not defined.
    for (const s of structures) {
      s.eForm = -1;
      s.eHullRecons = -1;
      s.hullY = Number.NaN;
      s.fitness = -1;
    }
    return { structures, hullLine: [], hullEdges: [] };
  }

  const references = resolveReferences(structures, elements, compositionMode, compositionBasis);
  const useCompositionBasis = references.kind === 'component';
  // Only a usable basis may drive the plotting coordinates.  Otherwise keep
  // atomic compositions so the plotted coordinates match the elemental E_form
  // that was actually used (a declared but rejected basis must not leak in).
  const plotBasis = useCompositionBasis ? compositionBasis : [];

  // Track undefined formation enthalpies explicitly: the -1 sentinel written
  // into eForm is a display value and must not decide hull membership, or a
  // legitimate E_form of exactly -1 would be dropped from the hull.
  const undefinedFormation = new Set<Structure>();

  for (const s of structures) {
    const formation = s.enthalpyTotal > 900
      ? null
      : computeFormationEnthalpyWith(s, references, compositionBasis);
    if (formation === null) {
      s.eForm = -1;
      s.eHullRecons = -1;
      s.hullY = Number.NaN;
      s.fitness = -1;
      undefinedFormation.add(s);
    } else {
      s.eForm = formation;
      s.hullY = formation;
    }
  }

  ensureHullX(structures, elements, plotBasis);

  if (systemType === 'binary') {
    const valid = structures.filter((s) => !s.isUserAdded && s.enthalpyTotal <= 900 && !undefinedFormation.has(s));
    const userAdded = structures.filter((s) => s.isUserAdded && s.enthalpyTotal <= 900 && !undefinedFormation.has(s));
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
    const valid = structures.filter((s) => !s.isUserAdded && s.enthalpyTotal <= 900 && !undefinedFormation.has(s));
    const userAdded = structures.filter((s) => s.isUserAdded && s.enthalpyTotal <= 900 && !undefinedFormation.has(s));
    const oldResult = computeTernaryHull(structures, valid, plotBasis);
    for (const structure of userAdded) {
      structure.fitness = oldResult.distance(ternaryPoint(structure, plotBasis));
    }

    const expanded = userAdded.some((s) => s.fitness <= 0);
    if (expanded && userAdded.length > 0) {
      const allValid = [...valid, ...userAdded];
      const newResult = computeTernaryHull(structures, allValid, plotBasis);
      return {
        structures: newResult.structures,
        hullEdges: newResult.hullEdges,
        oldHullEdges: oldResult.hullEdges,
        hullExpanded: true,
      };
    }
    return { structures: oldResult.structures, hullEdges: oldResult.hullEdges };
  }

  // Quaternary: hull reconstruction is not available (4D problem).
  // Keep USPEX-provided fitness values as-is; user-added structures get 0.
  if (systemType === 'quaternary') {
    const ua = structures.filter((s) => s.isUserAdded && s.enthalpyTotal <= 900);
    for (const s of ua) s.fitness = 0;
    return { structures };
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
): void {
  for (const s of userAdded) {
    if (systemType === 'binary' && hullLine) {
      const x = s.hullX[0] ?? 0;
      s.fitness = binaryHullDistance(x, s.eForm, hullLine);
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

function ternaryPoint(s: Structure, compositionBasis: number[][]): Point3D {
  const composition = compositionBasis.length
    ? componentAmountsFromComposition(s.composition, compositionBasis) ?? [] : s.composition;
  const [x, y] = ternaryToCartesian(composition);
  return { x, y, z: s.eForm };
}

function computeTernaryHull(
  structures: Structure[],
  valid: Structure[],
  compositionBasis: number[][] = [],
): WorkshopHullResult & { distance: (point: Point3D) => number } {
  const points = valid.map(s => ternaryPoint(s, compositionBasis));
  const geometry = buildTernaryHullGeometry(points);
  valid.forEach((s, i) => { s.fitness = geometry.distance(points[i]); });
  return { structures, hullEdges: geometry.edges, distance: geometry.distance };
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
function ensureHullX(
  structures: Structure[],
  elements: string[],
  compositionBasis: number[][] = [],
): void {
  for (const s of structures) {
    if (compositionBasis.length > 0) {
      const amounts = componentAmountsFromComposition(s.composition, compositionBasis);
      if (!amounts) {
        s.hullX = [Number.NaN];
        continue;
      }
      const totalBlocks = amounts.reduce((sum, value) => sum + value, 0);
      s.hullX = totalBlocks > 0
        ? amounts.slice(1).map((value) => value / totalBlocks)
        : [Number.NaN];
      continue;
    }
    const total = totalAtoms(s.composition);
    if (total === 0) {
      s.hullX = elements.length >= 2 ? new Array(elements.length - 1).fill(0) : [0];
      continue;
    }
    if (elements.length === 2) {
      s.hullX = [s.composition[1] / total];
    } else if (elements.length === 3) {
      s.hullX = [s.composition[0] / total, s.composition[1] / total];
    } else if (elements.length >= 4) {
      s.hullX = [s.composition[0] / total, s.composition[1] / total, s.composition[2] / total];
    }
  }
}
