import './persistenceShim';
import assert from 'node:assert/strict';
import { parseAllFiles, parseExtendedConvexHull, parseRetainedStructureIds } from '@/parsers';
import { detectFileType } from '@/lib/fileDetection';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { getStructureFieldValue } from '@/domain/structure/dynamicFields';
import { applyCondition, toSortableNumber } from '@/modules/Filter/filterLogic';
import { hullDisplayStructures, fixedRelativeEnergy, selectWorkshopStructures, hasWorkshopSelection, workshopEligibleGroups } from '@/domain/hull/displayMetric';
import { computeWorkshopGeometricHull } from '@/domain/hull/workshopHull';
import { manualWorkshopStructure } from '@/domain/hull/manualWorkshopStructure';
import { buildCsvText, buildStructureCsvRows, escapeCsvCell } from '@/export/csvExport';
import { buildWorkshopCsvExport, buildWorkshopJsonExport, workshopJsonToStructure } from '@/export/workshopExport';
import { prepareWorkshopGroups, workshopJsonImportSource } from '@/domain/hull/workshopCompatibility';
import type { WorkshopGroup } from '@/modules/HullWorkshop/types';
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
await check('project workshop imports only retained IDs independently of Fitness and Ed', () => {
  assert.deepEqual(systemInfo.uspexSelection, { source: 'extended_convex_hull', ids: [1, 2, 3] });
  const selected = selectWorkshopStructures(structures, systemInfo);
  assert.deepEqual(selected.map(s => s.id), [1, 2, 3]);
  assert.equal(selectWorkshopStructures([{ ...missing, fitness: 0, eHullRecons: 0 }], systemInfo).length, 0);
  assert.deepEqual(selectWorkshopStructures([{ ...selected[0], fitness: NaN }], systemInfo).map(s => s.id), [1]);
  const result = computeWorkshopGeometricHull(selected, systemInfo);
  assert.deepEqual(result.structures.map(s => s.id), [1, 2, 3]);
  assert.ok(result.structures.every(s => s.fitness === 0));
  const csv = buildWorkshopCsvExport(systemInfo, result.structures).content;
  assert.ok(csv.includes('Ed_Recons(eV/atom)') && !csv.includes('NaN'));
  assert.equal(selectWorkshopStructures([{ ...selected[0], enthalpyTotal: NaN }], systemInfo).length, 0);
  const manual = manualWorkshopStructure({ composition: [1, 1], enthalpy: -3, spaceGroup: 1, notes: '' }, systemInfo, 5);
  assert.ok(Number.isNaN(manual.fitness));
  assert.ok(Number.isNaN(computeWorkshopGeometricHull([...selected, manual], systemInfo).structures.find(s => s.id === 5)!.fitness));
});
await check('cached project groups exclude omitted low-energy structures before calculating the hull', () => {
  const omitted = { ...missing, enthalpy: -10, enthalpyTotal: -20, eHullRecons: 0 };
  const group: WorkshopGroup = { id: 'project', name: 'USPEX', color: '#123456', visible: true,
    importSource: 'project', systemInfo, structures: [...structures.slice(0, 3), omitted] };
  const eligible = workshopEligibleGroups([group])[0];
  assert.deepEqual(eligible.structures.map(s => s.id), [1, 2, 3]);
  assert.equal(group.structures.length, 4);
  const result = computeWorkshopGeometricHull(eligible.structures, systemInfo);
  assert.equal(result.structures.find(s => s.id === 3)!.eHullRecons, 0);
  const json = buildWorkshopJsonExport(systemInfo, [eligible]);
  assert.deepEqual(json.groups[0].structures.map(s => s.id), [1, 2, 3]);
  assert.equal(json.groups[0].importSource, 'project');
  assert.equal(json.groups[0].fitnessSemantics, 'uspex-original');
  assert.deepEqual(json.groups[0].uspexSelection, systemInfo.uspexSelection);
  assert.equal(workshopJsonImportSource(json.groups[0]), 'project');
  assert.equal(workshopJsonImportSource({ ...json.groups[0], importSource: undefined, fitnessSemantics: undefined }), null);
  const archive = JSON.parse(JSON.stringify(json));
  const restored = { ...eligible, importSource: archive.groups[0].importSource,
    systemInfo: { ...systemInfo, fitnessSemantics: archive.groups[0].fitnessSemantics,
      uspexSelection: archive.groups[0].uspexSelection },
    structures: archive.groups[0].structures.map(workshopJsonToStructure) };
  assert.deepEqual(workshopEligibleGroups([restored])[0].structures.map(s => s.id), [1, 2, 3]);
});
await check('manual candidates remain usable and legacy project values cannot pass as original', () => {
  const manual = manualWorkshopStructure({ composition: [1, 1], enthalpy: -3, spaceGroup: 1, notes: '' }, systemInfo, 5);
  const group: WorkshopGroup = { id: 'legacy', name: 'Legacy', color: '#123456', visible: true,
    importSource: 'project', systemInfo: { ...systemInfo, fitnessSemantics: undefined, uspexSelection: undefined }, structures };
  assert.equal(workshopEligibleGroups([group])[0].structures.length, 0);
  const oldJsonGroup = { ...group, importSource: 'json' as const };
  assert.equal(workshopEligibleGroups([oldJsonGroup])[0].structures.length, 0);
  assert.equal(workshopEligibleGroups([{ ...oldJsonGroup, sourceRecorded: true }])[0].structures.length, structures.length);
  const manualGroup = { ...group, importSource: 'manual' as const, structures: [manual] };
  assert.equal(workshopEligibleGroups([manualGroup])[0].structures.length, 1);
  const manualJson = buildWorkshopJsonExport(systemInfo, [manualGroup]).groups[0];
  assert.equal(workshopJsonImportSource({ ...manualJson, importSource: undefined }), 'manual');
  const prepared = prepareWorkshopGroups([{ ...group, systemInfo }], group.systemInfo)[0];
  assert.equal(prepared.systemInfo.fitnessSemantics, 'uspex-original');
  assert.deepEqual(prepared.systemInfo.uspexSelection, systemInfo.uspexSelection);
});
await check('fixed workshop uses goodStructures IDs even when every Fitness is missing', async () => {
  const fixedParameters = parameters.replace('301', '300');
  const fixedIndividuals = 'generation number num_atoms_all energy\n1 1 [1,1] -5\n1 2 [2,2] -10\n1 3 [1,1] -4';
  const files = new Map<USPEXFileType, string>([
    ['parameters', fixedParameters], ['individuals', fixedIndividuals],
    ['good_structures', 'ID Compositions Enthalpies Volumes fitness SYMM\n1 [1 1] -2.5 10 NaN 1\n3 [1 1] -2 10 NaN 1'],
  ]);
  const result = await parseAllFiles([], files);
  assert.equal(result.structures.length, 3);
  assert.equal(result.systemInfo.compositionMode, 'fixed');
  assert.deepEqual(result.systemInfo.uspexSelection, { source: 'goodStructures', ids: [1, 3] });
  const selected = selectWorkshopStructures(result.structures, result.systemInfo);
  assert.deepEqual(selected.map(s => s.id), [1, 3]);
  assert.ok(selected.every(s => Number.isNaN(s.fitness)));
  assert.deepEqual(computeWorkshopGeometricHull(selected, result.systemInfo).structures.map(fixedRelativeEnergy), [0, 0.5]);
  files.delete('good_structures');
  const withoutSource = await parseAllFiles([], files);
  assert.ok(!hasWorkshopSelection(withoutSource.systemInfo));
  assert.equal(selectWorkshopStructures(withoutSource.structures, withoutSource.systemInfo).length, 0);
});
await check('fixed retained tables locate the ID column and standard source filenames are recognized', () => {
  assert.deepEqual(parseRetainedStructureIds('Gen ID Composition Enthalpy\n5 24 [8] -43\n6 89 [8] -42'), [24, 89]);
  assert.deepEqual(parseRetainedStructureIds('ID Compositions Enthalpies Volumes fitness1 fitness2 SYMM\n152 [4 8] -8.7847 7.1984 -26.3541 7.1257 2'), [152]);
  assert.deepEqual(parseRetainedStructureIds('24 [8] -43'), []);
  assert.deepEqual(parseRetainedStructureIds('ID Compositions Enthalpies\n0 [8] -43\n24x [8] -43\n9007199254740993 [8] -43'), []);
  assert.equal(detectFileType({ name: 'results/goodStructures' } as File, '').type, 'good_structures');
  assert.equal(detectFileType({ name: 'goodStructures_POSCARS' } as File, '').type, 'good_structures_poscars');
});
await check('good POSCARS certify matching IDs and reject conflicting compositions without losing project energy', async () => {
  const poscar = (id: number, counts: number[]) => `EA${id} 1 1 1 90 90 90 Sym.group: 1\n1\n1 0 0\n0 1 0\n0 0 1\nTi H\n${counts.join(' ')}\nDirect\n${Array.from({ length: counts.reduce((a, b) => a + b, 0) }, () => '0 0 0').join('\n')}`;
  const files = new Map<USPEXFileType, string>([
    ['parameters', parameters.replace('301', '300')],
    ['individuals', 'generation number num_atoms_all energy\n1 1 [1,1] -5\n1 2 [1,1] -4'],
    ['good_structures_poscars', poscar(1, [1, 1])],
  ]);
  const result = await parseAllFiles([], files);
  assert.deepEqual(result.systemInfo.uspexSelection, { source: 'goodStructures_POSCARS', ids: [1] });
  assert.deepEqual(selectWorkshopStructures(result.structures, result.systemInfo).map(s => s.id), [1]);
  assert.ok(result.structures.find(s => s.id === 1)!.poscarData);
  files.set('gathered_poscars', poscar(1, [1, 1]));
  files.set('good_structures_poscars', poscar(1, [2, 1]));
  const conflict = await parseAllFiles([], files);
  assert.equal(conflict.structures.length, 2);
  assert.equal(conflict.structures.find(s => s.id === 1)!.enthalpyTotal, -5);
  assert.ok(conflict.structures.find(s => s.id === 1)!.poscarData);
  assert.deepEqual(conflict.systemInfo.uspexSelection!.ids, []);
  assert.ok(conflict.warnings.some(w => w.includes('retained membership excluded')));
  assert.equal(selectWorkshopStructures(conflict.structures, conflict.systemInfo).length, 0);
  files.set('good_structures', 'ID Compositions Enthalpies\n2 [1 1] -2');
  const tablePriority = await parseAllFiles([], files);
  assert.deepEqual(tablePriority.systemInfo.uspexSelection, { source: 'goodStructures', ids: [2] });
  assert.ok(tablePriority.warnings.some(w => w.includes('different retained IDs')));
});
await check('variable project without extended hull never guesses membership from Individuals Fitness', async () => {
  const result = await parseAllFiles([], new Map<USPEXFileType, string>([
    ['parameters', parameters],
    ['individuals', 'generation number num_atoms_all energy Fitness\n1 1 [1,0] -2 0\n1 2 [0,1] -1 0'],
  ]));
  assert.ok(result.structures.every(s => s.fitness === 0));
  assert.equal(selectWorkshopStructures(result.structures, result.systemInfo).length, 0);
  const empty = await parseAllFiles([], new Map<USPEXFileType, string>([
    ['parameters', parameters], ['individuals', individuals],
    ['extended_convex_hull', 'generation number num_atoms_all energy e_above_hull'],
  ]));
  assert.deepEqual(empty.systemInfo.uspexSelection?.ids, []);
  assert.equal(selectWorkshopStructures(empty.structures, empty.systemInfo).length, 0);
});
await check('retained IDs and fixed composition survive project and mixed workshop JSON round trips', () => {
  const saved = JSON.parse(JSON.stringify(project));
  validateProject(saved);
  assert.deepEqual(saved.systemInfo.uspexSelection, systemInfo.uspexSelection);
  for (const invalid of [{ source: 'goodStructures', ids: [1] },
    { source: 'extended_convex_hull', ids: [1, 1] },
    { source: 'extended_convex_hull', ids: [null] }]) {
    assert.throws(() => validateProject({ ...saved, systemInfo: { ...systemInfo, uspexSelection: invalid } }));
  }
  const fixedInfo: SystemInfo = { ...systemInfo, compositionMode: 'fixed',
    uspexSelection: { source: 'goodStructures', ids: [3] } };
  const fixedGroup: WorkshopGroup = { id: 'fixed', name: 'fixed', color: '#123456', visible: true,
    importSource: 'project', systemInfo: fixedInfo, structures: [structures[2]] };
  const prepared = prepareWorkshopGroups([fixedGroup], systemInfo)[0];
  assert.equal(prepared.systemInfo.compositionMode, 'fixed');
  assert.deepEqual(prepared.systemInfo.uspexSelection, fixedInfo.uspexSelection);
  const archive = JSON.parse(JSON.stringify(buildWorkshopJsonExport(systemInfo, [prepared])));
  assert.equal(archive.groups[0].compositionMode, 'fixed');
  const restored = { ...prepared, systemInfo: { ...systemInfo,
    compositionMode: archive.groups[0].compositionMode, uspexSelection: archive.groups[0].uspexSelection },
    structures: archive.groups[0].structures.map(workshopJsonToStructure) };
  assert.equal(workshopEligibleGroups([restored])[0].structures.length, 1);
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
