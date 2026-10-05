import { binaryHullDistance, computeLowerHull2D, computeTernaryLowerFaces, ternaryHullDistanceFromFaces,
  type Point3D, type TernaryLowerFace } from '@/lib/hullGeometry';

type Edge = { p1: [number, number]; p2: [number, number] };
const EPS = 1e-10;
const cross = (a: Point3D, b: Point3D, c: Point3D) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function projectedBoundary(points: Point3D[]): Point3D[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: Point3D[]) => {
    const result: Point3D[] = [];
    for (const p of list) {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], p) <= 0) result.pop();
      result.push(p);
    }
    return result;
  };
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}

function edgesFromFaces(faces: TernaryLowerFace[]): Edge[] {
  const edges = new Map<string, Edge>();
  for (const { v0, v1, v2 } of faces) {
    const vertices = [v0, v1, v2];
    for (let i = 0; i < 3; i++) {
      const a = vertices[i], b = vertices[(i + 1) % 3];
      const key = [`${a.x},${a.y}`, `${b.x},${b.y}`].sort().join('|');
      edges.set(key, { p1: [a.x, a.y], p2: [b.x, b.y] });
    }
  }
  return [...edges.values()];
}

/** One lower envelope for both fitness queries and displayed tie lines.
 * Projection rank determines whether this is a point, a binary line, a plane,
 * or a full 3D hull; a degenerate hull never uses a global energy minimum.
 */
export function buildTernaryHullGeometry(points: Point3D[]): { edges: Edge[]; distance: (p: Point3D) => number } {
  const byPosition = new Map<string, Point3D>();
  for (const p of points) {
    const key = `${p.x.toFixed(12)},${p.y.toFixed(12)}`;
    const previous = byPosition.get(key);
    if (!previous || p.z < previous.z) byPosition.set(key, p);
  }
  const unique = [...byPosition.values()];
  if (!unique.length) return { edges: [], distance: () => 0 };
  const a = unique[0];
  const b = unique.reduce((best, p) => Math.hypot(p.x - a.x, p.y - a.y) > Math.hypot(best.x - a.x, best.y - a.y) ? p : best, a);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length <= EPS) return { edges: [], distance: p => Math.max(0, p.z - a.z) };

  const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
  const c = unique.reduce((best, p) => Math.abs(cross(a, b, p)) > Math.abs(cross(a, b, best)) ? p : best, a);
  if (Math.abs(cross(a, b, c)) / length <= EPS) {
    const along = (p: Point3D) => (p.x - a.x) * ux + (p.y - a.y) * uy;
    const line = computeLowerHull2D(unique.map(p => ({ x: along(p), y: p.z })));
    const xy = (t: number): [number, number] => [a.x + t * ux, a.y + t * uy];
    return {
      edges: line.slice(1).map((p, i) => ({ p1: xy(line[i].x), p2: xy(p.x) })),
      distance: p => {
        const t = along(p);
        // Outside the old hull's composition domain, a manual row introduces
        // a new hull vertex rather than an interpolated distance.
        if (Math.abs(cross(a, b, p)) / length > EPS || t < line[0].x - EPS || t > line[line.length - 1].x + EPS) return 0;
        return line.length === 1 ? Math.max(0, p.z - line[0].y) : binaryHullDistance(t, p.z, line);
      },
    };
  }

  const determinant = cross(a, b, c);
  const zx = ((b.z - a.z) * (c.y - a.y) - (c.z - a.z) * (b.y - a.y)) / determinant;
  const zy = ((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / determinant;
  const planeZ = (p: Point3D) => a.z + zx * (p.x - a.x) + zy * (p.y - a.y);
  let faces: TernaryLowerFace[];
  if (unique.every(p => Math.abs(p.z - planeZ(p)) <= EPS * Math.max(1, Math.abs(p.z)))) {
    const boundary = projectedBoundary(unique);
    faces = boundary.slice(2).map((p, i) => ({ v0: boundary[0], v1: boundary[i + 1], v2: p }));
  } else {
    faces = computeTernaryLowerFaces(unique);
  }
  return { edges: edgesFromFaces(faces), distance: p => faces.length
    ? ternaryHullDistanceFromFaces(p.x, p.y, p.z, faces) : Number.NaN };
}
