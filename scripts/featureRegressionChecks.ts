import './persistenceShim';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { formationEnergy } from '@/domain/structure/formationEnergy';
import { manualWorkshopStructure } from '@/domain/hull/manualWorkshopStructure';
import { computeWorkshopGeometricHull } from '@/domain/hull/workshopHull';
import { prepareWorkshopGroups, workshopCompatibilityError } from '@/domain/hull/workshopCompatibility';
import { validateProject } from '@/domain/project/validateProject';
import { filteredProject } from '@/domain/project/filteredProject';
import { createSaveQueue, projectDataChanged } from '@/domain/project/persistence';
import { animationFrames } from '@/charts/shared/animationFrames';
import { validPlotStructure, selectedFrontData } from '@/domain/structure/plotData';
import { buildWorkshopJsonExport, workshopJsonToStructure } from '@/export/workshopExport';
import { detectFileType } from '@/lib/fileDetection';
import { useProjectStore } from '@/store/useProjectStore';
import { useChartSettingsStore } from '@/store/useChartSettingsStore';
import { getPlotlyTheme } from '@/theme/plotThemeAdapter';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import type { ProjectFile, Structure, SystemInfo } from '@/types/structure';
import type { WorkshopGroup } from '@/modules/HullWorkshop/types';

let passed = 0;
function check(name: string, run: () => void) { run(); passed++; console.log(`  ok   ${name}`); }
const info = { elements: ['Ti', 'H'], systemType: 'binary', compositionMode: 'varcomp', externalPressure: 0,
  optimizationType: 'single', totalStructures: 3, totalGenerations: 1 } as SystemInfo;
const row = (id: number, comp: number[], h: number) => normalizeStructure({ id, composition: comp, enthalpy: h,
  enthalpyTotal: h * comp.reduce((a, b) => a + b, 0), fitness: 0 });
const refs = [row(1, [1, 0], -2), row(2, [0, 1], -1)];
const manual = manualWorkshopStructure({ composition: [1, 3], enthalpy: -3, spaceGroup: 1, notes: 'candidate' }, info, 3);
const group = (systemInfo = info, structures = refs): WorkshopGroup => ({ id: 'g', name: 'A', visible: true,
  color: '#123456', importSource: 'project', systemInfo, structures });
const project: ProjectFile = { version: '1.0.0', created: '', lastModified: '', projectId: 'regression', systemInfo: info,
  structures: refs, userAddedStructures: [], tags: [], filterPresets: [] };
