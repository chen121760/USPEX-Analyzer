/**
 * Quaternary / missing-hull reconstruction checks — standalone node checks.
 *
 * Run with `npm test` (bundles this file with rolldown so it can import the
 * real TypeScript sources, then executes it).  No test framework involved.
 *
 * `extended_convex_hull` is the only file that carries USPEX's own Ed.  An
 * interrupted run leaves it header-only, and the analyzer used to invent
 * `Ed = E/atom − min(E/atom over the whole run)` in that case — for a
 * multi-element system that makes the most cohesive pure element the single
 * "stable" phase and hides every compound (a real Li-Zr-Y-Cl run with 11 hull
 * vertices showed exactly one, pure Zr).  These checks pin the replacement:
 *
 *   1. the 4D lower hull (3 mole fractions + E_form) is exact on a cloud whose
 *      envelope is known analytically
 *   2. lower facets are oriented down in energy: every point is bounded below
 *      by every lower plane
 *   3. distances are invariant under the input row order
 *   4. binary/ternary/quaternary hulls are rebuilt from *all* converged
 *      structures when no structure carries a hull distance, and the result is
 *      adopted as `fitness` (the hull views select stable structures with
 *      `fitness === 0`)
 *   5. a run that does provide Ed keeps it untouched
 *   6. end to end: parsing an Individuals-only run yields real hull distances
 *      and every elemental corner stays on the hull
 */
import {
  computeQuaternaryLowerPlanes,
  quaternaryHullDistance,
  type Point4D,
  type LowerPlane4D,
} from '@/lib/quaternaryHull';
import { reconstructConvexHull } from '@/lib/convexHullReconstruction';
import { reconstructHullStructures } from '@/domain/hull/reconstructHull';
import { parseAllFiles } from '@/parsers';
import type {
  CompositionMode,
  DetectedFile,
  Structure,
  SystemType,
  USPEXFileType,
} from '@/types/structure';

