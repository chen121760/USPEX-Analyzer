/**
 * Binary hull checks — standalone node checks (`npm test`).
 *
 * The binary page draws the lower hull in (composition, **formation energy**),
 * but it used to read the legacy `hullY` field, which is only a formation energy
 * for rows that came from `extended_convex_hull`; rows that exist only in
 * Individuals carried their raw per-atom enthalpy there.  The scatter therefore
 * mixed two gauges, and the y axis was clamped at 0, so every structure below
 * the axis minimum disappeared — including the stable compounds, which left a
 * flat "hull" through the two endmembers.
 *
 * The same field-mixing hid a second problem: `extended_convex_hull` lists only
 * the near-hull subset of a run (350 rows for a 4150-structure sample), and the
 * hull distance was published only when the run had *no* Ed at all.  A partly
 * measured run therefore left most of its structures with `fitness = NaN` and
 * built the hull from a subset that can miss its own vertices.
 *
 * The fixture below is that failure in miniature: the true hull vertex (a 1:1
 * compound) is deliberately absent from the hull file, and the file's own Ed for
 * another structure deliberately disagrees with the reconstruction.
 */
import './persistenceShim';

import fs from 'node:fs';
import path from 'node:path';
import { parseAllFiles } from '@/parsers';
import { computeLowerHull2D } from '@/lib/convexHullReconstruction';
import type { DetectedFile, USPEXFileType } from '@/types/structure';

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

console.log('\nBinary hull invariants');

const parameters = [
  'PARAMETERS EVOLUTIONARY ALGORITHM',
  'USPEX : calculationMethod (USPEX, VCNEB, META)',
  '301   : calculationType (dimension: 0-3; molecule: 0/1; varcomp: 0/1)',
  '% atomType',
  'B Mg',
  '% EndAtomType',
  '200   : populationSize',
  '',
].join('\n');

// Total enthalpies (eV/cell) chosen so the formation energies are exact:
//   B4 -20.0 -> mu_B = -5.0        Mg4 -40.0 -> mu_Mg = -10.0
//   B2Mg2 -31.2 -> E_form -0.30    (the true hull vertex, the one the file omits)
//   B1Mg3 -34.6 -> E_form +0.10    B3Mg1 -24.8 -> E_form +0.05
// The hull file lists enthalpies *per atom*, Individuals lists totals: keep both
// consistent or the reference potentials come out as cell energies.
const individuals = [
  'Gen   ID    Origin   Composition    Enthalpy   Volume  Density    KPOINTS  SYMM',
  '                                      (eV)     (A^3)  (g/cm^3)',
  '  1    1   Random    [  4  0]   -20.000    40.000   1.000  [ 1  1  1]   1',
  '  1    2   Random    [  0  4]   -40.000    40.000   1.000  [ 1  1  1]   1',
  '  1    3   Random    [  2  2]   -31.200    40.000   1.000  [ 1  1  1]   1',
  '  1    4   Random    [  1  3]   -34.600    40.000   1.000  [ 1  1  1]   1',
  '  1    5   Random    [  3  1]   -24.800    40.000   1.000  [ 1  1  1]   1',
  // Two cells of the same 1:2 compound (3 and 6 atoms): the same composition at
  // two sizes must end up at exactly the same plotted x, or the drawn hull gains
  // a hair-thin vertical segment.
  '  1    6   Random    [  2  1]   -19.100    30.000   1.000  [ 1  1  1]   1',
  '  1    7   Random    [  4  2]   -38.200    60.000   1.000  [ 1  1  1]   1',
  '',
].join('\n');

// Only the two endmembers and B1Mg3 are listed: the B2Mg2 hull vertex is
// missing, and B1Mg3 carries an Ed (0.30) that differs from the true 0.25.
const extendedHull = [
  '# It contains the all the information in extendedConvexHull.pdf',
  '# Fitness: its distance to the convex hull (eV/atom)',
  '  ID   Compositions    Enthalpies     Volumes     Fitness   SYMM    X        Y',
  '                       (eV/atom)    (A^3/atom)   (eV/atom)              (eV/atom)',
  '    1  [   4   0 ]    -5.0000   10.0000   0.0000   1   0.000   0.0000',
  '    2  [   0   4 ]   -10.0000   10.0000   0.0000   1   1.000   0.0000',
  '    4  [   1   3 ]    -8.6500   10.0000   0.3000   1   0.750   0.1000',
  '',
].join('\n');

const contents = new Map<USPEXFileType, string>([
  ['parameters', parameters],
  ['individuals', individuals],
  ['extended_convex_hull', extendedHull],
]);
const detected: DetectedFile[] = [
  { type: 'parameters', file: new File([parameters], 'Parameters.txt'), confidence: 1, displayName: 'Parameters.txt', description: '' },
  { type: 'individuals', file: new File([individuals], 'Individuals'), confidence: 1, displayName: 'Individuals', description: '' },
  { type: 'extended_convex_hull', file: new File([extendedHull], 'extended_convex_hull'), confidence: 1, displayName: 'extended_convex_hull', description: '' },
];