console.log('\nFeature regression checks');
check('manual eV/atom input becomes total cell energy', () => { assert.equal(manual.enthalpy, -3); assert.equal(manual.enthalpyTotal, -12); });
check('TiH3 formation energy is -1.75 and expands the hull', () => {
  const result = computeWorkshopGeometricHull([...refs, manual], info);
  assert.equal(result.structures[2].eForm, -1.75); assert.equal(result.structures[2].fitness, 0); assert.equal(result.hullExpanded, true);
  assert.equal(manual.eForm, -1); // Pure wrapper leaves the source untouched.
});
check('manual input rejects invalid energy and composition', () => {
  assert.throws(() => manualWorkshopStructure({ composition: [0, 0], enthalpy: -3, spaceGroup: 1, notes: '' }, info, 4));
  assert.throws(() => manualWorkshopStructure({ composition: [1, 3], enthalpy: Infinity, spaceGroup: 1, notes: '' }, info, 4));
});
check('fixed compound ranking works without pure references', () => {
  const result = computeWorkshopGeometricHull([row(1, [1, 1], -5), row(2, [1, 1], -4)], { ...info, compositionMode: 'fixed' });
  assert.deepEqual(result.structures.map(s => s.fitness), [0, 1]);
});
check('fixed rankings normalize cell size and compare equal stoichiometry', () => {
  const result = computeWorkshopGeometricHull([row(1, [1, 1], -5), row(2, [2, 2], -4), row(3, [1, 3], -10)], { ...info, compositionMode: 'fixed' });
  assert.deepEqual(result.structures.map(s => s.fitness), [0, 1, 0]);
});
const reversed = { ...info, elements: ['H', 'Ti'] };
check('element order is remapped before hull calculation', () => {
  const groups = prepareWorkshopGroups([group(reversed, [row(3, [3, 1], -3)])], info);
  assert.deepEqual(groups[0].structures[0].composition, [1, 3]);
  const result = computeWorkshopGeometricHull([...refs, ...groups[0].structures], info);
  assert.equal(result.structures[2].hullX[0], 0.75); assert.equal(result.structures[2].eForm, -1.75);
});
check('block row order and element order are independently remapped', () => {
  const target = { ...info, compositionBasis: [[1, 1], [0, 2]], componentLabels: ['TiH', 'H2'] };
  const source = { ...reversed, compositionBasis: [[2, 0], [1, 1]], componentLabels: ['H2', 'TiH'] };
  assert.equal(workshopCompatibilityError(source, target), null);
  const result = prepareWorkshopGroups([group(source, [row(3, [3, 1], -3)])], target)[0];
  assert.deepEqual(result.structures[0].composition, [1, 3]); assert.deepEqual(result.systemInfo.compositionBasis, target.compositionBasis);
});
check('pressure, element set and block units must match', () => {
  assert.ok(workshopCompatibilityError({ ...info, externalPressure: 50 }, info));
  assert.ok(workshopCompatibilityError({ ...info, externalPressure: null }, info));
  assert.ok(workshopCompatibilityError({ ...info, elements: ['Li', 'H'] }, info));
  assert.ok(workshopCompatibilityError({ ...info, compositionBasis: [[2, 0], [0, 1]] }, info));
});
check('batch imports reject incompatible data before insertion', () => {
  const existing = [group()];
  assert.throws(() => { existing.push(...prepareWorkshopGroups([group(), group({ ...info, externalPressure: 50 })], info)); });
  assert.equal(existing.length, 1);
});
check('workshop JSON uses the exported global element order', () => {
  const archive = buildWorkshopJsonExport(info, [group(reversed, [row(3, [3, 1], -3)])]);
  assert.deepEqual(archive.groups[0].structures[0].composition, [1, 3]);
});
check('manual flags, structure data and annotations survive JSON round trip', () => {
  const s = { ...manual, tags: ['candidate'], parentIds: [1, 2], poscarData: 'POSCAR', extraProps: { elastic: 2 } };
  const archive = JSON.parse(JSON.stringify(buildWorkshopJsonExport(info, [group(info, [s])])));
  const restored = workshopJsonToStructure(archive.groups[0].structures[0]);
  assert.equal(restored.isUserAdded, true); assert.equal(restored.enthalpyTotal, -12); assert.equal(restored.notes, 'candidate');
  assert.deepEqual(restored.tags, ['candidate']); assert.deepEqual(restored.parentIds, [1, 2]); assert.equal(restored.poscarData, 'POSCAR');
  assert.ok(Number.isNaN(restored.bulkModulus)); assert.equal(restored.extraProps?.elastic, 2);
});
check('valid formation energy -1 is retained', () => assert.equal(formationEnergy({ ...manual, eForm: -1, eHullRecons: 0 }, info), -1));
check('missing formation energy never substitutes raw enthalpy', () => assert.equal(formationEnergy(manual, info), null));
check('incomplete references reject only affected compositions', () => {
  const missing = { ...info, referenceInfo: { complete: false, reason: 'missing-endmembers', labels: ['Ti', 'H'], missing: ['H'] } } as SystemInfo;
  assert.equal(formationEnergy({ ...manual, eForm: -2, eHullRecons: 0 }, missing), null);
  assert.equal(formationEnergy({ ...refs[0], eForm: 0, eHullRecons: 0 }, missing), 0);
});
check('filtered JSON includes only selected regular and manual structures', () => {
  const filtered = filteredProject({ ...project, userAddedStructures: [manual] }, [refs[1], manual]);
  assert.deepEqual(filtered.structures.map(s => s.id), [2]); assert.deepEqual(filtered.userAddedStructures.map(s => s.id), [3]);
  assert.notEqual(filtered.projectId, project.projectId);
  assert.equal(filtered.systemInfo.totalStructures, 2); assert.equal(filtered.hullGenerations?.length, 0);
  assert.equal(project.structures.length, 2);
});
check('arbitrary axes above 900 stay valid', () => assert.ok(validPlotStructure({ ...manual, generation: 1000, volume: 1000 },
  [{ accessor: s => s.generation }, { accessor: s => s.volume }])));
