/**
 * Reproduction probes for the review of b4fcbb6. This is intentionally separate
 * from npm test: it reports observed defects, rather than accepting them as
 * regression expectations. Each probe compares production code with an
 * independently stated invariant; a defect makes the command exit with 1.
 */
import './persistenceShim';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { computeWorkshopGeometricHull } from '@/domain/hull/workshopHull';
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
function mountAutoSave() {
  let nextId = 0, cleanup = () => {};
  const timers = new Map<number, () => void>();
  const writes: ProjectFile[] = [];
  const hook = extract<() => void>('src/hooks/usePersistence.ts', 'useAutoSave', {
    useRef: () => ({ current: null }), useEffect: (setup: () => () => void) => { cleanup = setup(); },
    useProjectStore, createSaveQueue, projectDataChanged,
    saveProjectSnapshot: async (snapshot: ProjectFile) => { writes.push(structuredClone(snapshot)); },
    setTimeout: (fn: () => void) => { timers.set(++nextId, fn); return nextId; },
    clearTimeout: (id: number) => { timers.delete(id); },
  });
  hook();
  return { writes, cleanup: () => cleanup(), fire: async () => {
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
  assert.equal(reloadError, undefined);
});

await probe('A4: a ternary dataset restricted to the Ti-H edge must retain both stable endmembers', () => {
  const ternary = { ...info, elements: ['Ti', 'H', 'Li'], systemType: 'ternary' } as SystemInfo;
  const result = computeWorkshopGeometricHull([
    row(1, [1, 0, 0], -2), row(2, [0, 1, 0], -1), row(3, [1, 1, 0], -2.5),
    row(4, [1, 1, 0], -2),
  ], ternary);
  const fitness = result.structures.map(s => s.fitness);
  console.log('  ternary edge fitness:', JSON.stringify(fitness), '(expected [0, 0, 0, 0.5])');
  assert.deepEqual(fitness, [0, 0, 0, 0.5]);
});

await probe('control: equivalent binary edge data has the correct hull distances', () => {
  const result = computeWorkshopGeometricHull([...refs, row(3, [1, 1], -2.5), row(4, [1, 1], -2)], info);
  assert.deepEqual(result.structures.map(s => s.fitness), [0, 0, 0, 0.5]);
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

console.log(`\n${defects} defect(s) reproduced; ${controls} invariant(s) passed. No business code modified.`);
if (defects) process.exitCode = 1;
