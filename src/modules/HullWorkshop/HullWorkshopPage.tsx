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
import { buildFormula, totalAtoms } from '@/parsers/compositionUtils';
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
    const typeRank = { unary: 0, binary: 1, ternary: 2 } as const;
    let best = visibleGroups[0].systemInfo;
    for (const g of visibleGroups) {
      if (typeRank[g.systemInfo.systemType] > typeRank[best.systemType]) {
        best = g.systemInfo;
      }
    }

    return { ...best, compositionMode };
  }, [visibleGroups]);

  /* ── Derived: merged structures with groupName attached ── */
  const mergedStructuresWithGroup = useMemo(() => {
    const result: (Structure & { groupName: string; _mergeSeq: number })[] = [];
    let seq = 0;
    for (const g of visibleGroups) {
      for (const s of g.structures) {
        result.push({ ...s, groupName: g.name, groupColor: g.color, _mergeSeq: seq++ });
      }
    }
    return result;
  }, [visibleGroups]);

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
      (s) => s.enthalpyTotal <= 900 && !isNaN(s.fitness) && s.fitness >= 0,
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
    addGroup(group);
  }, [groups.length, addGroup, t]);

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
      for (const g of newGroups) addGroup(g);
    },
    [addGroup],
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
        const archive: WorkshopJsonExport = JSON.parse(text);

        if (archive.type !== 'uspex-workshop') {
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

        for (const g of newGroups) {
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
    [groups.length, addGroup, t],
  );

  /* ── Action: add manual structure ── */
  const handleAddManual = useCallback(
    (data: ManualStructureData) => {
      const wsElements = mergedSystemInfo?.elements
        ?? useProjectStore.getState().systemInfo?.elements
        ?? [];
      const total = totalAtoms(data.composition) || 1;

      const structure: Structure = {
        id: Date.now() % 100000,
        formula: data.composition.length > 0
          ? buildFormula(data.composition, wsElements)
          : 'Manual',
        composition: [...data.composition],
        enthalpy: data.enthalpy,
        enthalpyTotal: data.enthalpy,
        volume: 0,
        volumeTotal: 0,
        fitness: 0,
        spaceGroup: data.spaceGroup,
        hullX: wsElements.length === 2
          ? [data.composition[1] / total]
          : wsElements.length === 3
            ? [data.composition[0] / total, data.composition[1] / total]
            : [0],
        hullY: 0,
        eForm: 0,
        eHullRecons: 0,
        generation: 0,
        origin: 'manual',
        density: 0,
        parentIds: [],
        parentEnthalpy: 0,
        paretoFront: 0,
        bulkModulus: 0,
        shearModulus: 0,
        youngModulus: 0,
        poissonRatio: 0,
        pughRatio: 0,
        vickersHardness: 0,
        fractureToughness: 0,
        qEntropy: 0,
        aOrder: 0,
        sOrder: 0,
        tags: [],
        isUserAdded: true,
        notes: data.notes,
      };

      // Find or create "User Added" group
      const existing = groups.find((g) => g.importSource === 'manual');
      if (existing) {
        // Add to existing manual group
        const updated: WorkshopGroup = {
          ...existing,
          structures: [...existing.structures, structure],
        };
        useWorkshopStore.setState({
          groups: groups.map((g) => g.id === existing.id ? updated : g),
        });
      } else {
        // Create new manual group
        const sysInfo = useProjectStore.getState().systemInfo ?? mergedSystemInfo;
        const newGroup: WorkshopGroup = {
          id: crypto.randomUUID(),
          name: 'User Added',
          structures: [structure],
          systemInfo: {
            elements: wsElements,
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
    [groups, addGroup, mergedSystemInfo],
  );

  /* ── Action: structure click → open JSmol viewer with correct workshop structure ── */
  const openWorkshopViewer = useUIStore((s) => s.openWorkshopViewer);

  const handleStructureClick = useCallback(
    (structure: Structure) => {
      openWorkshopViewer(structure);
    },
    [openWorkshopViewer],
  );

  /* ── Chart rendering ── */
  const renderChart = () => {
    if (!hullResult || !mergedSystemInfo) return null;

    const processed = hullResult.structures;
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
    () => mergedSystemInfo?.elements ?? useProjectStore.getState().systemInfo?.elements ?? [],
    [mergedSystemInfo],
  );
  const workshopPressure = mergedSystemInfo?.externalPressure ?? 0;
  const currentProjectId = useProjectStore((s) => s.projectId);

  return (
    <div className="workshop-layout">
      {/* Left workspace sidebar */}
      <WorkspaceSidebar
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
        {renderChart()}
      </WorkshopContent>

    </div>
  );
}
