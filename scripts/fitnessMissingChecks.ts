import './persistenceShim';
import assert from 'node:assert/strict';
import { parseAllFiles, parseExtendedConvexHull } from '@/parsers';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { getStructureFieldValue } from '@/domain/structure/dynamicFields';
import { applyCondition, toSortableNumber } from '@/modules/Filter/filterLogic';
import { hullDisplayStructures, fixedRelativeEnergy, canImportWorkshopStructure } from '@/domain/hull/displayMetric';
import { computeWorkshopGeometricHull } from '@/domain/hull/workshopHull';
import { manualWorkshopStructure } from '@/domain/hull/manualWorkshopStructure';
import { buildCsvText, buildStructureCsvRows, escapeCsvCell } from '@/export/csvExport';
import { buildWorkshopCsvExport } from '@/export/workshopExport';
import { buildTernaryPlotModel, ternaryExportData } from '@/modules/ConvexHull/ternaryPlotModel';
import { filteredProject } from '@/domain/project/filteredProject';
import { validateProject } from '@/domain/project/validateProject';
import type { USPEXFileType, ProjectFile, SystemInfo } from '@/types/structure';

let passed = 0;
async function check(name: string, body: () => unknown | Promise<unknown>) {
  await body(); passed++; console.log(`  ok   ${name}`);
}
const parameters = '301 : calculationType\n% atomType\nTi H\n% EndAtomType';
const individuals = 'generation number num_atoms_all energy cell_volume\n1 1 [1,0] -2 10\n1 2 [0,1] -1 10\n1 3 [1,1] -5 20\n1 4 [1,1] -4 20';
const hull = 'generation number num_atoms_all energy cell_volume e_above_hull\n1 1 [1,0] -2 10 0\n1 2 [0,1] -1 10 0\n1 3 [1,1] -5 20 0';
const { structures, systemInfo } = await parseAllFiles([], new Map<USPEXFileType, string>([
  ['parameters', parameters], ['individuals', individuals], ['extended_convex_hull', hull],
]));
const missing = structures.find(s => s.id === 4)!;
const project: ProjectFile = { version: '1.0.0', created: '', lastModified: '', structures,
  systemInfo, userAddedStructures: [], tags: [], filterPresets: [] };
