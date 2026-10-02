import assert from 'node:assert/strict';
import { buildTernaryPlotModel, clampFitnessLimit, ternaryExportData, ternaryMarkGroups } from '@/modules/ConvexHull/ternaryPlotModel';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import type { Structure, SystemInfo } from '@/types/structure';
import { buildCsvText } from '@/export/csvExport';

let count = 0;
function check(name: string, run: () => void) { run(); count++; console.log(`  ok   ${name}`); }
const info = { elements: ['A', 'B', 'C'], systemType: 'ternary', compositionMode: 'varcomp' } as SystemInfo;
const structure = (id: number, composition: number[], fitness = 0, overrides: Partial<Structure> & { _mergeSeq?: number } = {}) =>
  ({ ...normalizeStructure({ id, composition, fitness, enthalpy: -2, enthalpyTotal: -10, eForm: 0, eHullRecons: fitness, formula: `phase${id}` }), ...overrides });
const dataset = [structure(1, [1, 0, 0]), structure(2, [0, 1, 0]), structure(3, [0, 0, 1]),
  structure(4, [1, 1, 1], 0, { eForm: -1 }), structure(5, [1, 1, 1], 0.2, { eForm: -0.8 })];
console.log('\nTernary plot model');
check('a real -1 formation energy is retained in the lower hull', () => {
  const model = buildTernaryPlotModel(dataset, info);
  assert.equal(model.stable.find((e) => e.key === 4)?.eForm, -1);
  assert.ok(model.edges.some((e) => e.p1[1] > 0.2 && e.p1[1] < 0.4 || e.p2[1] > 0.2 && e.p2[1] < 0.4));
});
check('proportional cell compositions produce one stable display point', () => {
  const model = buildTernaryPlotModel([...dataset, structure(6, [2, 2, 2], 0, { eForm: -1 })], info);
  assert.equal(model.stable.length, 4);
});
check('invalid and unconverged records never reach the chart', () => {
  const invalid = [structure(6, [0, 0, 0]), structure(7, [1, -1, 1]), structure(8, [1, 1, 1], Infinity),
    structure(9, [1, 1, 1], -1), structure(10, [1, 1, 1], 0.1, { enthalpyTotal: 1000 })];
  assert.equal(buildTernaryPlotModel(invalid, info).entries.length, 0);
});
check('missing references are unavailable, never replaced by raw enthalpy', () => {
  const missing = { ...info, referenceInfo: { kind: 'elemental', unit: 'eV/atom', complete: false,
    labels: ['A', 'B', 'C'], missing: ['C'], reason: 'missing-endmember' } } as SystemInfo;
  const model = buildTernaryPlotModel(dataset, missing);
  assert.equal(model.entries.find((e) => e.key === 4)?.eForm, null);
  assert.equal(model.entries.find((e) => e.key === 1)?.eForm, 0);
});
check('composition blocks are plotted as block fractions with block energy units', () => {
  const blocks = { ...info, elements: ['Mg', 'Hf', 'O'], componentLabels: ['MgO', 'HfO2', 'O'],
    compositionBasis: [[1, 0, 1], [0, 1, 2], [0, 0, 1]] };
  const model = buildTernaryPlotModel([structure(1, [2, 1, 5], 0.1)], blocks);
  assert.deepEqual(model.entries[0].composition, [0.5, 0.25, 0.25]);
  assert.equal(model.energyUnit, 'eV/block');
});
const tags = [{ id: 'a', nameKey: 'tag.a', color: '#f00' }, { id: 'b', nameKey: 'tag.b', color: '#00f' }];
check('multiple tags and EA search produce one mark with every matching reason', () => {
  const model = buildTernaryPlotModel([structure(1, [1, 1, 1], 0.1, { tags: ['a', 'b'] })], info);
  const marks = ternaryMarkGroups(model.entries, ['a', 'b'], tags, new Set([1]), true);
  assert.equal(marks.length, 1); assert.equal(marks[0].entries.length, 1); assert.equal(marks[0].tags.length, 2); assert.ok(marks[0].byEa);
});
check('workshop groups with the same EA number retain separate click identities', () => {
  const model = buildTernaryPlotModel([structure(1, [1, 1, 1], 0.1, { _mergeSeq: 101, groupName: 'first' }),
    structure(1, [2, 1, 1], 0.2, { _mergeSeq: 102, groupName: 'second' })], info);
  const marks = ternaryMarkGroups(model.entries, [], tags, new Set([1]), false);
  assert.equal(marks.length, 2); assert.deepEqual(marks.map((g) => g.entries[0].key), [101, 102]);
});
check('workshop hides tag overlays while retaining EA search', () => {
  const model = buildTernaryPlotModel([structure(1, [1, 1, 1], 0.1, { tags: ['a'] })], info);
  assert.equal(ternaryMarkGroups(model.entries, ['a'], tags, new Set(), false).length, 0);
  assert.equal(ternaryMarkGroups(model.entries, ['a'], tags, new Set([1]), false).length, 1);
});
check('CSV retains manual structures, groups and unavailable energies', () => {
  const model = buildTernaryPlotModel([...dataset, structure(1, [1, 2, 3], 0.5, { _mergeSeq: 100, isUserAdded: true,
    groupName: 'manual group', eForm: -1, eHullRecons: -1 })], info);
  const { headers, rows } = ternaryExportData([...model.stable, ...model.unstable, ...model.manual], model.components, model.energyUnit, true);
  assert.equal(rows.length, 6); assert.equal(rows[5].Type, 'Manual'); assert.equal(rows[5].Group, 'manual group');
  assert.equal(rows[5]['E_form(eV/atom)'], ''); assert.equal(rows[3]['E_form(eV/atom)'], -1);
  const csv = buildCsvText(headers, rows); assert.ok(!csv.includes('NaN')); assert.ok(csv.includes('manual group'));
});
check('fitness input clamps negative, excessive and non-finite values', () => {
  assert.equal(clampFitnessLimit(-1, 0.5), 0); assert.equal(clampFitnessLimit(3, 0.5), 0.5);
  assert.equal(clampFitnessLimit(NaN, 0.5), 0.5); assert.equal(clampFitnessLimit(0, 0), 0);
});
console.log(`\nTernary plot checks: ${count} passed`);
