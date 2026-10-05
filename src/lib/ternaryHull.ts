/** Ternary tie lines share the workshop's lower-envelope geometry. */
import { buildTernaryHullGeometry } from '@/domain/hull/ternaryHullGeometry';

export interface TernaryHullInput {
  id: number;
  composition: number[];
  eForm: number;
  cartX: number;
  cartY: number;
  _mergeSeq?: number; // unique sequence number for workshop multi-group dedup
}

export interface TernaryHullEdge {
  p1: [number, number];
  p2: [number, number];
}

/**
 * Deduplicate stable points: keep only one per unique composition
 * (the one with lowest eForm).
 */
export function uniqueHullPoints(points: TernaryHullInput[]): TernaryHullInput[] {
  const seen = new Map<string, TernaryHullInput>();
  for (const p of points) {
    const key = p.composition.join('-');
    const existing = seen.get(key);
    if (!existing || p.eForm < existing.eForm) {
      seen.set(key, p);
    }
  }
  return Array.from(seen.values());
}

/**
 * Compute tie-lines for ternary convex hull using 3D lower-hull method.
 *
 * @param stablePoints Points with fitness ≈ 0 (on the convex hull)
 * @returns Array of 2D edges (tie-lines) in cartesian coordinates
 */
export function computeTernaryHullEdges(
  stablePoints: TernaryHullInput[],
): TernaryHullEdge[] {
  const unique = uniqueHullPoints(stablePoints);
  return buildTernaryHullGeometry(unique.map(p => ({ x: p.cartX, y: p.cartY, z: p.eForm }))).edges;
}
