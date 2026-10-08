/**
 * Regression probes for the seven defects found in the review of b4fcbb6.
 * Each probe compares production code with an independently stated invariant;
 * a defect makes both this standalone command and npm test exit with 1.
 */
import './persistenceShim';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { computeWorkshopGeometricHull } from '@/domain/hull/workshopHull';
import { buildTernaryHullGeometry } from '@/domain/hull/ternaryHullGeometry';
import { buildTernaryPlotModel } from '@/modules/ConvexHull/ternaryPlotModel';
import { prepareWorkshopGroups } from '@/domain/hull/workshopCompatibility';
import { validateProject } from '@/domain/project/validateProject';
import { filteredProject } from '@/domain/project/filteredProject';
import { createSaveQueue, projectDataChanged } from '@/domain/project/persistence';
import { useProjectStore } from '@/store/useProjectStore';
import { parseAllFiles } from '@/parsers';
import type { ProjectFile, Structure, SystemInfo, USPEXFileType } from '@/types/structure';
import type { WorkshopGroup } from '@/modules/HullWorkshop/types';

const info = { elements: ['Ti', 'H'], systemType: 'binary', compositionMode: 'varcomp', externalPressure: 0,
  optimizationType: 'single', totalStructures: 3, totalGenerations: 1 } as SystemInfo;
const row = (id: number, composition: number[], h: number) => normalizeStructure({ id, composition, enthalpy: h,
  enthalpyTotal: h * composition.reduce((sum, n) => sum + n, 0), fitness: 0 });
const refs = [row(1, [1, 0], -2), row(2, [0, 1], -1)];
const project = (id = 'A'): ProjectFile => ({ version: '1.0.0', created: '', lastModified: '', projectId: id,
  projectName: id, systemInfo: info, structures: refs, userAddedStructures: [], tags: [], filterPresets: [] });

// Extract the actual production callback, with clocks/storage/hooks injected.
function extract<T>(file: string, name: string, env: Record<string, unknown>): T {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Node | undefined;
  const visit = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) expression = n;
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name && n.initializer) {
      expression = ts.isCallExpression(n.initializer) && ['useMemo', 'useCallback'].includes(n.initializer.expression.getText(ast))
        ? n.initializer.arguments[0] : n.initializer;
    }
    ts.forEachChild(n, visit);
  };
  visit(ast); assert.ok(expression, name);
  const callbackSource = expression.getText(ast).replace(/^export\s+/, '');
  const js = ts.transpileModule(`const extracted = (${callbackSource});`, {
    fileName: 'extracted.tsx', compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(env), `${js}\nreturn extracted;`)(...Object.values(env)) as T;
}