const { structures, systemInfo } = await parseAllFiles(detected, contents);
const byId = new Map(structures.map((s) => [s.id, s]));
const at = (id: number) => byId.get(id)!;

check('the run is read as a binary', systemInfo.systemType === 'binary', systemInfo.systemType);
check('seven structures were merged', structures.length === 7, String(structures.length));

// ── The published hull distance is complete, whatever the file covers ──────
const converged = structures.filter((s) => s.enthalpyTotal <= 900);
const missing = converged.filter((s) => !Number.isFinite(s.fitness));
check('every converged structure gets a hull distance', missing.length === 0,
  missing.map((s) => `EA${s.id}`).join(', '));
check('the partly measured run is recognised as such', converged.length === 7);

check('USPEX own Ed is kept where the file provides one',
  at(4).fitness === 0.3, String(at(4).fitness));
check('...while the reconstruction still reports the geometric distance',
  Math.abs(at(4).eHullRecons - 0.25) < 1e-6, String(at(4).eHullRecons));
check('a structure the file omits gets the reconstructed distance',
  Math.abs(at(5).fitness - 0.2) < 1e-6, String(at(5).fitness));

// ── The hull itself: the omitted compound must be found ───────────────────
const stable = structures.filter((s) => s.fitness === 0);
check('the omitted compound is stable', at(3).fitness === 0, String(at(3).fitness));
check('exactly the endmembers and that compound are stable',
  stable.length === 3, stable.map((s) => `EA${s.id}`).join(', '));

const distances = structures.map((s) => Math.abs(s.eHullRecons - s.fitness));
check('USPEX Ed and the reconstruction only differ where the file disagrees',
  distances.filter((d) => d > 1e-6).length === 1, distances.join(', '));

// ── What the plot draws ───────────────────────────────────────────────────
// Same construction as BinaryHullPlot: lower hull over the stable structures in
// (x, formation energy).
const hullLine = computeLowerHull2D(
  stable
    .map((s) => ({ x: s.hullX[0] ?? 0, y: s.eForm }))
    .sort((a, b) => a.x - b.x),
);
check('the drawn hull has three vertices, not a flat chord',
  hullLine.length === 3, JSON.stringify(hullLine));
check('the drawn hull dips below zero at the compound',
  hullLine[1] !== undefined && Math.abs(hullLine[1].x - 0.5) < 1e-9 && Math.abs(hullLine[1].y + 0.3) < 1e-9,
  JSON.stringify(hullLine[1]));
check('the formation energies span a negative and a positive range',
  Math.min(...structures.map((s) => s.eForm)) < 0 && Math.max(...structures.map((s) => s.eForm)) > 0);

// ── The legacy field must not disagree with the reconstruction ────────────
const gaugeMismatch = structures.filter(
  (s) => Number.isFinite(s.eForm) && s.eForm !== -1 && Math.abs(s.hullY - s.eForm) > 1e-9,
);
check('hullY carries the formation energy after parsing', gaugeMismatch.length === 0,
  gaugeMismatch.map((s) => `EA${s.id}: hullY=${s.hullY} eForm=${s.eForm}`).join(', '));
check('the Individuals-only rows no longer expose a raw enthalpy as their energy',
  Math.abs(at(3).hullY + 0.3) < 1e-9, String(at(3).hullY));

// Two cells of one compound must share one plotted coordinate.
check('one compound at two cell sizes plots at exactly the same x',
  at(6).hullX[0] === at(7).hullX[0], `${at(6).hullX[0]} vs ${at(7).hullX[0]}`);
check('both cell sizes report the same distance',
  Math.abs(at(6).fitness - at(7).fitness) < 1e-9, `${at(6).fitness} vs ${at(7).fitness}`);

// A duplicate composition must not survive into the drawn hull.
const deduped = computeLowerHull2D([
  { x: 0, y: 0 },
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: -0.2 },
  { x: 1, y: 0 },
]);
check('the lower hull keeps one point per composition',
  deduped.length === 3 && Math.abs(deduped[1].y + 0.2) < 1e-12, JSON.stringify(deduped));

// ── Source guards for the display bugs node cannot render ──────────────────
const plotSource = fs
  .readFileSync(path.resolve('src/modules/ConvexHull/BinaryHullPlot.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
check('the binary plot does not read the mixed-gauge hullY field',
  !plotSource.includes('hullY'));
check('the binary plot does not clamp the energy axis at zero',
  !plotSource.includes('range: [-0.001'), 'a y-axis floor hides every stable compound');
check('the binary plot plots the formation energy',
  plotSource.includes('energyOf(s)') && plotSource.includes('s.eForm'));

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} check(s) passed, ${failures.length} failed`,
);
if (failures.length > 0) process.exitCode = 1;
