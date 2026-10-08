/**
 * Fixed-composition checks — standalone node checks (`npm test`).
 *
 * USPEX 10.6 does not write a Fitness column for an ordinary fixed-composition
 * search.  The analyzer therefore derives the quantity used by Energy Ranking
 * from the per-atom enthalpy: H - Hmin.  A one-element system used to miss that
 * fallback because it was also classified as `unary`, leaving every fitness as
 * NaN and producing an empty chart.
 *
 * This fixture mirrors uspex_20260928_214222.tar.gz: fixed Si2, Property_X in
 * Individuals, and Pareto_ranking, but no extended_convex_hull or Fitness.
 */
import './persistenceShim';

import { parseAllFiles } from '@/parsers';
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

function close(actual: number, expected: number, tolerance = 1e-12): boolean {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

console.log('\nFixed-composition energy-ranking invariants');

const parameters = [
  'PARAMETERS EVOLUTIONARY ALGORITHM',
  'USPEX : calculationMethod (USPEX, VCNEB, META)',
  '300   : calculationType (dimension: 0-3; molecule: 0/1; varcomp: 0/1)',
  '1     : AutoFrac',
  '% optType',
  '1 max_x',
  '% EndOptType',
  '% atomType',
  'Si',
  '% EndAtomType',
  '% numSpecies',
  '2',
  '% EndNumSpecies',
  '',
].join('\n');

const individuals = [
  'Gen   ID    Origin   Composition    Enthalpy   Volume  Density  Property_X    KPOINTS  SYMM  Q_entr A_order S_order',
  '                                      (eV)     (A^3)  (g/cm^3)',
  '  1    1   Random    [      2    ]   -10.174    32.684   2.854   -221.000  [ 1  1  1] 221 -0.000  4.149  4.153',
  '  1    2   Random    [      2    ]   -10.247    30.181   3.090   -191.000  [ 1  1  1] 191 -0.000  3.456  3.461',
  '  1    3   Random    [      2    ]   -10.247    30.178   3.091   -191.000  [ 1  1  1] 191 -0.000  3.440  3.445',
  '  1    4   RandTop   [      2    ]    -9.906    29.355   3.177   -139.000  [ 1  1  1] 139 -0.000  3.126  3.131',
  '  2    5  Heredity   [      2    ]   -10.213    31.357   2.975    -10.000  [ 1  1  1]  10 -0.000  2.428  2.434',
  '  2    6  Heredity   [      2    ]    -9.085    60.488   1.542   -123.000  [ 1  1  1] 123 -0.000  3.517  3.520',
  '  2    7   Random    [      2    ]   -10.247    30.178   3.091   -191.000  [ 1  1  1] 191  0.000  3.435  3.440',
  '  2    8   Random    [      2    ]   -10.174    32.679   2.854   -221.000  [ 1  1  1] 221 -0.000  4.090  4.094',
  '  2    9 keptBest    [      2    ]   -10.174    32.684   2.854   -221.000  [ 1  1  1] 221 -0.000  4.149  4.153',
  '',
].join('\n');

const pareto = [
  'Pareto  ID   Origin     Composition     Enthalpy   Volume  Density    Property_X   ConvexHull  KPOINTS   SYMM  Q_entr A_order S_order',
  'front                                   eV/atom    (A^3)  (g/cm^3)',
  '  1      1    Random    [      2    ]    -5.087    32.684   2.854      221.000        0.073    [ 1  1  1] 221   -0.000  4.149  4.153',
  '  1      3    Random    [      2    ]    -5.123    30.178   3.091      191.000        0.000    [ 1  1  1] 191   -0.000  3.440  3.445',
  '  2      4    RandTop   [      2    ]    -4.953    29.355   3.177      139.000        0.341    [ 1  1  1] 139   -0.000  3.126  3.131',
  '  2      5   Heredity   [      2    ]    -5.106    31.357   2.975       10.000        0.034    [ 1  1  1]  10   -0.000  2.428  2.434',
  '  3      6   Heredity   [      2    ]    -4.543    60.488   1.542      123.000        1.162    [ 1  1  1] 123   -0.000  3.517  3.520',
  '',
].join('\n');

const contents = new Map<USPEXFileType, string>([
  ['parameters', parameters],
  ['individuals', individuals],
  ['pareto_ranking', pareto],
]);
const detected: DetectedFile[] = [
  { type: 'parameters', file: new File([parameters], 'Parameters.txt'), confidence: 1, displayName: 'Parameters.txt', description: '' },
  { type: 'individuals', file: new File([individuals], 'Individuals'), confidence: 1, displayName: 'Individuals', description: '' },
  { type: 'pareto_ranking', file: new File([pareto], 'Pareto_ranking'), confidence: 1, displayName: 'Pareto_ranking', description: '' },
];

const { structures, systemInfo } = await parseAllFiles(detected, contents);
const byId = new Map(structures.map((structure) => [structure.id, structure]));

check('the run is fixed composition', systemInfo.compositionMode === 'fixed', systemInfo.compositionMode);
check('the one-element system is unary', systemInfo.systemType === 'unary', systemInfo.systemType);
check('Pareto_ranking promotes it to multi-objective', systemInfo.optimizationType === 'multi', systemInfo.optimizationType);
check('all nine Individuals rows are retained', structures.length === 9, String(structures.length));
check('every converged structure gets a finite relative-energy distance',
  structures.every((structure) => Number.isFinite(structure.eHullRecons)),
  structures.filter((structure) => !Number.isFinite(structure.eHullRecons)).map((structure) => `EA${structure.id}`).join(', '));
check('the lowest-enthalpy structures have zero relative energy',
  [2, 3, 7].every((id) => byId.get(id)?.eHullRecons === 0),
  [2, 3, 7].map((id) => `EA${id}:${byId.get(id)?.eHullRecons}`).join(', '));
check('EA1 relative energy is its per-atom enthalpy above the minimum',
  close(byId.get(1)?.eHullRecons ?? Number.NaN, 0.0365),
  String(byId.get(1)?.eHullRecons));
check('original Fitness stays missing when USPEX supplies none',
  structures.every((structure) => Number.isNaN(structure.fitness)),
  structures.map((structure) => `EA${structure.id}:${structure.eHullRecons}/${structure.eHullRecons}`).join(', '));
check('Property_X preserves the USPEX sign convention across both files',
  byId.get(1)?.extraProps?.['Property_X-Individuals'] === -221 &&
    byId.get(1)?.extraProps?.['Property_X-Pareto_ranking'] === 221,
  JSON.stringify(byId.get(1)?.extraProps));
check('the plain Property_X column is the Individuals copy, not the raw Pareto value',
  byId.get(1)?.extraProps?.['Property_X'] === -221,
  JSON.stringify(byId.get(1)?.extraProps));
check('the plain column and its -Individuals twin never disagree',
  structures.every((structure) =>
    structure.extraProps?.['Property_X'] === structure.extraProps?.['Property_X-Individuals']),
  structures.map((structure) => `${structure.id}:${structure.extraProps?.['Property_X']}`).join(', '));

console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${passed} check(s) passed, ${failures.length} failed`,
);
if (failures.length > 0) process.exitCode = 1;