/* ------------------------------------------------------------------ */
/*  Minimal assertion harness (same shape as the other check files)    */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function close(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(a - b) <= tolerance;
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const VARCOMP = 'varcomp' as CompositionMode;
const QUATERNARY = 'quaternary' as SystemType;
const TERNARY = 'ternary' as SystemType;

interface MkOptions {
  fitness?: number;
}

/**
 * A structure with a per-atom enthalpy; the elemental references below are all
 * exact endmembers, so E_form is the plain formation enthalpy.
 */
function mk(
  id: number,
  composition: number[],
  enthalpyPerAtom: number,
  options: MkOptions = {},
): Structure {
  const atoms = composition.reduce((sum, value) => sum + value, 0);
  return {
    id,
    composition,
    enthalpy: enthalpyPerAtom,
    enthalpyTotal: enthalpyPerAtom * atoms,
    volume: 10 * atoms,
    volumeTotal: 10 * atoms,
    // NaN = "the run provides no hull distance for this structure"
    fitness: options.fitness ?? Number.NaN,
    hullX: [],
    isUserAdded: false,
    eForm: 0,
    eHullRecons: 0,
  } as unknown as Structure;
}

/**
 * Known analytic cloud.
 *
 *   corners of the composition simplex          E_form = 0
 *   P  at (1/4, 1/4, 1/4, 1/4)                  E_form = -1.0   (hull vertex)
 *   P' same composition as P                    E_form = -0.25  → 0.75 above P
 */
const CLOUD: Point4D[] = [
  { x: 1, y: 0, z: 0, e: 0 },
  { x: 0, y: 1, z: 0, e: 0 },
  { x: 0, y: 0, z: 1, e: 0 },
  { x: 0, y: 0, z: 0, e: 0 },
  { x: 0.25, y: 0.25, z: 0.25, e: -1 },
  { x: 0.25, y: 0.25, z: 0.25, e: -0.25 },
  { x: 0.5, y: 0.5, z: 0, e: -0.4 },
  { x: 0.4, y: 0.2, z: 0.1, e: 0.3 },
];

function planeValue(plane: LowerPlane4D, point: Point4D): number {
  const [b0, b1, b2, a] = plane;
  return a + b0 * point.x + b1 * point.y + b2 * point.z;
}

function distanceOf(point: Point4D, points: readonly Point4D[]): number {
  return quaternaryHullDistance(
    point.x,
    point.y,
    point.z,
    point.e,
    computeQuaternaryLowerPlanes(points),
  );
}

/* ------------------------------------------------------------------ */
/*  1-3: 4D lower hull geometry                                        */
/* ------------------------------------------------------------------ */

section('4D lower hull (synthetic quaternary cloud)');
{
  const planes = computeQuaternaryLowerPlanes(CLOUD);
  check('lower hull has facets', planes.length > 0, `got ${planes.length}`);

  const corners = CLOUD.slice(0, 4);
  for (const corner of corners) {
    const distance = quaternaryHullDistance(corner.x, corner.y, corner.z, corner.e, planes);
    check('elemental corner sits on the hull', close(distance, 0, 1e-9), `got ${distance}`);
  }

  const p = CLOUD[4];
  const above = CLOUD[5];
  check(
    'the deep compound is on the hull',
    close(quaternaryHullDistance(p.x, p.y, p.z, p.e, planes), 0, 1e-9),
  );
  const aboveDistance = quaternaryHullDistance(above.x, above.y, above.z, above.e, planes);
  check(
    'the shallow polymorph is exactly 0.75 eV/atom above it',
    close(aboveDistance, 0.75, 1e-7),
    `got ${aboveDistance}`,
  );

  // Orientation: a lower facet must bound *every* point from below.  Keeping an
  // upper facet (or flipping a normal) fails this immediately.
  let worstBelow = Infinity;
  for (const point of CLOUD) {
    for (const plane of planes) {
      worstBelow = Math.min(worstBelow, point.e - planeValue(plane, point));
    }
  }
  check(
    'every point lies above every lower plane',
    worstBelow >= -1e-9,
    `lowest margin ${worstBelow}`,
  );

  // Row order must not change the answer.
  const shuffled = [...CLOUD.slice(4), ...CLOUD.slice(0, 4)].reverse();
  const reversedPlanes = computeQuaternaryLowerPlanes(shuffled);
  const maxShift = Math.max(
    ...CLOUD.map((point) =>
      Math.abs(
        quaternaryHullDistance(point.x, point.y, point.z, point.e, planes) -
          quaternaryHullDistance(point.x, point.y, point.z, point.e, reversedPlanes),
      ),
    ),
  );
  check('distances are independent of row order', maxShift < 1e-9, `max shift ${maxShift}`);

  check('a cloud that is too small reports "not available"', Number.isNaN(distanceOf({ x: 0.5, y: 0.5, z: 0, e: -1 }, CLOUD.slice(0, 4))));
  check('an empty cloud reports "not available"', Number.isNaN(distanceOf({ x: 0, y: 0, z: 0, e: 0 }, [])));

  const flat: Point4D[] = [
    { x: 1, y: 0, z: 0, e: 0 },
    { x: 0, y: 1, z: 0, e: 0 },
    { x: 0, y: 0, z: 1, e: 0 },
    { x: 0, y: 0, z: 0, e: 0 },
    { x: 0.25, y: 0.25, z: 0.25, e: 0 },
    { x: 0.5, y: 0.5, z: 0, e: 0 },
  ];
  let flatDistance = Number.NaN;
  let flatThrew = false;
  try {
    flatDistance = distanceOf({ x: 0.3, y: 0.3, z: 0.3, e: 0.5 }, flat);
  } catch {
    flatThrew = true;
  }
  check('a degenerate (flat) cloud does not throw', !flatThrew);
  check(
    'a point above a flat cloud has a non-negative distance',
    Number.isNaN(flatDistance) || flatDistance >= 0,
    `got ${flatDistance}`,
  );
}

/* ------------------------------------------------------------------ */
/*  4: hull rebuilt when the run provides no Ed                        */
/* ------------------------------------------------------------------ */

section('Hull rebuilt from all converged structures (no USPEX Ed)');
{
  const elements = ['Li', 'Zr', 'Y', 'Cl'];
  // Elements (the most cohesive one is Li at -10 eV/atom) plus two compounds.
  // E_form: Li2Cl2 = -1.5, LiCl = -0.5, everything else is above the hull.
  const build = (): Structure[] => [
    mk(1, [4, 0, 0, 0], -10),
    mk(2, [0, 4, 0, 0], -8),
    mk(3, [0, 0, 4, 0], -5),
    mk(4, [0, 0, 0, 4], -2),
    mk(5, [2, 0, 0, 2], -7.5),
    mk(6, [2, 0, 0, 2], -6),
    mk(7, [1, 1, 0, 0], -9.5),
    mk(8, [1, 1, 0, 0], -7.5),
  ];

  const { structures, references } = reconstructHullStructures(
    build(),
    QUATERNARY,
    VARCOMP,
    elements,
  );
  const byId = (id: number) => structures.find((s) => s.id === id)!;

  check('references resolved for all four elements', references.complete);
  check('E_form of Li2Cl2 is -1.5 eV/atom', close(byId(5).eForm, -1.5, 1e-9), `got ${byId(5).eForm}`);
  check('E_form of LiCl is -0.5 eV/atom', close(byId(7).eForm, -0.5, 1e-9), `got ${byId(7).eForm}`);

  check('hull vertex Li2Cl2 has zero distance', close(byId(5).eHullRecons, 0, 1e-9), `got ${byId(5).eHullRecons}`);
  check(
    'shallow Li2Cl2 is 1.5 eV/atom above the hull',
    close(byId(6).eHullRecons, 1.5, 1e-7),
    `got ${byId(6).eHullRecons}`,
  );
  check(
    'shallow LiCl is 2.0 eV/atom above the hull',
    close(byId(8).eHullRecons, 2.0, 1e-7),
    `got ${byId(8).eHullRecons}`,
  );

  // The bug: with no USPEX Ed the old fallback made only the most cohesive
  // element (Li) stable.  Zr must be stable too, and so must the compounds.
  const stable = structures.filter((s) => s.eHullRecons === 0).map((s) => s.id).sort((a, b) => a - b);
  check(
    'six structures are stable, not just the most cohesive element',
    stable.join(',') === '1,2,3,4,5,7',
    `stable = ${stable.join(',')}`,
  );
  check(
    'missing raw fitness is not replaced by reconstruction',
    structures.every((s) => Number.isNaN(s.fitness)),
  );

  // A run that does provide Ed must keep it untouched.
  const withEd = build();
  for (const s of withEd) s.fitness = s.eHullRecons = 0;
  withEd.find((s) => s.id === 6)!.fitness = 0.02;
  withEd.find((s) => s.id === 8)!.fitness = 3.0;
  reconstructConvexHull(withEd, QUATERNARY, VARCOMP, elements);
  const kept = withEd.find((s) => s.id === 8)!;
  check(
    "USPEX's own Ed is not overwritten",
    kept.fitness === 3.0,
    `got ${kept.fitness}`,
  );
  check(
    'Ed is reused as the reconstructed distance when present',
    kept.eHullRecons === 3.0,
    `got ${kept.eHullRecons}`,
  );
}

/* ------------------------------------------------------------------ */
/*  5: ternary fallback shares the same rule                           */
/* ------------------------------------------------------------------ */

section('Ternary hull rebuilt from all converged structures (no USPEX Ed)');
{
  const elements = ['Li', 'Zr', 'Cl'];
  const structures = [
    mk(1, [1, 0, 0], -10),
    mk(2, [0, 1, 0], -6),
    mk(3, [0, 0, 1], -3),
    mk(4, [1, 0, 1], -8.5),
    mk(5, [1, 0, 1], -7),
  ];
  const { structures: rebuilt } = reconstructHullStructures(
    structures,
    TERNARY,
    VARCOMP,
    elements,
  );
  const byId = (id: number) => rebuilt.find((s) => s.id === id)!;

  check('elemental corners stay on the hull', [1, 2, 3].every((id) => byId(id).eHullRecons === 0));
  check('the deep ternary compound is on the hull', close(byId(4).eHullRecons, 0, 1e-9), `got ${byId(4).eHullRecons}`);
  check(
    'the shallow ternary polymorph is 1.5 eV/atom above the hull',
    close(byId(5).eHullRecons, 1.5, 1e-7),
    `got ${byId(5).eHullRecons}`,
  );
  check(
    'four structures are stable (previously the empty hull made all five stable)',
    rebuilt.filter((s) => s.eHullRecons === 0).length === 4,
    `got ${rebuilt.filter((s) => s.eHullRecons === 0).length}`,
  );
}

/* ------------------------------------------------------------------ */
/*  6: end to end through the file pipeline                            */
/* ------------------------------------------------------------------ */

section('parseAllFiles: Individuals-only run yields a real hull');
{
  const parameters = [
    'PARAMETERS EVOLUTIONARY ALGORITHM',
    '******************************************',
    'USPEX : calculationMethod (USPEX, VCNEB, META)',
    '301   : calculationType (dimension: 0-3; molecule: 0/1; varcomp: 0/1)',
    '1     : AutoFrac',
    '% optType',
    '1',
    '% EndOptType',
    '% atomType',
    'Li Zr Y Cl',
    '% EndAtomType',
    '200   : populationSize (how many individuals per generation)',
    '',
  ].join('\n');

  const header = [
    'Gen   ID    Origin   Composition    Enthalpy   Volume  Density  ML_Bulk_Modul    KPOINTS  SYMM  Q_entr A_order S_order',
    '                                      (eV)     (A^3)  (g/cm^3)',
  ];
  const rows: [number, number[], number][] = [
    [1, [4, 0, 0, 0], -40],
    [2, [0, 4, 0, 0], -32],
    [3, [0, 0, 4, 0], -20],
    [4, [0, 0, 0, 4], -8],
    [5, [2, 0, 0, 2], -30],
    [6, [2, 0, 0, 2], -24],
    [7, [1, 1, 0, 0], -19],
    [8, [1, 1, 0, 0], -15],
  ];
  const individuals = [
    ...header,
    ...rows.map(
      ([id, composition, total]) =>
        `  1  ${String(id).padStart(3)}   Random    [ ${composition.map((n) => String(n).padStart(2)).join('  ')} ]  ${total.toFixed(3)}   40.000   1.000   1.000  [ 1  1  1]   1  0.100  1.000  1.000 `,
    ),
    '',
  ].join('\n');

  const contents = new Map<USPEXFileType, string>([
    ['parameters', parameters],
    ['individuals', individuals],
  ]);
  const detected: DetectedFile[] = [
    { type: 'parameters', file: new File([parameters], 'Parameters.txt'), confidence: 1, displayName: 'Parameters.txt', description: '' },
    { type: 'individuals', file: new File([individuals], 'Individuals'), confidence: 1, displayName: 'Individuals', description: '' },
  ];

  const result = await parseAllFiles(detected, contents);
  const { structures, systemInfo } = result;
  const byId = (id: number) => structures.find((s) => s.id === id)!;

  check('eight structures parsed', structures.length === 8, `got ${structures.length}`);
  check('system is quaternary', systemInfo.systemType === 'quaternary', systemInfo.systemType);
  check(
    'the missing hull data is reported',
    result.warnings.some((w) => w.includes('extended_convex_hull')),
    result.warnings.join(' | '),
  );
  check(
    'every converged structure has a finite reconstructed distance',
    structures.every((s) => Number.isFinite(s.eHullRecons)),
    structures.map((s) => s.eHullRecons).join(','),
  );
  check(
    'Zr (not the most cohesive element) is stable',
    byId(2).eHullRecons === 0,
    `fitness ${byId(2).eHullRecons}`,
  );
  check('the compounds are stable', byId(5).eHullRecons === 0 && byId(7).eHullRecons === 0);
  check(
    'shallow Li2Cl2 is 1.5 eV/atom above the hull',
    close(byId(6).eHullRecons, 1.5, 1e-6),
    `got ${byId(6).eHullRecons}`,
  );
  check(
    'no measured stable structures are invented',
    systemInfo.stableCount === 0,
    `got ${systemInfo.stableCount}`,
  );
  check(
    'the old "E/atom - min(E/atom)" proxy is gone (it gave Li2Cl2 2.5)',
    !close(byId(6).eHullRecons, 2.5, 1e-6),
    `got ${byId(6).eHullRecons}`,
  );
}

/* ------------------------------------------------------------------ */

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} check(s) passed, ${failures.length} failed`,
);