console.log('\nOriginal Fitness / missing-value invariants');
await check('omitted row keeps Fitness missing and computed Ed = 0.5', () => {
  assert.ok(Number.isNaN(missing.fitness)); assert.equal(missing.eHullRecons, 0.5);
  assert.equal(systemInfo.stableCount, 3); assert.equal(systemInfo.maxFitness, 0);
  assert.equal(systemInfo.fitnessSemantics, 'uspex-original');
});
await check('missing Fitness fails all numeric operators and sorts as absent', () => {
  for (const value of [NaN, -1, Infinity]) {
    const s = { ...missing, fitness: value };
    assert.equal(getStructureFieldValue(s, 'fitness'), undefined);
    for (const operator of ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'] as const)
      assert.equal(applyCondition(s, { kind: 'numeric', field: 'fitness', operator, value: 0.1 }, []), false);
  }
  assert.equal(applyCondition(missing, { kind: 'numeric', field: 'eHullRecons', operator: 'gte', value: 0.5 }, []), true);
  assert.equal(toSortableNumber(getStructureFieldValue(missing, 'fitness')), Infinity);
});
await check('CSV writes blanks for non-finite values', () => {
  assert.equal(buildStructureCsvRows([missing])[0].Fitness_eV_block, '');
  assert.equal(escapeCsvCell(NaN), ''); assert.equal(escapeCsvCell(Infinity), '');
  assert.equal(buildCsvText(['Fitness'], [{ Fitness: NaN }]), 'Fitness\r\n');
});
await check('JSON round-trip restores null to NaN and preserves measured zero', () => {
  const saved = JSON.parse(JSON.stringify(project)); validateProject(saved);
  assert.equal(saved.structures.find((s: { id: number }) => s.id === 4).fitness, null);
  for (const s of saved.structures) {
    const restored = normalizeStructure(s);
    assert.ok(s.id === 4 ? Number.isNaN(restored.fitness) : restored.fitness === 0);
  }
  for (const value of [null, undefined, -1, Infinity])
    assert.ok(Number.isNaN(normalizeStructure({ ...missing, fitness: value } as never).fitness));
});
await check('Ed chart projection and exports do not change original Fitness', () => {
  const computed = hullDisplayStructures(structures, 'reconstructed');
  assert.equal(computed.find(s => s.id === 4)!.fitness, 0.5);
  assert.ok(Number.isNaN(missing.fitness));
  const info = { ...systemInfo, systemType: 'ternary', elements: ['A', 'B', 'C'] } as SystemInfo;
  const ternary = structures.map(s => ({ ...s, composition: [...s.composition, 0] }));
  const model = buildTernaryPlotModel(hullDisplayStructures(ternary, 'reconstructed'), info);
  const data = ternaryExportData(model.entries, info.elements, 'eV/atom', false, 'Ed (Recons)(eV/atom)');
  assert.equal(model.entries.length, 4); assert.equal(buildTernaryPlotModel(ternary, info).entries.length, 3);
  assert.ok(data.headers.includes('Ed (Recons)(eV/atom)') && !data.headers.includes('Fitness(eV/block)'));
});
await check('fixed ranking works without fabricated Fitness', async () => {
  const result = await parseAllFiles([], new Map<USPEXFileType, string>([
    ['parameters', parameters.replace('301', '300')],
    ['individuals', 'generation number num_atoms_all energy\n1 1 [1,1] -5\n1 2 [1,1] -4'],
  ]));
  assert.deepEqual(result.structures.map(fixedRelativeEnergy), [0, 0.5]);
  assert.ok(result.structures.every(s => Number.isNaN(s.fitness)));
});
await check('workshop retains missing Fitness and exports independent Ed', () => {
  assert.ok(structures.every(canImportWorkshopStructure));
  const result = computeWorkshopGeometricHull(structures, systemInfo);
  assert.ok(Number.isNaN(result.structures.find(s => s.id === 4)!.fitness));
  assert.equal(result.structures.find(s => s.id === 4)!.eHullRecons, 0.5);
  const csv = buildWorkshopCsvExport(systemInfo, result.structures).content;
  assert.ok(csv.includes('Ed_Recons(eV/atom)') && !csv.includes('NaN'));
  assert.ok(!canImportWorkshopStructure({ ...missing, enthalpyTotal: NaN }));
  const manual = manualWorkshopStructure({ composition: [1, 1], enthalpy: -3, spaceGroup: 1, notes: '' }, systemInfo, 5);
  assert.ok(Number.isNaN(manual.fitness));
  assert.ok(Number.isNaN(computeWorkshopGeometricHull([...structures, manual], systemInfo).structures.find(s => s.id === 5)!.fitness));
});
await check('filtered statistics exclude missing Fitness', () => {
  const selected = filteredProject(project, [missing]);
  assert.equal(selected.systemInfo.stableCount, 0); assert.equal(selected.systemInfo.maxFitness, 0);
  assert.ok(Number.isNaN(selected.structures[0].fitness));
});
await check('legacy hull without a Fitness column keeps missing values', () => {
  const rows = parseExtendedConvexHull('ID Compositions Enthalpies Volumes SYMM X Y\n1 [1 0] -2 10 1 0 0');
  assert.equal(rows.length, 1); assert.ok(Number.isNaN(rows[0].fitness));
});
await check('Individuals source column casing does not lose genuine values', async () => {
  for (const column of ['FITNESS', 'fitness', 'E_ABOVE_HULL']) {
    const result = await parseAllFiles([], new Map<USPEXFileType, string>([
      ['parameters', parameters],
      ['individuals', `generation number num_atoms_all energy cell_volume ${column}\n1 1 [1,0] -2 10 0\n1 2 [0,1] -1 10 0\n1 3 [1,1] -4 20 0.75`],
    ]));
    assert.deepEqual(result.structures.map(s => s.fitness), [0, 0, 0.75]);
  }
});
await check('Individuals objective cannot fill absent extended-hull Fitness', async () => {
  const result = await parseAllFiles([], new Map<USPEXFileType, string>([
    ['parameters', parameters],
    ['individuals', individuals.replace('cell_volume', 'cell_volume Fitness').replace('-4 20', '-4 20 123')],
    ['extended_convex_hull', hull],
  ]));
  const omitted = result.structures.find(s => s.id === 4)!;
  assert.ok(Number.isNaN(omitted.fitness)); assert.equal(omitted.extraProps?.['Fitness-Individuals'], 123);
});
console.log(`PASS: ${passed} Fitness boundary checks`);
