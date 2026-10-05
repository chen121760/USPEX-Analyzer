/** Regression checks for the eight first-principles review findings. */
import './persistenceShim';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { reconstructHullStructures } from '@/domain/hull/reconstructHull';
import { computeWorkshopGeometricHull } from '@/domain/hull/workshopHull';
import { validateProject } from '@/domain/project/validateProject';
import { useProjectStore } from '@/store/useProjectStore';
import { parseAllFiles, parseGatheredPoscars, parseIndividuals, parseExtendedConvexHull } from '@/parsers';
import { validPlotStructure } from '@/domain/structure/plotData';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormulaDisplay } from '@/components/FormulaDisplay';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { safePlotHtml } from '@/utils/htmlText';
import { adaptToECharts } from '@/charts/shared/echartsAdapter';
import { extractArchive, entriesToFiles } from '@/utils/extractArchive';
import { detectFileType } from '@/lib/fileDetection';
import { formationEnergy } from '@/domain/structure/formationEnergy';
import { getStructureFieldValue } from '@/domain/structure/dynamicFields';
import type { ProjectFile, SystemInfo, USPEXFileType } from '@/types/structure';

const info = { elements: ['Ti', 'H'], systemType: 'binary', compositionMode: 'varcomp',
  externalPressure: 0, optimizationType: 'single', totalStructures: 0, totalGenerations: 1 } as SystemInfo;
const row = (id: number, composition: number[], enthalpy: number) => normalizeStructure({
  id, composition, enthalpy, enthalpyTotal: enthalpy * composition.reduce((a, b) => a + b, 0),
  hullX: [composition[1] / composition.reduce((a, b) => a + b, 0)], fitness: Number.NaN,
});
const project = (structures = [row(1, [1, 0], -2), row(2, [0, 1], -1)]): ProjectFile => ({
  version: '1.0.0', projectId: 'review', projectName: 'review', created: '', lastModified: '', systemInfo: info, structures,
});
const header = 'generation number num_atoms_all energy cell_volume e_above_hull';
function poscar(id: number, counts: number[], elements = ['Ti', 'H']): string {
  return [`number=${id}`, '1.0', '3 0 0', '0 3 0', '0 0 3', elements.join(' '), counts.join(' '), 'Direct',
    ...Array.from({ length: counts.reduce((a, b) => a + b, 0) }, () => '0 0 0')].join('\n');
}
let defects = 0, passed = 0;
async function probe(name: string, run: () => void | Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) {
    if (!(error instanceof assert.AssertionError)) throw error;
    defects++; console.log(`DEFECT ${name}\n${error.message}`);
  }
}

await probe('B1: fixed TiH ranking must work without elemental reference phases', async () => {
  const contents = new Map<USPEXFileType, string>([
    ['individuals', 'generation number num_atoms_all energy cell_volume\n1 1 [1,1] -4 20\n1 2 [1,1] -3 20'],
    ['gathered_poscars', poscar(1, [1, 1]) + '\n' + poscar(2, [1, 1])],
  ]);
  const parsed = await parseAllFiles([], contents);
  assert.equal(parsed.systemInfo.compositionMode, 'fixed');
  console.log('  relative energies:', parsed.structures.map(s => [s.fitness, s.eHullRecons]));
  assert.deepEqual(parsed.structures.map(s => s.fitness), [0, 0.5]);
});

await probe('B2: main ternary reconstruction must preserve the Ti-H boundary hull', () => {
  const rows = [row(1, [1, 0, 0], -2), row(2, [0, 1, 0], -1), row(3, [1, 1, 0], -2.5), row(4, [1, 1, 0], -2)];
  const result = reconstructHullStructures(rows, 'ternary', 'varcomp', ['Ti', 'H', 'Li']);
  console.log('  main ternary distances:', result.structures.map(s => s.eHullRecons));
  assert.deepEqual(result.structures.map(s => s.eHullRecons), [0, 0, 0, 0.5]);
});

await probe('B3: USPEX25 nan energy and hull distance must remain unavailable', async () => {
  const parsed = await parseAllFiles([], new Map<USPEXFileType, string>([
    ['individuals', header + '\n1 1 [1,0] -2 20 0\n1 2 [0,1] -1 20 0\n1 3 [1,1] nan 20 nan'],
    ['gathered_poscars', [poscar(1, [1, 0]), poscar(2, [0, 1]), poscar(3, [1, 1])].join('\n')],
  ]));
  const failed = parsed.structures.find(s => s.id === 3)!;
  console.log('  failed row:', { total: failed.enthalpyTotal, fitness: failed.fitness, eForm: failed.eForm, eHull: failed.eHullRecons });
  assert.ok(!Number.isFinite(failed.enthalpyTotal) && failed.fitness !== 0, 'nan/nan became a finite-energy stable phase');
});

