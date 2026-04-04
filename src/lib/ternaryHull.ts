/**
 * Ternary convex hull algorithm for 3D phase diagram tie-lines.
 *
 * Ported from Plot_ternary_hull_corrected_2.py.
 *
 * Algorithm:
 * 1. Build 3D points: (cartX, cartY, enthalpy) for each stable point
 * 2. Compute 3D convex hull
 * 3. For each face, compute normal vector via cross product
 * 4. Faces with normal.z < 0 are on the lower hull (thermodynamic stability surface)
 * 5. Collect edges from lower-hull faces → these are the tie-lines
 * 6. Project back to 2D for plotting
 */

import convexHull from 'convex-hull';

export interface TernaryHullInput {
  id: number;
  composition: number[];
  enthalpy: number;
  cartX: number;
  cartY: number;
}

export interface TernaryHullEdge {
  p1: [number, number];
  p2: [number, number];
}

/**
 * Compute cross product of two 3D vectors.
 */
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

/**
 * Compute the normal vector of a triangle face (v0, v1, v2)
 * using the cross product of two edge vectors.
 */
function faceNormal(
  v0: number[],
  v1: number[],
  v2: number[],
): [number, number, number] {
  const edge1: [number, number, number] = [
    v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2],
  ];
  const edge2: [number, number, number] = [
    v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2],
  ];
  return cross3(edge1, edge2);
}

/**
 * Deduplicate stable points: keep only one per unique composition
 * (the one with lowest enthalpy).
 */
export function uniqueHullPoints(points: TernaryHullInput[]): TernaryHullInput[] {
  const seen = new Map<string, TernaryHullInput>();
  for (const p of points) {
    const key = p.composition.join('-');
    const existing = seen.get(key);
    if (!existing || p.enthalpy < existing.enthalpy) {
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
  if (stablePoints.length < 3) return [];

  // Deduplicate by composition
  const unique = uniqueHullPoints(stablePoints);
  if (unique.length < 3) return [];

  // Build 3D coordinates: (cartX, cartY, enthalpy)
  let coords = unique.map((p) => [p.cartX, p.cartY, p.enthalpy]);

  // Handle degenerate case: all enthalpies nearly identical
  const zValues = coords.map((c) => c[2]);
  const zRange = Math.max(...zValues) - Math.min(...zValues);
  if (zRange < 1e-10) {
    coords = coords.map((c) => [
      c[0], c[1], c[2] + (Math.random() - 0.5) * 1e-8,
    ]);
  }

  // Compute 3D convex hull
  let hullFaces: number[][];
  try {
    hullFaces = convexHull(coords);
  } catch {
    // Degenerate point set — return empty
    return [];
  }

  // Extract edges from lower-hull faces (normal.z < 0)
  const edgeSet = new Set<string>();
  const edges: TernaryHullEdge[] = [];

  for (const face of hullFaces) {
    const v0 = coords[face[0]];
    const v1 = coords[face[1]];
    const v2 = coords[face[2]];
    if (!v0 || !v1 || !v2) continue;

    const normal = faceNormal(v0, v1, v2);

    // Lower hull: normal points downward (z < 0)
    if (normal[2] < -1e-10) {
      // Add the three edges of this triangular face
      const pairs = [[0, 1], [1, 2], [2, 0]];
      for (const [i, j] of pairs) {
        const key = [Math.min(face[i], face[j]), Math.max(face[i], face[j])].join('-');
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({
            p1: [coords[face[i]][0], coords[face[i]][1]],
            p2: [coords[face[j]][0], coords[face[j]][1]],
          });
        }
      }
    }
  }

  return edges;
}
