import { canImportWorkshopStructure, hullDisplayStructures } from '@/domain/hull/displayMetric';
import { HullMetricContext } from '@/modules/ConvexHull/HullMetricContext';
import { prepareWorkshopGroups, remapWorkshopStructure } from '@/domain/hull/workshopCompatibility';
/**
 * Hull Workshop (凸包工作台) — main page.
 *
 * Supports multiple named data groups imported from the current project or
 * from external CSV files.  Computes a pure-geometric convex hull on the
 * merged visible groups, and passes group metadata to chart components
 * for hover tooltips and CSV export.
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useWorkshopStore } from '@/store/useWorkshopStore';
import { useUIStore } from '@/store/useUIStore';
import type { Structure, SystemInfo } from '@/types/structure';
import { BinaryHullPlot } from '@/modules/ConvexHull/BinaryHullPlot';
import { TernaryHullPlot } from '@/modules/ConvexHull/TernaryHullPlot';
import { EnergyRankingChart } from '@/modules/ConvexHull/EnergyRankingChart';
import { computeWorkshopGeometricHull } from '@/domain/hull/workshopHull';
import { downloadWorkshopCsv, downloadWorkshopJson, workshopJsonToStructure } from '@/export/workshopExport';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import type { WorkshopGroup, WorkshopJsonExport } from './types';
import { GROUP_COLORS, defaultGroupName } from './types';
import { manualWorkshopStructure } from '@/domain/hull/manualWorkshopStructure';
import type { ManualStructureData } from './components/AddStructureModal';
import { WorkshopContent } from './components/WorkshopContent';

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export function HullWorkshopPage() {
  const { t } = useTranslation();

  // Per-project workshop state (persisted in localStorage, cleared on project switch)
  const groups = useWorkshopStore((s) => s.groups);
  // Use individual selectors – actions have stable references (no new object each render)
  const addGroup = useWorkshopStore((s) => s.addGroup);
  const removeGroup = useWorkshopStore((s) => s.removeGroup);
  const renameGroup = useWorkshopStore((s) => s.renameGroup);
  const toggleGroupVisibility = useWorkshopStore((s) => s.toggleGroupVisibility);

  const projectSystemInfo = useProjectStore(s => s.systemInfo);
  const workshopContext = groups[0]?.systemInfo ?? projectSystemInfo;

  const hasData = groups.some((g) => g.visible && g.structures.length > 0);

  /* ── Derived: visible groups ── */
  const visibleGroups = useMemo(
    () => groups.filter((g) => g.visible && g.structures.length > 0),
    [groups],
  );

  /* ── Derived: merged system info from visible groups ── */
  const mergedSystemInfo = useMemo<SystemInfo | null>(() => {
    if (visibleGroups.length === 0) return null;

    // Composition mode: varcomp if ANY visible group is varcomp
    const hasVarcomp = visibleGroups.some(
      (g) => g.systemInfo.compositionMode !== 'fixed',
    );
    const compositionMode: SystemInfo['compositionMode'] =
      hasVarcomp ? 'varcomp' : 'fixed';

    // System type: highest dimension (ternary > binary > unary)
    const typeRank = { unary: 0, binary: 1, ternary: 2, quaternary: 3 } as const;
    let best = visibleGroups[0].systemInfo;
    for (const g of visibleGroups) {
      if (typeRank[g.systemInfo.systemType] > typeRank[best.systemType]) {
        best = g.systemInfo;
      }
    }

    return { ...best, compositionMode, referenceInfo: undefined };
  }, [visibleGroups]);

  /* ── Derived: merged structures with groupName attached ── */
  const mergedStructuresWithGroup = useMemo(() => {
    const result: (Structure & { groupName: string; _mergeSeq: number })[] = [];
    let seq = 0;
    for (const g of visibleGroups) {
      for (const s of g.structures) {
        result.push({ ...remapWorkshopStructure(s, g.systemInfo, mergedSystemInfo!), groupName: g.name, groupColor: g.color, _mergeSeq: seq++ });
      }
    }
    return result;
  }, [visibleGroups, mergedSystemInfo]);

  /* ── Derived: geometric hull on merged structures ── */
  const hullResult = useMemo(() => {
    if (!mergedSystemInfo || mergedStructuresWithGroup.length === 0) return null;
    return computeWorkshopGeometricHull(mergedStructuresWithGroup, mergedSystemInfo);
  }, [mergedStructuresWithGroup, mergedSystemInfo]);

  /* ── Action: import from current project ── */
  const handleImportFromProject = useCallback(() => {
    const state = useProjectStore.getState();
    const { structures, systemInfo } = state;
    if (structures.length === 0 || !systemInfo) return;

    const chartStructures = structures.filter(
      canImportWorkshopStructure,
    );

    if (chartStructures.length === 0) {
      alert(t('workshop.noProjectData'));
      return;
    }

    const name = defaultGroupName(state.projectName, systemInfo.elements ?? []);

    const group: WorkshopGroup = {
      id: crypto.randomUUID(),
      name,
      structures: chartStructures.map((s) => ({ ...s })),
      systemInfo: { ...systemInfo },
      visible: true,
      color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
      importSource: 'project',
    };
    try {
      for (const prepared of prepareWorkshopGroups([group], workshopContext)) addGroup(prepared);
    } catch (error) { alert(error instanceof Error ? error.message : String(error)); }
  }, [groups.length, addGroup, t, workshopContext]);

  /* ── Action: toggle group visibility ── */
  const handleToggleVisibility = useCallback(
    (groupId: string) => toggleGroupVisibility(groupId),
    [toggleGroupVisibility],
  );

  /* ── Action: remove group ── */
  const handleRemoveGroup = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      const confirmed = window.confirm(
        t('workshop.confirmRemoveGroup', 'Remove group "{{name}}" and all its structures?', {
          name: group.name,
        }),
      );
      if (!confirmed) return;
      removeGroup(groupId);
    },
    [groups, removeGroup, t],
  );

  /* ── Action: rename group ── */
  const handleRenameGroup = useCallback(
    (groupId: string, name: string) => renameGroup(groupId, name),
    [renameGroup],
  );

  /* ── Action: import from a saved project ── */
  const handleImportFromSaved = useCallback(
    (newGroups: WorkshopGroup[]) => {
      for (const g of prepareWorkshopGroups(newGroups, workshopContext)) addGroup(g);
    },
    [addGroup, workshopContext],
  );

  /* ── Action: export merged data as workshop CSV (with Group column + metadata) ── */
  const handleExport = useCallback(() => {
    if (!hullResult || !mergedSystemInfo) return;
    downloadWorkshopCsv(
      mergedSystemInfo,
      hullResult.structures as (Structure & { groupName?: string })[],
    );
  }, [hullResult, mergedSystemInfo]);

  /* ── Action: export merged data as workshop JSON (full structure data) ── */
  const handleExportJson = useCallback(() => {
    if (!mergedSystemInfo) return;
    downloadWorkshopJson(mergedSystemInfo, visibleGroups);
  }, [mergedSystemInfo, visibleGroups]);

  /* ── Action: upload & parse JSON ── */
  const handleUploadJson = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const archive: WorkshopJsonExport = JSON.parse(text.replace(/^\uFEFF/, ''));

        if (archive.type !== 'uspex-workshop' || archive.version !== 1 || !Array.isArray(archive.groups)) {
          alert(
            t('workshop.invalidJsonFormat', 'Invalid JSON format: {{detail}}', {
              detail: 'Not a valid workshop JSON file (missing or wrong type field)',
            }),
          );
          return;
        }

        const newGroups: WorkshopGroup[] = archive.groups.map((jg, gi) => ({
          id: crypto.randomUUID(),
          name: jg.name,
          structures: jg.structures.map((js) => workshopJsonToStructure(js)),
          systemInfo: {
            elements: archive.systemInfo.elements,
            componentLabels: archive.systemInfo.componentLabels,
            compositionBasis: archive.systemInfo.compositionBasis,
            systemType: archive.systemInfo.systemType,
            compositionMode: archive.systemInfo.compositionMode,
            externalPressure: archive.systemInfo.externalPressure,
            optimizationType: 'single',
            totalStructures: jg.structures.length,
            totalGenerations: 0,
            minEnthalpy: 0,
            calculationType: 0,
          } as SystemInfo,
          visible: true,
          color: jg.color || GROUP_COLORS[(groups.length + gi) % GROUP_COLORS.length],
          importSource: 'json' as const,
        }));

        for (const g of prepareWorkshopGroups(newGroups, workshopContext)) {
          addGroup(g);
        }
      } catch (err: unknown) {
        alert(
          t('workshop.invalidJsonFormat', 'Invalid JSON format: {{detail}}', {
            detail: err instanceof Error ? err.message : 'Unknown error',
          }),
        );
      }
    },
    [groups.length, addGroup, t, workshopContext],
  );

  /* ── Action: add manual structure ── */
  const handleAddManual = useCallback(
    (data: ManualStructureData) => {
      const sysInfo = mergedSystemInfo ?? workshopContext;
      if (!sysInfo) return;
      const wsElements = sysInfo.elements;
      const structure = manualWorkshopStructure(data, sysInfo,
        Math.max(0, ...groups.flatMap(g => g.structures.map(s => s.id))) + 1);

      // Find or create "User Added" group
      const existing = groups.find((g) => g.importSource === 'manual');
      if (existing) {
        // Add to existing manual group
        const updated: WorkshopGroup = {
          ...existing,
          structures: [...existing.structures, remapWorkshopStructure(structure, sysInfo, existing.systemInfo)],
        };
        useWorkshopStore.setState({
          groups: groups.map((g) => g.id === existing.id ? updated : g),
        });
      } else {
        // Create new manual group
        const newGroup: WorkshopGroup = {
          id: crypto.randomUUID(),
          name: 'User Added',
          structures: [structure],
          systemInfo: {
            elements: wsElements,
            componentLabels: sysInfo?.componentLabels,
            compositionBasis: sysInfo?.compositionBasis,
            systemType: sysInfo?.systemType ?? 'binary',
            compositionMode: sysInfo?.compositionMode ?? 'varcomp',
            optimizationType: 'single',
            totalStructures: 1,
            totalGenerations: 0,
            minEnthalpy: data.enthalpy,
            externalPressure: sysInfo?.externalPressure ?? 0,
            calculationType: 0,
            stableCount: 0,
            unconvergedCount: 0,
            maxFitness: 0,
            totalStructuresSource: '',
            secondObjectiveName: '',
            isPickup: false,
            pickUpGen: 0,
            pickUpFolder: 0,
          } as SystemInfo,
          visible: true,
          color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
          importSource: 'manual',
        };
        addGroup(newGroup);
      }
    },
    [groups, addGroup, mergedSystemInfo, projectSystemInfo, workshopContext],
  );

  /* ── Action: structure click → open JSmol viewer with correct workshop structure ── */
  const openWorkshopViewer = useUIStore((s) => s.openWorkshopViewer);

  const handleStructureClick = useCallback(
    (structure: Structure) => {
      const key = (structure as Structure & { _mergeSeq?: number })._mergeSeq;
      const original = hullResult?.structures.find(s => key === undefined ? s.id === structure.id : s._mergeSeq === key);
      openWorkshopViewer(original ?? structure);
    },
    [openWorkshopViewer, hullResult],
  );

  /* ── Chart rendering ── */
  const renderChart = () => {
    if (!hullResult || !mergedSystemInfo) return null;

    const processed = hullDisplayStructures(hullResult.structures, 'reconstructed');
    const { compositionMode, systemType } = mergedSystemInfo;

    if (compositionMode === 'fixed') {
      return (
        <EnergyRankingChart
          structures={processed}
          systemInfo={mergedSystemInfo}
          showExport={false}
          showTags={false}
          onStructureClick={handleStructureClick}
        />
      );
    }
    if (systemType === 'ternary') {
      return (
        <TernaryHullPlot
          structures={processed}
          systemInfo={mergedSystemInfo}
          showExport={false}
          showTags={false}
          showFooter={false}
          oldHullEdges={hullResult.oldHullEdges}
          onStructureClick={handleStructureClick}
        />
      );
    }
    if (systemType === 'quaternary') {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {t('hull.quaternaryTitle', 'Quaternary Phase Diagram')} — {t('workshop.quaternaryNote', 'Tetrahedron visualization is available on the Convex Hull page. Hull reconstruction is not supported for quaternary systems in the Workshop.')}
        </div>
      );
    }
    return (
      <BinaryHullPlot
        structures={processed}
        systemInfo={mergedSystemInfo}
        showExport={false}
        showTags={false}
        showFooter={false}
        oldHullLine={hullResult.oldHullLine}
        onStructureClick={handleStructureClick}
      />
    );
  };

  /* ── Page title ── */
  const pageTitle = hasData
    ? mergedSystemInfo!.compositionMode === 'fixed'
      ? t('hull.energyRanking', 'Energy Ranking')
      : t('hull.title', 'Convex Hull')
    : '';

  /* ── Workshop scope (for matching saved projects) ── */
  const workshopElements = useMemo(
    () => (mergedSystemInfo ?? workshopContext)?.elements ?? [],
    [mergedSystemInfo, workshopContext],
  );
  const workshopPressure = workshopContext?.externalPressure ?? null;
  const currentProjectId = useProjectStore((s) => s.projectId);

  return (
    <div className="workshop-layout">
      {/* Left workspace sidebar */}
      <WorkspaceSidebar
        context={workshopContext}
        groups={groups}
        hasData={hasData}
        structuresCount={hullResult?.structures.length ?? 0}
        elements={workshopElements}
        pressure={workshopPressure}
        currentProjectId={currentProjectId}
        onImportFromProject={handleImportFromProject}
        onImportFromSaved={handleImportFromSaved}
        onUploadJson={handleUploadJson}
        onToggleVisibility={handleToggleVisibility}
        onRemoveGroup={handleRemoveGroup}
        onRenameGroup={handleRenameGroup}
        onExportCsv={handleExport}
        onExportJson={handleExportJson}
        onAddManual={handleAddManual}
      />

      <WorkshopContent
        hasData={hasData}
        pageTitle={pageTitle}
        emptyTitle={t('workshop.emptyTitle', 'Hull Workshop')}
        emptyHint={t('workshop.emptyHint', 'Import data from the current project or load external data to get started.')}
      >
        <HullMetricContext.Provider value={{ name: 'Ed (Recons)', unit: mergedSystemInfo?.referenceInfo?.unit
          ?? (mergedSystemInfo?.compositionMode === 'varcomp' && mergedSystemInfo?.compositionBasis?.length ? 'eV/block' : 'eV/atom') }}>
          {renderChart()}
        </HullMetricContext.Provider>
      </WorkshopContent>

    </div>
  );
}