await probe('B4: duplicate IDs must be rejected before annotations can hit multiple structures', async () => {
  const duplicate = project([row(1, [1, 0], -2), row(1, [0, 1], -1)]);
  let rejected = false;
  try { await useProjectStore.getState().loadProjectFile(duplicate); } catch { rejected = true; }
  if (!rejected) {
    useProjectStore.getState().updateStructureNotes(1, 'single target');
    console.log('  annotated rows:', useProjectStore.getState().structures.filter(s => s.notes === 'single target').length);
  }
  assert.ok(rejected, 'duplicate IDs are accepted and both rows receive one annotation');
});

await probe('B5: Individuals/POSCAR composition mismatch must not silently merge', async () => {
  const parsed = await parseAllFiles([], new Map<USPEXFileType, string>([
    ['individuals', header + '\n1 1 [1,1] -8 20 0'],
    ['gathered_poscars', poscar(1, [1, 3])],
  ]));
  const s = parsed.structures[0];
  console.log('  merged formula/composition/geometry:', s.formula, s.composition, s.poscarData);
  console.log('  warnings:', parsed.warnings);
  assert.ok(parsed.warnings.some(w => /EA1.*composition mismatch/.test(w)));
  assert.equal(s.poscarData, undefined, 'conflicting geometry must not reach the viewer or seeds export');
  assert.equal(s.latticeParams, undefined);
  assert.equal(s.formula, 'TiH');
  assert.equal(s.enthalpyTotal, -8);
});

await probe('B6: a JSON structure with no energy must not become a valid zero-energy sample', async () => {
  const input = { ...project(), structures: [{ id: 3, composition: [1, 1], fitness: 0 }] };
  validateProject(input);
  await useProjectStore.getState().loadProjectFile(input);
  const s = useProjectStore.getState().structures[0];
  console.log('  energy-free JSON:', s.enthalpy, s.enthalpyTotal, validPlotStructure(s, [{ accessor: r => r.enthalpy }]));
  assert.ok(!validPlotStructure(s, [{ accessor: r => r.enthalpy }]), 'missing energy is fabricated as 0 eV and treated as converged');
});

await probe('B7: missing volume must survive JSON export/import as missing', async () => {
  const original = project([normalizeStructure({ ...row(1, [1, 0], -2), volume: Number.NaN, volumeTotal: Number.NaN })]);
  const serialized = JSON.parse(JSON.stringify(original));
  await useProjectStore.getState().loadProjectFile(serialized);
  const s = useProjectStore.getState().structures[0];
  console.log('  round-trip volume:', s.volume, s.volumeTotal);
  assert.ok(Number.isNaN(s.volume) && Number.isNaN(s.volumeTotal), 'unknown volume became a measured zero');
});

await probe('B8: an imported formula must not become executable HTML', async () => {
  const payload = '<img src=x onerror="window.__reviewMarker=true">';
  const input = project([normalizeStructure({ ...row(1, [1, 0], -2), formula: payload })]);
  validateProject(input);
  await useProjectStore.getState().loadProjectFile(input);
  const markup = renderToStaticMarkup(createElement(FormulaDisplay, { formula: useProjectStore.getState().structures[0].formula }));
  console.log('  rendered formula:', markup);
  assert.ok(!markup.includes('<img') && markup.includes('&lt;img'), 'formula must be escaped visible text');
});

await probe('control: workshop fixed ranking does not require pure references', () => {
  const result = computeWorkshopGeometricHull([row(1, [1, 1], -2), row(2, [1, 1], -1.5)], { ...info, compositionMode: 'fixed' });
  assert.deepEqual(result.structures.map(s => s.fitness), [0, 0.5]);
});
await probe('control: workshop ternary boundary has the correct distances', () => {
  const result = computeWorkshopGeometricHull([row(1, [1, 0, 0], -2), row(2, [0, 1, 0], -1), row(3, [1, 1, 0], -2.5), row(4, [1, 1, 0], -2)],
    { ...info, elements: ['Ti', 'H', 'Li'], systemType: 'ternary' });
  assert.deepEqual(result.structures.map(s => s.fitness), [0, 0, 0, 0.5]);
});
await probe('control: ordinary binary reconstruction matches analytical distances', () => {
  const result = reconstructHullStructures([row(1, [1, 0], -2), row(2, [0, 1], -1), row(3, [1, 1], -2.5), row(4, [1, 1], -2)], 'binary', 'varcomp', info.elements);
  assert.deepEqual(result.structures.map(s => s.eHullRecons), [0, 0, 0, 0.5]);
});