let defects = 0, controls = 0;
async function probe(name: string, run: () => void | Promise<void>) {
  try { await run(); controls++; console.log(`PASS ${name}`); }
  catch (error) {
    if (!(error instanceof assert.AssertionError)) throw error;
    defects++; console.log(`DEFECT ${name}\n${error.message}`);
  }
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function mountAutoSave(writeDelay: Promise<void> = Promise.resolve()) {
  let nextId = 0, cleanup = () => {};
  const timers = new Map<number, () => void>();
  const writes: ProjectFile[] = [];
  const records = new Map<string, Map<string, { project: ProjectFile }>>();
  const saveSnapshot = extract<(snapshot: ProjectFile) => Promise<void>>('src/lib/projectStorage.ts', 'saveProjectSnapshot', {
    getProjectDB: async () => ({ transaction: (stores: string[], mode: string) => {
      assert.deepEqual(stores, ['project-data', 'projects']); assert.equal(mode, 'readwrite');
      return { done: Promise.resolve(), objectStore: (store: string) => ({ put: async (value: { id?: string; project: ProjectFile }, key?: string) => {
        if (!records.has(store)) records.set(store, new Map());
        records.get(store)!.set(key ?? value.id!, structuredClone(value));
      } }) };
    } }),
    makeProjectId: () => { throw new Error('Fixture must carry its project id'); },
  });
  const hook = extract<() => void>('src/hooks/usePersistence.ts', 'useAutoSave', {
    useRef: () => ({ current: null }), useEffect: (setup: () => () => void) => { cleanup = setup(); },
    useProjectStore, createSaveQueue, projectDataChanged,
    saveProjectSnapshot: async (snapshot: ProjectFile) => {
      await writeDelay; await saveSnapshot(snapshot); writes.push(structuredClone(snapshot));
    },
    setTimeout: (fn: () => void) => { timers.set(++nextId, fn); return nextId; },
    clearTimeout: (id: number) => { timers.delete(id); },
  });
  hook();
  return { writes, records, cleanup: () => cleanup(), fire: async () => {
    const current = [...timers.values()]; timers.clear(); current.forEach(fn => fn()); await tick();
  } };
}

await probe('control: a normal note edit is saved after the debounce', async () => {
  await useProjectStore.getState().loadProjectFile(project());
  const harness = mountAutoSave();
  try {
    useProjectStore.getState().updateStructureNotes(1, 'edited'); await harness.fire();
    assert.equal(harness.writes.at(-1)?.structures[0].notes, 'edited');
  } finally { harness.cleanup(); }
});

await probe('A1: switching projects within 2 seconds must retain the old project edit', async () => {
  await useProjectStore.getState().loadProjectFile(project());
  const harness = mountAutoSave();
  try {
    await harness.fire(); // A was saved before this edit.
    useProjectStore.getState().updateStructureNotes(1, 'unsaved A edit');
    await useProjectStore.getState().loadProjectFile(project('B'));
    await harness.fire();
    console.log('  saved snapshots:', JSON.stringify(harness.writes.map(p => [p.projectId, p.structures[0].notes])));
    assert.equal(harness.writes.filter(p => p.projectId === 'A').at(-1)?.structures[0].notes, 'unsaved A edit');
    assert.equal(harness.records.get('projects')?.get('A')?.project.structures[0].notes, 'unsaved A edit');
    assert.equal(harness.records.get('project-data')?.get('current-session')?.project.projectId, 'B');
  } finally { harness.cleanup(); }
});

await probe('A2: a timer skipped while loading must be rescheduled when loading ends', async () => {
  await useProjectStore.getState().loadProjectFile(project());
  const harness = mountAutoSave();
  try {
    useProjectStore.getState().updateStructureNotes(1, 'pending edit');
    // The pending save expires while a rejected import is awaiting its first paint.
    const load = useProjectStore.getState().loadProjectFile({ ...project('bad'), structures: {} } as unknown as ProjectFile)
      .catch(() => {});
    assert.equal(useProjectStore.getState().isLoading, true);
    await harness.fire(); await load; await harness.fire();
    assert.equal(useProjectStore.getState().projectId, 'A');
    assert.equal(useProjectStore.getState().isLoading, false);
    assert.equal(harness.writes.at(-1)?.structures[0].notes, 'pending edit');
  } finally { harness.cleanup(); }
});

const parameters = (elements: string, counts: string, calculationType: number) => [
  'PARAMETERS EVOLUTIONARY ALGORITHM', `${calculationType} : calculationType`,
  '% atomType', elements, '% EndAtomType', '% numSpecies', counts, '% EndNumSpecies',
].join('\n');
const individuals = (counts: string, energy: number) => [
  'Gen ID Origin Composition Enthalpy Volume Density KPOINTS SYMM Q_entr A_order S_order',
  '                             (eV)  (A^3) (g/cm^3)',
  `1 1 Random [ ${counts} ] ${energy} 30 2 [ 1 1 1 ] 1 0 0 0`,
].join('\n');
const contents = (elements: string, counts: string, calculationType: number) => new Map<USPEXFileType, string>([
  ['parameters', parameters(elements, counts, calculationType)], ['individuals', individuals(counts, -10)],
]);

await probe('A3: parsing a fresh Si project must clear the Ti-H manual rows and custom metadata', async () => {
  await useProjectStore.getState().loadProjectFile(project());
  useProjectStore.getState().addUserStructure({ composition: [1, 1], enthalpy: -3, enthalpyTotal: -6 });
  useProjectStore.getState().addTag({ id: 'A-only', nameKey: 'A-only', color: '#123456' });
  useProjectStore.getState().addFilterPreset({ id: 'A-only', name: 'A-only', conditions: [] });
  await useProjectStore.getState().processFiles([], contents('Si', '2', 300));
  const state = useProjectStore.getState();
  assert.deepEqual(state.systemInfo?.elements, ['Si']);
  assert.equal(state.structures.length, 1); // A real, successfully parsed new project.
  const exported = state.exportProjectFile();
  let reloadError: string | undefined;
  try { validateProject(exported); } catch (error) { reloadError = (error as Error).message; }
  console.log('  Si project manual compositions:', JSON.stringify(state.userStructures.map(s => s.composition)),
    'custom tags:', JSON.stringify(state.tags.map(t => t.id)), 'reimport error:', reloadError);
  assert.equal(state.userStructures.length, 0);
  assert.ok(!state.tags.some(tag => tag.id === 'A-only'));
  assert.deepEqual(state.filterPresets, []);
  assert.equal(state.projectName, '');
  assert.equal(reloadError, undefined);
  await useProjectStore.getState().loadProjectFile(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(useProjectStore.getState().systemInfo?.elements, ['Si']);
});

await probe('A4: a ternary dataset restricted to the Ti-H edge must retain both stable endmembers', () => {
  const ternary = { ...info, elements: ['Ti', 'H', 'Li'], systemType: 'ternary' } as SystemInfo;
  const result = computeWorkshopGeometricHull([
    row(1, [1, 0, 0], -2), row(2, [0, 1, 0], -1), row(3, [1, 1, 0], -2.5),
    row(4, [1, 1, 0], -2),
  ], ternary);
  const fitness = result.structures.map(s => s.eHullRecons);
  console.log('  ternary edge fitness:', JSON.stringify(fitness), '(expected [0, 0, 0, 0.5])');
  assert.deepEqual(fitness, [0, 0, 0, 0.5]);
});

await probe('control: equivalent binary edge data has the correct hull distances', () => {
  const result = computeWorkshopGeometricHull([...refs, row(3, [1, 1], -2.5), row(4, [1, 1], -2)], info);
  assert.deepEqual(result.structures.map(s => s.eHullRecons), [0, 0, 0, 0.5]);
});

await probe('control: fixed TiH data in eV/atom can join an elemental Ti-H workshop at the same pressure', async () => {
  const parsed = await parseAllFiles([], contents('Ti H', '1 1', 300));
  assert.equal(parsed.systemInfo.compositionMode, 'fixed');
  assert.equal(parsed.structures.length, 1);
  const fixed = { ...parsed.systemInfo, externalPressure: 0 };
  const group: WorkshopGroup = { id: 'fixed', name: 'TiH', visible: true, color: '#123456', importSource: 'project',
    systemInfo: fixed, structures: parsed.structures };
  let error: string | undefined;
  try { prepareWorkshopGroups([group], info); } catch (e) { error = (e as Error).message; }
  console.log('  fixed basis:', JSON.stringify(fixed.compositionBasis), 'import result:', error);
  assert.equal(error, undefined);
});

await probe('A5: accepted per-atom JSON lacking total energy must preserve TiH3 formation energy', async () => {
  const p = project();
  // Known per-atom enthalpy, four atoms: total is -12 eV, E_form is -1.75 eV/atom.
  p.structures = [...refs, { id: 3, composition: [1, 3], enthalpy: -3, fitness: 0 } as Structure];
  validateProject(p); await useProjectStore.getState().loadProjectFile(p);
  const result = computeWorkshopGeometricHull(useProjectStore.getState().structures, info);
  console.log('  accepted TiH3 total/formation:', result.structures[2].enthalpyTotal, result.structures[2].eForm);
  assert.equal(result.structures[2].eForm, -1.75);
});

await probe('A6: filtered projects must not retain the removed unconverged rows in dashboard statistics', () => {
  const p = project(); p.structures = [...refs, row(3, [1, 1], 100000)];
  p.systemInfo = { ...info, totalStructures: 3, unconvergedCount: 1, totalStructuresSource: 'Individuals' };
  const exported = filteredProject(p, [p.structures[0]]);
  console.log('  filtered rows/unconverged:', exported.structures.length, exported.systemInfo.unconvergedCount);
  assert.equal(exported.systemInfo.unconvergedCount, 0);
});

await probe('A7: malformed numeric JSON must be rejected before the table renderer throws', async () => {
  const p = project(); p.structures = [{ ...refs[0], volume: '30' } as unknown as Structure];
  let rejected = false;
  try { await useProjectStore.getState().loadProjectFile(p); } catch { rejected = true; }
  // Run the production columns memo and the actual volume cell, rather than a copied formatter.
  const tableFile = 'src/modules/DataTable/DataTablePage.tsx';
  const hasVolume = extract<boolean>(tableFile, 'hasVolume', { structures: useProjectStore.getState().structures });
  const columns = extract<() => { id?: string; accessorKey?: string; cell?: (context: unknown) => unknown }[]>(
    'src/modules/DataTable/DataTablePage.tsx', 'columns', {
      t: (key: string) => key, systemInfo: info, hasVolume, hasDensity: false, isVarcomp: true,
      hasPareto: false, hasML: false, hasFingerprint: false, extraPropKeys: [], secondObjectiveName: '',
    });
  let renderError: string | undefined;
  if (!rejected) {
    try {
      const volume = columns().find(col => col.accessorKey === 'volume'); assert.ok(volume?.cell);
      volume.cell({ getValue: () => useProjectStore.getState().structures[0].volume });
    } catch (e) { renderError = (e as Error).message; }
  }
  console.log('  rejected:', rejected, 'render error:', renderError);
  assert.ok(rejected, 'Numeric schema must reject this project');
});

await probe('save queue retains outgoing annotations and the incoming session during a slow write', async () => {
  await useProjectStore.getState().loadProjectFile(project());
  let release!: () => void;
  const harness = mountAutoSave(new Promise<void>(resolve => { release = resolve; }));
  try {
    await harness.fire();
    useProjectStore.getState().updateStructureNotes(1, 'delayed A');
    useProjectStore.getState().updateStructureTags(1, ['candidate']);
    await useProjectStore.getState().loadProjectFile(project('B'));
    useProjectStore.getState().updateStructureNotes(2, 'new B');
    await harness.fire();
    release(); await tick();
    const a = harness.records.get('projects')?.get('A')?.project;
    const b = harness.records.get('project-data')?.get('current-session')?.project;
    assert.equal(a?.structures[0].notes, 'delayed A'); assert.deepEqual(a?.structures[0].tags, ['candidate']);
    assert.equal(b?.projectId, 'B'); assert.equal(b?.structures[1].notes, 'new B');
  } finally { release(); harness.cleanup(); }
});

await probe('unmount flushes pending annotations', async () => {
  await useProjectStore.getState().loadProjectFile(project());
  const harness = mountAutoSave();
  useProjectStore.getState().updateStructureNotes(1, 'last edit');
  harness.cleanup(); await tick();
  assert.equal(harness.records.get('projects')?.get('A')?.project.structures[0].notes, 'last edit');
});

const ternaryInfo = { ...info, elements: ['Ti', 'H', 'Li'], systemType: 'ternary' } as SystemInfo;
const edgeRows = () => [row(1, [1, 0, 0], -2), row(2, [0, 1, 0], -1), row(3, [1, 1, 0], -2.5)];
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

for (const missing of [0, 1, 2]) await probe(`all ternary edges preserve endmembers and duplicate-composition distances (${missing})`, () => {
  const comp = (a: number, b: number) => {
    const result = [a, b]; result.splice(missing, 0, 0); return result;
  };
  const result = computeWorkshopGeometricHull([
    row(1, comp(1, 0), -2), row(2, comp(0, 1), -1), row(3, comp(1, 1), -2.5), row(4, comp(1, 1), -2),
  ], ternaryInfo);
  result.structures.forEach((s, i) => close(s.eHullRecons, [0, 0, 0, 0.5][i]));
  assert.equal(result.hullEdges?.length, 2);
});

await probe('three ternary endmembers form a coplanar hull with three tie lines', () => {
  const result = computeWorkshopGeometricHull([row(1, [1, 0, 0], -2), row(2, [0, 1, 0], -1), row(3, [0, 0, 1], -0.5)], ternaryInfo);
  assert.deepEqual(result.structures.map(s => s.eHullRecons), [0, 0, 0]); assert.equal(result.hullEdges?.length, 3);
});
await probe('coplanar hull interpolates a sloped plane rather than subtracting its minimum', () => {
  const geometry = buildTernaryHullGeometry([{ x: 0, y: 0, z: -2 }, { x: 1, y: 0, z: -1 },
    { x: 0, y: 1, z: -3 }, { x: 0.3, y: 0.3, z: -2 }]);
  close(geometry.distance({ x: 0.3, y: 0.3, z: -1.5 }), 0.5); assert.equal(geometry.edges.length, 3);
});
await probe('a single projected composition uses its own lowest energy', () => {
  const geometry = buildTernaryHullGeometry([{ x: 0.3, y: 0.2, z: -1 }, { x: 0.3, y: 0.2, z: -2 }]);
  close(geometry.distance({ x: 0.3, y: 0.2, z: -1 }), 1); assert.deepEqual(geometry.edges, []);
});
await probe('an arbitrary collinear slice uses its local binary lower envelope', () => {
  const geometry = buildTernaryHullGeometry([{ x: 0.2, y: 0.1, z: 0 }, { x: 0.3, y: 0.3, z: -0.5 }, { x: 0.4, y: 0.5, z: 0 }]);
  close(geometry.distance({ x: 0.3, y: 0.3, z: 0 }), 0.5); assert.equal(geometry.edges.length, 2);
});
await probe('a manual row above a ternary edge does not expand the hull', () => {
  const manual = { ...row(4, [1, 1, 0], -2.25), isUserAdded: true };
  const result = computeWorkshopGeometricHull([...edgeRows(), manual], ternaryInfo);
  close(result.structures[3].eHullRecons, 0.25); assert.ok(!result.hullExpanded); assert.equal(result.hullEdges?.length, 2);
});
await probe('a manual row below a ternary edge expands it and retains the old tie lines', () => {
  const source = [...edgeRows(), { ...row(4, [1, 1, 0], -3), isUserAdded: true }];
  const before = structuredClone(source);
  const result = computeWorkshopGeometricHull(source, ternaryInfo);
  close(result.structures[2].eHullRecons, 0.5); close(result.structures[3].eHullRecons, 0);
  assert.equal(result.hullExpanded, true); assert.equal(result.oldHullEdges?.length, 2); assert.equal(result.hullEdges?.length, 2);
  assert.deepEqual(buildTernaryPlotModel(result.structures, ternaryInfo).edges, result.hullEdges);
  assert.deepEqual(source, before);
});
await probe('the production plot model displays coplanar and edge tie lines deterministically', () => {
  const datasets = [edgeRows(), [row(1, [1, 0, 0], -2), row(2, [0, 1, 0], -1), row(3, [0, 0, 1], -0.5)]];
  for (const dataset of datasets) {
    const result = computeWorkshopGeometricHull(dataset, ternaryInfo);
    const first = buildTernaryPlotModel(result.structures, ternaryInfo);
    assert.deepEqual(first.edges, result.hullEdges);
    assert.deepEqual(buildTernaryPlotModel(result.structures, ternaryInfo).edges, first.edges);
  }
});
await probe('a full ternary hull preserves the compound minimum and polymorph distance', () => {
  const source = [row(1, [1, 0, 0], -2), row(2, [0, 1, 0], -1), row(3, [0, 0, 1], -0.5),
    row(4, [1, 1, 1], -2.5), row(5, [1, 1, 1], -2)];
  const result = computeWorkshopGeometricHull(source, ternaryInfo);
  result.structures.forEach((s, i) => close(s.eHullRecons, i === 4 ? 0.5 : 0)); assert.ok(result.hullEdges!.length >= 6);
});

await probe('missing total energy derives from atom count, while explicit totals and nulls are preserved', () => {
  assert.equal(normalizeStructure({ id: 1, composition: [3, 9], enthalpy: -3 }).enthalpyTotal, -36);
  assert.equal(normalizeStructure({ id: 1, composition: [1, 3], enthalpy: -3, enthalpyTotal: -30 }).enthalpyTotal, -30);
  const missing = normalizeStructure(JSON.parse('{"id":1,"composition":[1,3],"enthalpy":null,"enthalpyTotal":null}'));
  assert.ok(Number.isNaN(missing.enthalpy)); assert.ok(Number.isNaN(missing.enthalpyTotal));
});
await probe('filtered project statistics follow only selected rows, including manual rows', () => {
  const manual = { ...row(9, [1, 1], -4), isUserAdded: true, generation: 5, fitness: 0.25 };
  const exported = filteredProject({ ...project(), systemInfo: { ...info, minEnthalpy: -99, maxFitness: 100 } }, [refs[0], manual]);
  assert.equal(exported.systemInfo.totalStructures, 2); assert.equal(exported.systemInfo.stableCount, 1);
  assert.equal(exported.systemInfo.minEnthalpy, -4); assert.equal(exported.systemInfo.maxFitness, 0.25);
  assert.equal(exported.systemInfo.totalGenerations, 5); assert.equal(exported.systemInfo.totalStructuresSource, 'Filtered selection');
  const empty = filteredProject(project(), []);
  assert.equal(empty.systemInfo.minEnthalpy, 0); assert.equal(empty.systemInfo.maxFitness, 0); assert.equal(empty.systemInfo.totalGenerations, 0);
});

for (const key of ['volume', 'volumeTotal', 'density', 'generation', 'spaceGroup', 'hullY', 'parentEnthalpy', 'paretoFront',
  'bulkModulus', 'shearModulus', 'youngModulus', 'poissonRatio', 'pughRatio', 'vickersHardness', 'fractureToughness',
  'qEntropy', 'aOrder', 'sOrder']) await probe(`numeric JSON field ${key} rejects strings`, () => {
  assert.throws(() => validateProject({ ...project(), structures: [{ ...refs[0], [key]: '30' }] }));
});
await probe('numeric arrays and nested scientific data reject malformed values', () => {
  for (const patch of [{ hullX: ['0.5'] }, { kpoints: ['1'] }, { parentIds: ['1'] }, { extraProps: { custom: '3' } },
    { latticeParams: { a: '3' } }, { symmetry: { version: 1, symprecs: ['0.1'], points: [] } },
    { symmetry: { version: 1, points: [{ symprec: '0.1' }] } }, { isUserAdded: 'false' }]) {
    assert.throws(() => validateProject({ ...project(), structures: [{ ...refs[0], ...patch }] }));
  }
  assert.throws(() => validateProject({ ...project(), systemInfo: { ...info, minEnthalpy: '-3' } }));
  assert.throws(() => validateProject({ ...project(), systemInfo: { ...info, systemType: ['binary'] } }));
  assert.throws(() => validateProject({ ...project(), systemInfo: { ...info, compositionMode: ['fixed'] } }));
  assert.throws(() => validateProject({ ...project(), hullGenerations: [{ generation: 1, entries: [{ composition: ['1'], enthalpy: 0 }] }] }));
});
await probe('legacy optional fields, scalar hull coordinates and JSON null scientific values remain importable', async () => {
  const p = project();
  p.structures = [{ id: 1, composition: [1, 0], enthalpy: null, enthalpyTotal: null, volume: null,
    hullX: [null], extraProps: { custom: null }, latticeParams: { a: null, b: null, c: null },
    symmetry: { version: 1, symprecs: [null], points: [{ symprec: null, number: 0 }] } },
    { id: 2, composition: [0, 1], enthalpy: -1, hullX: 1 }] as unknown as Structure[];
  validateProject(p); await useProjectStore.getState().loadProjectFile(p);
  const [missing, legacy] = useProjectStore.getState().structures;
  assert.ok(Number.isNaN(missing.enthalpyTotal)); assert.ok(Number.isNaN(missing.extraProps!.custom));
  assert.ok(Number.isNaN(missing.hullX[0])); assert.ok(Number.isNaN(missing.latticeParams!.a));
  assert.ok(Number.isNaN(missing.symmetry!.points[0].symprec)); assert.deepEqual(legacy.hullX, [1]);
  validateProject(JSON.parse(JSON.stringify(useProjectStore.getState().exportProjectFile())));
});

console.log(`\n${defects} defect(s) reproduced; ${controls} invariant(s) passed.`);
if (defects) process.exitCode = 1;
