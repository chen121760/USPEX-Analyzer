import './persistenceShim';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as React from 'react';
import ts from 'typescript';
import { fitnessValue } from '@/domain/structure/fitness';
import { normalizeStructure } from '@/domain/structure/normalizeStructure';
import { getStructureFieldValue, numericStructureFieldValue } from '@/domain/structure/dynamicFields';
import { applyCondition, toSortableNumber } from '@/modules/Filter/filterLogic';
import { buildStructureCsvHeaders, buildStructureCsvRows } from '@/export/csvExport';
import { buildExportFilename } from '@/export/poscarExport';
import { buildWorkshopCsvExport, structureToWorkshopJson, workshopJsonToStructure } from '@/export/workshopExport';
import type { SystemInfo } from '@/types/structure';

let passed = 0;
function check(name: string, body: () => void): void {
  body(); passed++; console.log(`  ok   ${name}`);
}

const objective = normalizeStructure({ id: 1, composition: [2], enthalpyTotal: -6,
  fitness: -1, fitnessKind: 'objective', eHullRecons: 0 });
const systemInfo = { elements: ['Si'], compositionMode: 'fixed', systemType: 'unary' } as SystemInfo;

console.log('\nSigned original Fitness invariants');
check('a fixed-composition objective preserves a genuine minus one and other signed values', () => {
  for (const value of [-12.5, -1, 0, 1001]) {
    const structure = normalizeStructure({ ...objective, fitness: value });
    assert.equal(structure.fitness, value);
    assert.equal(structure.fitnessKind, 'objective');
    assert.equal(fitnessValue(structure), value);
    assert.equal(getStructureFieldValue(structure, 'fitness'), value);
    assert.equal(numericStructureFieldValue(structure, 'fitness'), value);
  }
  assert.equal(normalizeStructure({ ...objective, enthalpyTotal: NaN }).fitness, -1);
});
check('missing and non-finite objective Fitness stays missing across filters and exports', () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
    const structure = normalizeStructure({ ...objective, fitness: value } as never);
    assert.ok(Number.isNaN(structure.fitness));
    assert.equal(fitnessValue(structure), undefined);
    assert.equal(buildStructureCsvRows([structure])[0].Fitness, '');
    for (const operator of ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'] as const)
      assert.equal(applyCondition(structure, { kind: 'numeric', field: 'fitness', operator, value: -1 }, []), false);
    assert.equal(toSortableNumber(getStructureFieldValue(structure, 'fitness')), Infinity);
  }
});
check('distance and legacy Fitness still treat negative sentinels as missing', () => {
  for (const fitnessKind of ['distance', undefined] as const) {
    for (const value of [-12.5, -1]) {
      const raw = { ...objective, fitness: value, fitnessKind };
      assert.equal(fitnessValue(raw), undefined);
      assert.ok(Number.isNaN(normalizeStructure(raw).fitness));
      assert.equal(buildStructureCsvRows([raw])[0].Fitness_eV_block, '');
    }
    assert.equal(normalizeStructure({ ...objective, fitness: 0, fitnessKind }).fitness, 0);
  }
});
check('signed Fitness can be filtered and sorted as real data', () => {
  assert.equal(applyCondition(objective, { kind: 'numeric', field: 'fitness', operator: 'eq', value: -1 }, []), true);
  assert.equal(applyCondition(objective, { kind: 'numeric', field: 'fitness', operator: 'lt', value: 0 }, []), true);
  assert.equal(applyCondition(objective, { kind: 'numeric', field: 'fitness', operator: 'neq', value: 0 }, []), true);
  assert.equal(toSortableNumber(getStructureFieldValue(objective, 'fitness')), -1);
});
check('the real DataTable cell displays a signed objective without applying hull-zero styling', () => {
  const source = readFileSync('src/modules/DataTable/DataTablePage.tsx', 'utf8');
  const ast = ts.createSourceFile('DataTablePage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node) && node.properties.some((property) =>
      ts.isPropertyAssignment(property) && property.name.getText(ast) === 'id'
      && ts.isStringLiteral(property.initializer) && property.initializer.text === 'fitness')) {
      const cell = node.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(ast) === 'cell');
      if (cell && ts.isPropertyAssignment(cell)) expression = cell.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(expression);
  const js = ts.transpileModule(`const extracted = (${expression.getText(ast)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const cell = new Function('React', `${js}\nreturn extracted;`)(React);
  const rendered = cell({ getValue: () => fitnessValue(objective), row: { original: objective } });
  assert.equal(rendered.props.children, '-1.0000');
  const zero = cell({ getValue: () => 0, row: { original: objective } });
  assert.equal(zero.props.style.color, undefined);
  assert.equal(cell({ getValue: () => undefined, row: { original: objective } }), '—');
});
check('CSV and POSCAR names include genuine signed Fitness', () => {
  assert.equal(buildStructureCsvRows([objective])[0].Fitness, -1);
  assert.ok(buildWorkshopCsvExport(systemInfo, [objective]).content.includes(',-1,0'));
  assert.equal(buildExportFilename(0, objective, [4], 3), 'Fitness-1.0000.vasp');
  assert.equal(buildExportFilename(0, { ...objective, fitness: NaN }, [4], 3), 'FitnessNA.vasp');
  assert.equal(buildExportFilename(0, objective, [2], 3, 'Obj', [{ field: 'fitness', label: 'Fitness' }]), 'EA1-Fitness-1.vasp');
  assert.equal(buildExportFilename(0, { ...objective, fitness: Infinity }, [2], 3, 'Obj', [{ field: 'fitness', label: 'Fitness' }]), 'EA1.vasp');
});
check('CSV Fitness headers follow objective semantics and match every exported row', () => {
  const distance = { ...objective, id: 2, fitness: 0.5, fitnessKind: 'distance' as const };
  for (const rows of [[objective], [distance, objective], [distance]]) {
    const headers = buildStructureCsvHeaders(rows);
    const fitnessHeader = rows.some(s => s.fitnessKind === 'objective') ? 'Fitness' : 'Fitness_eV_block';
    assert.ok(headers.includes(fitnessHeader));
    assert.equal(headers.filter(header => header.startsWith('Fitness')).length, 1);
    const data = buildStructureCsvRows(rows);
    for (let index = 0; index < data.length; index++) assert.equal(data[index][fitnessHeader], rows[index].fitness);
  }
  for (const mode of ['fixed', 'varcomp'] as const) {
    for (const rows of [[objective], [distance, objective], [distance]]) {
      const info = { ...systemInfo, elements: ['Si', 'H'], systemType: 'binary' as const, compositionMode: mode };
      const csv = buildWorkshopCsvExport(info, rows).content;
      const lines = csv.split('\r\n');
      const headerIndex = lines.findIndex(line => line.startsWith('Group,'));
      const header = lines[headerIndex].split(',');
      const fitnessHeader = mode === 'fixed' || rows.some(s => s.fitnessKind === 'objective') ? 'Fitness' : 'Fitness(eV/block)';
      const column = header.indexOf(fitnessHeader);
      assert.ok(column >= 0);
      assert.equal(header.filter(name => name.startsWith('Fitness')).length, 1);
      const data = lines.slice(headerIndex + 1).filter(Boolean);
      assert.deepEqual(data.map(line => Number(line.split(',')[column])), rows.map(s => s.fitness));
    }
  }
});
check('project and workshop JSON preserve the objective marker and genuine minus one', () => {
  const saved = JSON.parse(JSON.stringify(objective));
  assert.equal(normalizeStructure(saved).fitness, -1);
  const archive = JSON.parse(JSON.stringify(structureToWorkshopJson(objective)));
  assert.equal(archive.fitnessKind, 'objective');
  const restored = workshopJsonToStructure(archive);
  assert.equal(restored.fitnessKind, 'objective');
  assert.equal(restored.fitness, -1);
  assert.equal(getStructureFieldValue(restored, 'fitness'), -1);
  const missing = JSON.parse(JSON.stringify(structureToWorkshopJson({ ...objective, fitness: NaN })));
  assert.equal(missing.fitness, null);
  assert.ok(Number.isNaN(workshopJsonToStructure(missing).fitness));
});

console.log(`PASS: ${passed} signed Fitness checks`);