await probe('fixed relative energies preserve cell scaling, reference availability and measured fitness', () => {
  const result = reconstructHullStructures([row(1, [1, 1], -2), row(2, [2, 2], -1.5)], 'binary', 'fixed', info.elements);
  assert.deepEqual(result.structures.map(s => s.eHullRecons), [0, 0.5]);
  assert.ok(result.structures.every(s => Number.isNaN(s.eForm)));
  for (const s of result.structures) {
    assert.equal(formationEnergy(s), null);
    assert.equal(getStructureFieldValue(s, 'eForm'), undefined);
    const restored = normalizeStructure(JSON.parse(JSON.stringify(s)));
    assert.ok(Number.isNaN(restored.eForm));
    assert.equal(restored.eHullRecons, s.eHullRecons);
    assert.equal(formationEnergy(restored), null);
  }
  const known = reconstructHullStructures([{ ...row(1, [1, 1], -2), fitness: 0.125 }], 'binary', 'fixed', info.elements);
  assert.equal(known.structures[0].fitness, 0.125);
  assert.equal(known.structures[0].eHullRecons, 0);
});
await probe('main ternary reconstruction handles all three binary edges', () => {
  for (const absent of [0, 1, 2]) {
    const present = [0, 1, 2].filter(i => i !== absent);
    const composition = (a: number, b: number) => {
      const c = [0, 0, 0]; c[present[0]] = a; c[present[1]] = b; return c;
    };
    const result = reconstructHullStructures([row(1, composition(1, 0), -2), row(2, composition(0, 1), -1),
      row(3, composition(1, 1), -2.5), row(4, composition(1, 1), -2)], 'ternary', 'varcomp', ['Ti', 'H', 'Li']);
    assert.deepEqual(result.structures.map(s => s.eHullRecons), [0, 0, 0, 0.5]);
  }
});
await probe('USPEX25 parsing keeps true zeros and preserves absent/nonfinite scientific values', () => {
  const parsed = parseIndividuals(header + '\n1 1 [1,1] 0 0 0\n1 2 [1,1] None nan nan');
  assert.equal(parsed.data[0].enthalpy, 0); assert.equal(parsed.data[0].volume, 0); assert.equal(parsed.data[0].indFitness, 0);
  assert.ok(Number.isNaN(parsed.data[1].enthalpy)); assert.ok(Number.isNaN(parsed.data[1].volume)); assert.ok(Number.isNaN(parsed.data[1].indFitness));
  const missing = parseIndividuals('generation number num_atoms_all energy\n1 1 [1,1] -4');
  assert.ok(Number.isNaN(missing.data[0].indFitness));
  const hull = parseExtendedConvexHull(header + '\n1 1 [1,1] nan nan nan\n1 2 [1,1] 0 0 0');
  assert.ok(Number.isNaN(hull[0].enthalpy)); assert.ok(Number.isNaN(hull[0].fitness));
  assert.equal(hull[1].enthalpy, 0); assert.equal(hull[1].fitness, 0);
});
await probe('valid energy with unknown USPEX25 Ed is reconstructed', async () => {
  const parsed = await parseAllFiles([], new Map<USPEXFileType, string>([
    ['individuals', header + '\n1 1 [1,0] -2 20 0\n1 2 [0,1] -1 20 0\n1 3 [1,1] -5 20 nan'],
    ['gathered_poscars', [poscar(1, [1, 0]), poscar(2, [0, 1]), poscar(3, [1, 1])].join('\n')],
  ]));
  assert.equal(parsed.structures[2].fitness, 0);
  assert.equal(parsed.structures[2].enthalpyTotal, -5);
});
await probe('cross-list duplicate IDs reject atomically and keep the active project', async () => {
  await useProjectStore.getState().loadProjectFile(project());
  const before = useProjectStore.getState().structures;
  const invalid = { ...project(), projectId: 'invalid', userAddedStructures: [row(1, [1, 1], -2)] };
  await assert.rejects(useProjectStore.getState().loadProjectFile(invalid), /Duplicate structure ID/);
  assert.equal(useProjectStore.getState().structures, before);
  assert.equal(useProjectStore.getState().projectId, 'review');
  assert.equal(useProjectStore.getState().isLoading, false);
});
await probe('matching/reordered POSCAR species and absent zero-count species remain usable', async () => {
  const parameters = '% atomType\nTi H\n% EndAtomType\n';
  const parsed = await parseAllFiles([], new Map<USPEXFileType, string>([
    ['parameters', parameters],
    ['individuals', header + '\n1 1 [1,3] -8 20 0\n1 2 [1,0] -2 20 0'],
    ['gathered_poscars', poscar(1, [3, 1], ['H', 'Ti']) + '\n' + poscar(2, [1], ['Ti'])],
  ]));
  assert.ok(parsed.structures.every(s => s.poscarData));
  assert.ok(!parsed.warnings.some(w => w.includes('composition mismatch')));
  assert.deepEqual(parseGatheredPoscars(parsed.structures[0].poscarData!).get(1)!.atomCounts, [3, 1]);
  assert.equal(parseGatheredPoscars(poscar(1, [0, 1])).get(1)!.formula, 'H');
});
await probe('normalization preserves explicit zero, explicit null, and total-only energy', () => {
  const zero = normalizeStructure({ id: 1, composition: [1, 1], enthalpy: 0, volume: 0, volumeTotal: 0 });
  assert.equal(zero.enthalpyTotal, 0); assert.equal(zero.volume, 0); assert.equal(zero.volumeTotal, 0);
  const totalOnly = normalizeStructure({ id: 1, composition: [1, 3], enthalpyTotal: -12 });
  assert.equal(totalOnly.enthalpy, -3); assert.equal(totalOnly.enthalpyTotal, -12);
  const missing = normalizeStructure(JSON.parse('{"id":1,"composition":[1,1],"enthalpy":null,"enthalpyTotal":null,"volume":null,"volumeTotal":null}'));
  assert.ok(Number.isNaN(missing.enthalpyTotal)); assert.ok(Number.isNaN(missing.volume));
});
await probe('chemical subscripts and chart line breaks survive HTML escaping', () => {
  assert.equal(formulaToHtml('Ti2H11'), 'Ti<sub>2</sub>H<sub>11</sub>');
  assert.equal(formulaToHtml('Ti&H<oxide>'), 'Ti&amp;H&lt;oxide&gt;');
  assert.equal(formulaToHtml("Ti'2"), 'Ti&#39;<sub>2</sub>');
  const label = 'EA1: ' + formulaToHtml('Ti2H11') + '<br>Origin: Random';
  assert.equal(safePlotHtml(label), label);
  assert.ok(!safePlotHtml('<svg onload="alert()"><img src=x onerror="alert()">').includes('<svg'));
});
await probe('production ECharts tooltip protects formula, group, origin and fallback text', () => {
  const option = adaptToECharts([{ type: 'scatter', x: [0], y: [0],
    text: ['Ti<sub>2</sub>H<br>Group: <img src=x onerror="alert()">'] }], {}, {});
  const tooltip = option.option.tooltip as { formatter: (p: unknown) => string };
  const result = tooltip.formatter({ data: { __text: 'Ti<sub>2</sub>H<br>Origin: <img src=x onerror="alert()">' } });
  assert.ok(result.includes('<sub>2</sub>') && result.includes('<br>'));
  assert.ok(!result.includes('<img'));
  assert.ok(!tooltip.formatter({ seriesName: '<svg onload="alert()">', value: 1 }).includes('<svg'));
});
for (const name of ['uspex_20260918_103502', 'uspex_20260926_161206', 'uspex_20260926_230011']) {
  await probe(`real archive ${name}: original geometry, finite energies and USPEX fitness survive`, async () => {
    const bytes = readFileSync(`test/${name}.tar.gz`);
    const entries = await extractArchive(new File([bytes], `${name}.tar.gz`));
    const contents = new Map<USPEXFileType, string>();
    for (const file of entriesToFiles(entries)) {
      const text = await file.text(); const detected = detectFileType(file, text);
      if (detected.type !== 'unknown') contents.set(detected.type, text);
    }
    const result = await parseAllFiles([], contents);
    const geometry = parseGatheredPoscars(contents.get('gathered_poscars')!);
    const individuals = new Map(parseIndividuals(contents.get('individuals')!).data.map(s => [s.id, s]));
    const hull = new Map(parseExtendedConvexHull(contents.get('extended_convex_hull') ?? '').map(s => [s.id, s]));
    assert.ok(result.structures.length > 0);
    assert.ok(!result.warnings.some(w => w.includes('composition mismatch')), result.warnings.join('\n'));
    let matched = 0;
    for (const s of result.structures) {
      const original = geometry.get(s.id);
      if (original) { assert.equal(s.poscarData, original.poscarText); matched++; }
      const ind = individuals.get(s.id);
      if (ind && Number.isFinite(ind.enthalpy)) assert.equal(s.enthalpyTotal, ind.enthalpy);
      const h = hull.get(s.id);
      if (h && h.fitness >= 0 && Number.isFinite(s.enthalpyTotal)) assert.equal(s.fitness, h.fitness);
    }
    assert.ok(matched > 0);
    const exported = JSON.parse(JSON.stringify(project(result.structures)));
    exported.systemInfo = result.systemInfo;
    validateProject(exported);
    console.log('  structures/retained geometries:', result.structures.length, matched);
  });
}
console.log(`\n${defects} defect(s) reproduced; ${passed} invariant(s) passed.`);
if (defects) process.exitCode = 1;
