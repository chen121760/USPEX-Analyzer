import assert from 'node:assert/strict';
import { BASE_TERNARY_RANGES as base, MIN_TERNARY_SCALE, ternaryViewport, ternaryViewportScale, zoomTernaryViewport,
  panTernaryViewport, selectTernaryViewport, isInTernaryViewport, ternaryViewportVertices, compositionAtTernaryPoint, clipTernaryEdges } from '@/charts/ternary/ternaryZoom';
import type { TernaryRanges } from '@/charts/ternary/ternaryZoom';

let count = 0;
function check(name: string, run: () => void) { run(); count++; console.log(`  ok   ${name}`); }
function close(a: number, b: number) { assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`); }
function bounded(ranges: TernaryRanges) {
  for (const axis of ['x', 'y'] as const) { assert.ok(ranges[axis][0] >= base[axis][0] - 1e-9); assert.ok(ranges[axis][1] <= base[axis][1] + 1e-9); }
  close((ranges.x[1] - ranges.x[0]) / (ranges.y[1] - ranges.y[0]), (base.x[1] - base.x[0]) / (base.y[1] - base.y[0]));
  for (const vertex of ternaryViewportVertices(ranges)) {
    assert.ok(compositionAtTernaryPoint(vertex).every((value) => value >= -1e-9 && value <= 1 + 1e-9));
  }
}
console.log('\nTernary triangular viewports');
check('zoom in then out restores the original coordinate frame', () => {
  const result = zoomTernaryViewport(zoomTernaryViewport(base, 0.5), 2);
  for (const axis of ['x', 'y'] as const) for (const i of [0, 1]) close(result[axis][i], base[axis][i]);
});
check('all zoom levels preserve equal units and stay in bounds', () => {
  for (const scale of [1, 0.5, 0.1, MIN_TERNARY_SCALE]) for (const centre of [[-10, -10], [0.4, 0.3], [10, 10]] as const) bounded(ternaryViewport(centre, scale));
});
check('zoom clamps at 20x and the full overview', () => {
  close(ternaryViewportScale(ternaryViewport([0.5, 0.3], 1e-9)), MIN_TERNARY_SCALE);
  close(ternaryViewportScale(ternaryViewport([0.5, 0.3], 100)), 1);
});
check('invalid scales and centres recover a finite overview', () => {
  const result = ternaryViewport([NaN, Infinity], NaN); bounded(result);
  for (const axis of ['x', 'y'] as const) for (const i of [0, 1]) close(result[axis][i], base[axis][i]);
});
check('brush defines an upright equilateral triangle in original composition coordinates', () => {
  const start = [0.35, 0.25] as const, end = [0.55, 0.35] as const;
  const result = selectTernaryViewport(start, end); bounded(result);
  const [left, top, right] = ternaryViewportVertices(result);
  close(left[0], start[0]); close(left[1], start[1]); close(right[0], end[0]); close(right[1], start[1]);
  close(top[0], 0.45); close(top[1], start[1] + 0.2 * Math.sqrt(3) / 2);
  const lengths = [Math.hypot(top[0] - left[0], top[1] - left[1]), Math.hypot(right[0] - top[0], right[1] - top[1]), right[0] - left[0]];
  lengths.forEach((length) => close(length, 0.2));
  assert.ok(!isInTernaryViewport(end, result)); // A rectangle's top corner is outside its triangular selection.
  for (const vertex of [left, top, right]) {
    const fractions = compositionAtTernaryPoint(vertex);
    close(fractions.reduce((a, b) => a + b), 1);
    close(fractions[2] + fractions[1] / 2, vertex[0]);
    assert.ok(isInTernaryViewport(vertex, result));
  }
});
check('brush works in both drag directions', () => {
  assert.deepEqual(selectTernaryViewport([0.3, 0.2], [0.6, 0.5]), selectTernaryViewport([0.6, 0.5], [0.3, 0.2]));
});
check('an edge brush never leaves the overview', () => bounded(selectTernaryViewport([0.95, 0], [1.1, 0.2])));
check('pan preserves magnification and clamps at dataset boundaries', () => {
  const local = ternaryViewport([0.5, 0.3], 0.25);
  for (const delta of [[0.1, 0.1], [-100, -100], [100, 100]] as const) {
    const result = panTernaryViewport(local, delta); bounded(result); close(ternaryViewportScale(result), 0.25);
  }
});
check('local view does not contain the original elemental corners', () => {
  const local = ternaryViewport([0.5, 0.3], 0.1);
  assert.ok(!isInTernaryViewport([0, 0], local)); assert.ok(!isInTernaryViewport([1, 0], local));
  assert.ok(!isInTernaryViewport([0.5, Math.sqrt(3) / 2], local));
});
check('tie lines crossing the triangle are clipped even with both endpoints outside', () => {
  const local = ternaryViewport([0.5, 0.3], 0.2);
  const clipped = clipTernaryEdges([{ p1: [0, 0.3], p2: [1, 0.3] }], local);
  assert.equal(clipped.length, 1);
  close(clipped[0].p1[0], 0.5 - 0.2 / 3); close(clipped[0].p2[0], 0.5 + 0.2 / 3);
  assert.ok(isInTernaryViewport(clipped[0].p1, local)); assert.ok(isInTernaryViewport(clipped[0].p2, local));
  assert.deepEqual(clipTernaryEdges([{ p1: [0, 0], p2: [1, 0] }], local), []);
});
check('clipping preserves triangle edges and interior segments without altering their coordinates', () => {
  const local = ternaryViewport([0.5, 0.3], 0.2);
  const vertices = ternaryViewportVertices(local);
  const edges = vertices.map((vertex, i) => ({ p1: [...vertex] as [number, number], p2: [...vertices[(i + 1) % 3]] as [number, number] }));
  const clipped = clipTernaryEdges(edges, local);
  assert.equal(clipped.length, 3);
  clipped.forEach((edge, i) => { close(edge.p1[0], edges[i].p1[0]); close(edge.p2[1], edges[i].p2[1]); });
});
console.log(`\nTernary zoom checks: ${count} passed`);