check('unconverged structures and nonfinite axis values stay excluded', () => {
  assert.equal(validPlotStructure({ ...manual, enthalpyTotal: 100000 }, [{ accessor: s => s.generation }]), false);
  assert.equal(validPlotStructure(manual, [{ accessor: () => NaN }]), false);
});
check('plain scatter retains every row; front mode obeys the selected limit', () => {
  const frontMap = new Map([[1, 1], [2, 2]]);
  assert.equal(selectedFrontData(refs, frontMap, 1, false).length, 2);
  assert.deepEqual(selectedFrontData(refs, frontMap, 1, true).map(s => s.id), [1]);
});
check('playback and GIF restart at the lower bound with both endpoints', () => {
  assert.deepEqual(animationFrames({ min: 0, max: 10 }, null, null, 2), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(animationFrames({ min: 0, max: 10 }, 6, 10, 3), [6, 9, 10]);
});
check('invalid animation steps terminate and large steps reach the end', () => {
  assert.deepEqual(animationFrames({ min: 0, max: 10 }, null, null, 0), []);
  assert.deepEqual(animationFrames({ min: 0, max: 10 }, null, null, -1), []);
  assert.deepEqual(animationFrames({ min: 0, max: 10 }, null, null, 20), [0, 10]);
  assert.ok(animationFrames({ min: 0, max: 10 }, null, null, 0.00001).length <= 2001);
});

// Run the real component callbacks with deterministic inputs; no browser or duplicated formulas.
function extract<T = () => void>(file: string, name: string, env: Record<string, unknown>): T {
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
  const js = ts.transpileModule(`const extracted = (${expression!.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(env), `${js}\nreturn extracted;`)(...Object.values(env)) as T;
}
const beta = 'src/modules/BetaExplorer/BetaExplorerPage.tsx', explorer = 'src/modules/Explorer/ExplorerPage.tsx';
const xField = { accessor: (s: Structure) => s.generation, label: 'Generation', type: 'numeric' };
const yField = { accessor: (s: Structure) => s.enthalpy, label: 'Enthalpy', type: 'numeric' };
const colorField = { accessor: (s: Structure) => s.spaceGroup, label: 'SG', type: 'numeric' };
const points = [normalizeStructure({ ...refs[0], generation: 1000, spaceGroup: 0, tags: ['candidate'] }),
  normalizeStructure({ ...refs[1], generation: 1, spaceGroup: 10, tags: ['candidate'] })];
const theme = getPlotlyTheme('light');
interface TestTrace { customdata?: number[]; marker?: { symbol?: string; opacity?: number } }
const baseEnv = { structures: points, xField, yField, zField: xField, colorField, colorDataRange: { min: 0, max: 10 },
  cMin: null, cMax: null, playStep: 1, playFps: 10, plotTheme: theme, theme: 'light', getPlotlyTheme, formulaToHtml,
  t: (k: string) => k, dimension: '2d', focusMatches: new Set([1]), effectiveFocusMode: 'off', dimOpacity: 0.1,
  markActiveTags: ['candidate'], allTags: [{ id: 'candidate', nameKey: 'candidate', color: '#123456' }],
  markEaInput: '2', parseEaIds, colorByFront: false, frontMap: new Map([[1, 1], [2, 2]]), numFronts: 1,
  xMinimize: true, yMinimize: true, showXMarginal: false, showYMarginal: false, xMin: '', xMax: '', yMin: '', yMax: '',
  animationFrames, validPlotStructure, marginalBins: 10, xExcludeZero: false, yExcludeZero: false };
check('HV reference callbacks include generation 1000 and exclude unconverged rows', () => {
  const callback = extract<() => { x: number; y: number }[]>(beta, 'allValidPoints', { ...baseEnv, structures: [...points, { ...points[0], id: 9, enthalpyTotal: 100000 }] });
  assert.deepEqual(callback(), [{ x: 1000, y: -2 }, { x: 1, y: -1 }]);
});
for (const colorByFront of [false, true]) check(`scatter CSV respects front mode = ${colorByFront}`, () => {
  let count = 0;
  const callback = extract(beta, 'handleExportScatter', { ...baseEnv, colorByFront, filteredData: points, systemInfo: info,
    downloadWideCsv: (_name: string, series: { points: unknown[] }[]) => { count = series.reduce((sum, s) => sum + s.points.length, 0); } });
  callback(); assert.equal(count, colorByFront ? 1 : 2);
});
for (const file of [beta, explorer]) {
  check(`${file.includes('Beta') ? 'HV' : 'Explorer'} default playback starts and reaches the end`, () => {
    const timers: (() => void)[] = []; const highs: number[] = []; let playing = false;
    const callback = extract(file, 'handlePlay', { ...baseEnv, playTimerRef: { current: null },
      setCMin: () => {}, setCMax: (v: number) => highs.push(v), setIsPlaying: (v: boolean) => { playing = v; },
      clearTimeout: () => {}, setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; } });
    callback(); assert.equal(playing, true); assert.equal(highs[0], 0);
    while (timers.length) timers.shift()!(); assert.equal(highs.at(-1), 10); assert.equal(playing, false);
  });
  for (const mode of file === beta ? ['off'] : ['hide', 'dim', 'highlight']) {
    const env = { ...baseEnv, effectiveFocusMode: mode };
    const buildScatterTraces = extract<(points: Structure[]) => TestTrace[]>(file, 'buildScatterTraces', env);
    const buildMarkTraces = extract<(points: Structure[]) => TestTrace[]>(file, 'buildMarkTraces', env);
    const buildMarginalTraces = extract<(points: Structure[]) => TestTrace[]>(file, 'buildMarginalTraces', env);
    let capture: { frames: number[]; buildFrameData: (hi: number) => TestTrace[] } | undefined;
    const callback = extract<() => Promise<void>>(file, 'handleExportGif', { ...env, buildScatterTraces, buildMarkTraces, buildMarginalTraces,
      plotRef: { current: {} }, layoutRef: { current: {} }, setIsExporting: () => {},
      exportAnimatedEChartsGif: async (options: { frames: number[]; buildFrameData: (hi: number) => TestTrace[] }) => { capture = options; } });
    await callback();
    assert.ok(capture);
    check(`${file.includes('Beta') ? 'HV' : 'Explorer'} GIF shares the scene in ${mode} mode`, () => {
      assert.equal(capture!.frames.length, 11);
      const traces = capture!.buildFrameData(10); const ids = traces.flatMap(trace => trace.customdata ?? []);
      if (mode === 'hide') assert.ok(!ids.includes(2)); else assert.ok(ids.includes(1) && ids.includes(2));
      assert.ok(traces.some(trace => trace.marker?.symbol === 'star'));
      if (mode === 'dim') assert.ok(traces.some(trace => trace.marker?.opacity === 0.1));
      if (mode === 'highlight') assert.ok(traces.some(trace => trace.marker?.symbol === 'diamond'));
    });
  }
}
check('Pareto mark scope follows selected fronts, including empty selection', () => {
  const file = 'src/modules/Pareto/ParetoPage.tsx';
  const data = points.map((s, i) => ({ ...s, paretoFront: i + 1, extraProps: { objective: i } }));
  assert.equal(extract<Structure[]>(file, 'visibleStructures', { structures: data, selectedFronts: new Set([1]), paretoKey: 'objective' }).length, 1);
  assert.equal(extract(file, 'visibleStructures', { structures: data, selectedFronts: new Set(), paretoKey: 'objective' }).length, 0);
  useChartSettingsStore.getState().setParetoSelectedFronts([]);
  assert.equal(useChartSettingsStore.getState().paretoSelectionInitialized, true);
});

await useProjectStore.getState().loadProjectFile(project);
for (const patch of [{ structures: {} }, { structures: [{ id: 1, composition: [1] }] }, { userAddedStructures: {} }, { systemInfo: {} }]) {
  let rejected = false;
  try { await useProjectStore.getState().loadProjectFile({ ...project, ...patch } as ProjectFile); } catch { rejected = true; }
  check(`invalid project ${Object.keys(patch)[0]} releases loading and retains data`, () => {
    const state = useProjectStore.getState(); assert.equal(rejected, true); assert.equal(state.isLoading, false);
    assert.equal(state.loadingStage, null); assert.deepEqual(state.structures.map(s => s.id), [1, 2]); assert.equal(state.projectId, 'regression');
  });
}
check('malformed JSON does not pass file detection', () => {
  const content = JSON.stringify({ ...project, structures: {} });
  assert.equal(detectFileType({ name: 'broken.json' } as File, content).type, 'unknown');
  assert.throws(() => validateProject(JSON.parse(content)));
});
check('valid project schema and BOM JSON remain supported', () => {
  validateProject(project); assert.equal(detectFileType({ name: 'valid.json' } as File, '\uFEFF' + JSON.stringify(project)).type, 'project_json');
});
check('malformed labels and tags are rejected before store replacement', () => {
  assert.throws(() => validateProject({ ...project, systemInfo: { ...info, componentLabels: 'TiH' } }));
  assert.throws(() => validateProject({ ...project, tags: ['candidate'] }));
  assert.throws(() => validateProject({ ...project, explorerAxisLabels: { fitness: 1 } }));
});
check('JSON null energies remain unavailable rather than turning into zero', () => {
  const missing = normalizeStructure(JSON.parse(JSON.stringify({ ...manual, enthalpy: NaN, enthalpyTotal: NaN })));
  assert.ok(Number.isNaN(missing.enthalpy)); assert.ok(Number.isNaN(missing.enthalpyTotal));
  assert.equal(validPlotStructure(missing, []), false);
});
check('progress changes do not autosave; annotations and axis labels do', () => {
  const state = { ...useProjectStore.getState() };
  assert.equal(projectDataChanged({ ...state, loadingProgress: 0.5, symmetryStatus: { running: true } }, state), false);
  assert.equal(projectDataChanged({ ...state, explorerAxisLabels: { generation: 'New label' } }, state), true);
  assert.equal(projectDataChanged({ ...state, tags: [] }, state), true);
});
let errors = 0; const saved: number[] = [];
const enqueue = createSaveQueue(async (snapshot: number) => { if (snapshot === 1) throw new Error('quota'); saved.push(snapshot); }, () => { errors++; });
await Promise.all([enqueue(1), enqueue(2), enqueue(3)]);
check('async save failures are caught and later snapshots still save in order', () => {
  assert.equal(errors, 1); assert.deepEqual(saved, [2, 3]);
});
console.log(`\n${passed} feature regression checks passed.`);
