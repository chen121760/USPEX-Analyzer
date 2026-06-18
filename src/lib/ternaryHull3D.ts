/**
 * Helpers for converting 3D convex hull data into Plotly mesh3d arrays.
 */

import type { TernaryLowerFace, Point3D } from './convexHullReconstruction';

export interface Mesh3DInput {
  x: number[];
  y: number[];
  z: number[];
  /** First vertex index of each triangle */
  i: number[];
  /** Second vertex index of each triangle */
  j: number[];
  /** Third vertex index of each triangle */
  k: number[];
}

/**
 * Convert TernaryLowerFace[] (from computeTernaryLowerFaces)
 * into flat vertex/index arrays suitable for Plotly mesh3d.
 *
 * Deduplicates vertices by exact (x, y, z) match so that the
 * mesh3d trace produces a clean closed surface.
 */
export function lowerFacesToMesh3D(faces: TernaryLowerFace[]): Mesh3DInput {
  const vertexKey = (p: Point3D) =>
    `${p.x.toFixed(12)},${p.y.toFixed(12)},${p.z.toFixed(12)}`;

  const vertexMap = new Map<string, number>();
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const is: number[] = [];
  const js: number[] = [];
  const ks: number[] = [];

  function addVertex(p: Point3D): number {
    const key = vertexKey(p);
    let idx = vertexMap.get(key);
    if (idx === undefined) {
      idx = xs.length;
      vertexMap.set(key, idx);
      xs.push(p.x);
      ys.push(p.y);
      zs.push(p.z);
    }
    return idx;
  }

  for (const face of faces) {
    is.push(addVertex(face.v0));
    js.push(addVertex(face.v1));
    ks.push(addVertex(face.v2));
  }

  return { x: xs, y: ys, z: zs, i: is, j: js, k: ks };
}
