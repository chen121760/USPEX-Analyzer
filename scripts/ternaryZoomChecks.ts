/**
 * Triangle-zoom invariants for the ternary phase diagram.
 *
 * The zoom window is an upright equilateral sub-triangle, so the frame that
 * comes out of a zoom must look like the frame it started from: same margin
 * ratio, same equilateral shape, and never outside the diagram.
 */
import {
  MIN_TERNARY_SCALE,
  TERNARY_CENTROID,
  TERNARY_PADDING,
  TERNARY_VERTICES,
  clampToTriangle,
  isInsideTernary,
  ternaryZoomScale,
  ternaryZoomWindow,
} from '@/charts/ternary/ternaryZoom';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\nTernary triangle zoom');

const SQRT3_2 = Math.sqrt(3) / 2;
const BASE_X: [number, number] = [-TERNARY_PADDING, 1 + TERNARY_PADDING];
const BASE_Y: [number, number] = [-TERNARY_PADDING, SQRT3_2 + TERNARY_PADDING];

const full = ternaryZoomWindow(TERNARY_CENTROID, 1);
check('scale 1 centred on the centroid reproduces the base layout ranges',
  Math.abs(full.ranges.x[0] - BASE_X[0]) < 1e-12 && Math.abs(full.ranges.x[1] - BASE_X[1]) < 1e-12
  && Math.abs(full.ranges.y[0] - BASE_Y[0]) < 1e-12 && Math.abs(full.ranges.y[1] - BASE_Y[1]) < 1e-12,
  `${JSON.stringify(full.ranges)}`);

const sideLengths = (scale: number, anchor: readonly [number, number] = TERNARY_CENTROID): number[] => {
  const [a, b, c] = ternaryZoomWindow(anchor, scale).vertices;
  return [
    Math.hypot(a[0] - b[0], a[1] - b[1]),
    Math.hypot(b[0] - c[0], b[1] - c[1]),
    Math.hypot(c[0] - a[0], c[1] - a[1]),
  ];
};

const deep = ternaryZoomWindow([0.2, 0.15], 0.1);
const deepSides = sideLengths(0.1, [0.2, 0.15]);
check('a zoom window stays an equilateral triangle of exactly that scale',
  Math.max(...deepSides) - Math.min(...deepSides) < 1e-12 && Math.abs(deepSides[0] - 0.1) < 1e-12,
  deepSides.map((v) => v.toFixed(4)).join('/'));

const aspect = (window: ReturnType<typeof ternaryZoomWindow>): number =>
  (window.ranges.x[1] - window.ranges.x[0]) / (window.ranges.y[1] - window.ranges.y[0]);
check('every window keeps the base framing ratio',
  Math.abs(aspect(deep) - aspect(full)) < 1e-12
  && Math.abs(aspect(ternaryZoomWindow([0.9, 0.05], 0.4)) - aspect(full)) < 1e-12,
  `${aspect(deep).toFixed(6)} vs ${aspect(full).toFixed(6)}`);

// Corner anchors are the interesting case: the window has to slide back inside.
const corner = ternaryZoomWindow([1.4, -0.9], 0.35);
check('a window anchored outside the diagram is pulled back inside',
  corner.vertices.every((vertex) => isInsideTernary(vertex, 1e-9)),
  JSON.stringify(corner.vertices));
check('the pulled-back window still contains the clamped anchor',
  isInsideTernary(corner.vertices[0]) && isInsideTernary(corner.vertices[2]));

const deepCorner = ternaryZoomWindow([1, 0], MIN_TERNARY_SCALE);
check('an extreme zoom near a corner stays inside the diagram',
  deepCorner.vertices.every((vertex) => isInsideTernary(vertex, 1e-9))
  && deepCorner.ranges.x[0] >= BASE_X[0] - 1e-12 && deepCorner.ranges.x[1] <= BASE_X[1] + 1e-12
  && deepCorner.ranges.y[0] >= BASE_Y[0] - 1e-12 && deepCorner.ranges.y[1] <= BASE_Y[1] + 1e-12,
  JSON.stringify(corner.ranges));

check('a window is never larger than the diagram',
  ternaryZoomWindow(TERNARY_CENTROID, 4).scale === 1
  && ternaryZoomWindow(TERNARY_CENTROID, 0).scale === MIN_TERNARY_SCALE);

const inradius = Math.sqrt(3) / 6;
check('drag distance maps to window size through the inradius',
  Math.abs(ternaryZoomScale(inradius) - 1) < 1e-12
  && Math.abs(ternaryZoomScale(inradius / 4) - 0.25) < 1e-12
  && ternaryZoomScale(inradius * 10) === 1
  && ternaryZoomScale(0) === MIN_TERNARY_SCALE
  && ternaryZoomScale(Number.NaN) === MIN_TERNARY_SCALE);

const centroidOf = (window: ReturnType<typeof ternaryZoomWindow>): [number, number] => [
  (window.vertices[0][0] + window.vertices[1][0] + window.vertices[2][0]) / 3,
  (window.vertices[0][1] + window.vertices[1][1] + window.vertices[2][1]) / 3,
];
const anchored = centroidOf(ternaryZoomWindow([0.35, 0.2], 0.5));
check('the pressed point becomes the centre of the zoomed view',
  Math.abs(anchored[0] - 0.35) < 1e-12 && Math.abs(anchored[1] - 0.2) < 1e-12,
  anchored.join(','));

check('the zoom triangle keeps the diagram orientation (apex up)',
  full.vertices[1][1] > full.vertices[0][1] && Math.abs(full.vertices[0][1] - full.vertices[2][1]) < 1e-12
  && Math.abs(full.vertices[1][0] - 0.5) < 1e-12);

const clamped = clampToTriangle([-5, -5], TERNARY_VERTICES);
check('clamping a far-away point lands on a vertex of the container',
  Math.hypot(clamped[0] - 0, clamped[1] - 0) < 1e-9, JSON.stringify(clamped));
check('clamping leaves interior points untouched',
  clampToTriangle([0.4, 0.3], TERNARY_VERTICES)[0] === 0.4
  && clampToTriangle([0.4, 0.3], TERNARY_VERTICES)[1] === 0.3);
check('inside test rejects the margin and the outside',
  isInsideTernary([0.5, 0.2]) && !isInsideTernary([-0.05, 0.5]) && !isInsideTernary([0.5, 0.95]));

console.log(`\nTernary zoom checks: ${passed} passed, ${failures.length} failed`);
if (failures.length) throw new Error(failures.join('; '));
