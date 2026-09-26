import './persistenceShim';

import { useChartSettingsStore } from '@/store/useChartSettingsStore';
import { useCompareStore } from '@/store/useCompareStore';
import { useMarkStore } from '@/store/useMarkStore';
import { useProjectStore } from '@/store/useProjectStore';
import type { ProjectFile, SystemInfo } from '@/types/structure';

/**
 * Persistence invariants: a project's presentation state must stay with that
 * project.  Explorer axis titles/ranges live in the project file; selections
 * that reference structure ids, tag ids, front indices or data-space points are
 * dropped when a different project becomes active.
 */

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}`);
  }
}

const systemInfo = {
  compositionMode: 'varcomp',
  elements: ['Li', 'Y', 'Cl'],
  optimizationType: 'single',
} as unknown as SystemInfo;

function project(
  id: string,
  axisLabels: Record<string, string> = {},
  axisRanges: Record<string, { min: string; max: string }> = {},
): ProjectFile {
  return {
    version: '1.0.0',
    projectId: id,
    projectName: id,
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    systemInfo,
    structures: [],
    userAddedStructures: [],
    tags: [],
    filterPresets: [],
    hullGenerations: [],
    explorerAxisLabels: axisLabels,
    explorerAxisRanges: axisRanges,
  };
}

console.log('\nPer-project persistence invariants');

// 鈹€鈹€ Rehydration of a v1 session 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const hydrated = useChartSettingsStore.getState();
check('persisted settings rehydrate', hydrated.explorerXKey === 'enthalpy' && hydrated.explorerDimension === '3d');
check('v1 axis titles/ranges are dropped by the v2 migration',
  !('explorerAxisLabels' in hydrated) && !('explorerAxisRanges' in hydrated));
check('unrelated settings survive the v2 migration',
  useChartSettingsStore.getState().betaRefMode === 'manual');
check('seeded selections rehydrate',
  useCompareStore.getState().compareIds.length === 2
  && useMarkStore.getState().markActiveTags.length === 1
  && useChartSettingsStore.getState().paretoSelectedFronts.length === 2);

// 鈹€鈹€ Restoring the active project keeps its selections 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const projectA = project('P-A', { enthalpy: 'Enthalpy of A' }, { enthalpy: { min: '1', max: '9' } });
await useProjectStore.getState().loadProjectFile(projectA, { preserveFilters: true });

check('project axis titles/ranges load from the project file',
  useProjectStore.getState().explorerAxisLabels['enthalpy'] === 'Enthalpy of A'
  && useProjectStore.getState().explorerAxisRanges['enthalpy'].max === '9');
check('reloading the same project keeps compare/mark/front selections',
  useCompareStore.getState().compareIds.length === 2
  && useMarkStore.getState().markActiveTags.length === 1
  && useChartSettingsStore.getState().paretoSelectedFronts.length === 2
  && useChartSettingsStore.getState().betaRefX === 123);

// 鈹€鈹€ Switching project drops everything project-scoped 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
await useProjectStore.getState().loadProjectFile(project('P-B', { enthalpy: 'MgO-HfO2 enthalpy' }, { enthalpy: { min: '-2', max: '0' } }));

check('axis titles/ranges of the new project replace the old ones',
  useProjectStore.getState().explorerAxisLabels['enthalpy'] === 'MgO-HfO2 enthalpy'
  && useProjectStore.getState().explorerAxisRanges['enthalpy'].min === '-2');
check('compare ids are cleared on project switch', useCompareStore.getState().compareIds.length === 0);
check('marks are cleared on project switch',
  useMarkStore.getState().markActiveTags.length === 0 && useMarkStore.getState().markEaInput === '');
check('pareto front selection is cleared on project switch',
  useChartSettingsStore.getState().paretoSelectedFronts.length === 0);
check('manual beta reference point is cleared on project switch',
  useChartSettingsStore.getState().betaRefX === null && useChartSettingsStore.getState().betaRefY === null);
check('display preferences are not cleared on project switch',
  useChartSettingsStore.getState().betaRefMode === 'manual'
  && useChartSettingsStore.getState().explorerDimension === '3d');

// 鈹€鈹€ Round trip: axis settings travel with the exported project 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
await useProjectStore.getState().loadProjectFile(projectA);
useProjectStore.getState().setExplorerAxisLabel('fitness', 'Distance to hull');
useProjectStore.getState().setExplorerAxisRange('fitness', { min: '0', max: '0.5' });
useProjectStore.getState().setExplorerAxisLabel('enthalpy', '');

const exported = useProjectStore.getState().exportProjectFile();
check('export carries axis titles and ranges',
  exported.explorerAxisLabels?.fitness === 'Distance to hull'
  && exported.explorerAxisRanges?.fitness.max === '0.5');
check('clearing a title removes it from the export', !('enthalpy' in (exported.explorerAxisLabels ?? {})));

useProjectStore.setState({ explorerAxisLabels: {}, explorerAxisRanges: {} });
await useProjectStore.getState().loadProjectFile(exported);
check('re-imported project restores its axis titles',
  useProjectStore.getState().explorerAxisLabels['fitness'] === 'Distance to hull');

// 鈹€鈹€ A project file predating the axis fields leaks nothing 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const legacy = project('P-C');
delete legacy.explorerAxisLabels;
delete legacy.explorerAxisRanges;
await useProjectStore.getState().loadProjectFile(legacy);
check('legacy project file starts with empty axis settings',
  Object.keys(useProjectStore.getState().explorerAxisLabels).length === 0
  && Object.keys(useProjectStore.getState().explorerAxisRanges).length === 0);

console.log(`\n${passed} persistence checks passed.`);
if (failures.length > 0) throw new Error(`Persistence checks failed: ${failures.join(', ')}`);
