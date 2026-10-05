import { validateProject } from '@/domain/project/validateProject';
/**
 * Main project data store (Zustand).
 *
 * This is the single source of truth for all parsed USPEX data.
 */

import { create } from 'zustand';
import type {
  Structure,
  SymmetryAnalysis,
  SymmetryStatus,
  SystemInfo,
  DetectedFile,
  USPEXFileType,
  HullGeneration,
  TagDefinition,
  FilterPreset,
  ProjectFile,
  ParsedFileStatus,
  AxisRangeSetting,
} from '@/types/structure';
import { parseAllFiles, type ParseResult } from '@/parsers';
import { makeProjectId } from '@/lib/projectStorage';
import { useUIStore } from '@/store/useUIStore';
import { resetProjectScopedState } from '@/store/resetProjectScopedState';
import {
  createEmptyParsedFileStatus,
  EMPTY_PARSED_FILE_STATUS,
  inferParsedFiles,
  markParsedFileStatus,
} from '@/domain/project/parsedFileStatus';
import { normalizeStructure, normalizeStructures } from '@/domain/structure/normalizeStructure';
import { ML_PROPERTY_MISSING } from '@/domain/structure/mlProperties';
import { nextPaint } from '@/lib/nextPaint';
import i18n from '@/i18n/config';

interface ProjectState {
  // ---- Data ----
  systemInfo: SystemInfo | null;
  structures: Structure[];
  userStructures: Structure[];
  hullGenerations: HullGeneration[];
  tags: TagDefinition[];
  filterPresets: FilterPreset[];

  // ---- File tracking ----
  detectedFiles: DetectedFile[];
  parsedFiles: ParsedFileStatus;
  parseWarnings: string[];

  // ---- Loading state ----
  isLoading: boolean;
  /**
   * i18n key of the current loading step, shown by the global loading overlay.
   * `null` when nothing is loading.
   */
  loadingStage: string | null;
  /** Optional detail line, e.g. how many files or structures are being handled. */
  loadingDetail: string | null;
  /**
   * Completed fraction of the current operation in [0, 1], or `null` when the
   * work cannot report progress (the overlay then shows an indeterminate bar).
   */
  loadingProgress: number | null;
  isDataLoaded: boolean;
  persistenceError: string | null;
  projectId: string;   // stable unique ID, never changes after creation

  // ---- Background symmetry (moyo) analysis ----
  symmetryStatus: SymmetryStatus;
  setSymmetryStatus: (patch: Partial<SymmetryStatus>) => void;
  /** Merge streamed moyo results into the structure lists (one write per chunk). */
  applySymmetryResults: (results: { id: number; analysis: SymmetryAnalysis }[]) => void;

 // ---- Actions ----
  setDetectedFiles: (files: DetectedFile[]) => void;
  processFiles: (detectedFiles: DetectedFile[], fileContents: Map<USPEXFileType, string>) => Promise<void>;
  loadProjectFile: (project: ProjectFile, options?: { preserveFilters?: boolean }) => Promise<void>;
  exportProjectFile: () => ProjectFile;
  projectName: string;  // 存用户起的项目名
  setProjectName: (name: string) => void;  // 设置项目名的方法
 

  // Structure management
  addUserStructure: (structure: Partial<Structure>) => void;
  removeUserStructure: (id: number) => void;
  updateStructureTags: (id: number, tags: string[]) => void;
  updateStructureNotes: (id: number, notes: string) => void;

  // Tag management
  addTag: (tag: TagDefinition) => void;
  removeTag: (tagId: string) => void;

  // Filter presets
  addFilterPreset: (preset: FilterPreset) => void;
  removeFilterPreset: (presetId: string) => void;

  // Reset
  reset: () => void;

  // ---- Explorer axis presentation (project-scoped, keyed by field key) ----
  explorerAxisLabels: Record<string, string>;
  setExplorerAxisLabel: (fieldKey: string, label: string) => void;
  explorerAxisRanges: Record<string, AxisRangeSetting>;
  setExplorerAxisRange: (fieldKey: string, range: AxisRangeSetting) => void;
}

const DEFAULT_TAGS: TagDefinition[] = [
  { id: 'candidate', nameKey: 'tag.candidate', color: '#f59e0b' },
  { id: 'to-verify', nameKey: 'tag.toVerify', color: '#3b82f6' },
  { id: 'excluded', nameKey: 'tag.excluded', color: '#ef4444' },
  { id: 'bookmarked', nameKey: 'tag.bookmarked', color: '#8b5cf6' },
];

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial state
  systemInfo: null,
  projectName: '',
  projectId: '',
  structures: [],
  userStructures: [],
  hullGenerations: [],
  tags: [...DEFAULT_TAGS],
  filterPresets: [],
  detectedFiles: [],
  parsedFiles: createEmptyParsedFileStatus(),
  parseWarnings: [],
  isLoading: false,
  loadingStage: null,
  loadingDetail: null,
  loadingProgress: null,
  isDataLoaded: false,
  persistenceError: null,
  symmetryStatus: { running: false, done: 0, total: 0 },
  explorerAxisLabels: {},
  explorerAxisRanges: {},

  setDetectedFiles: (files) => set({ detectedFiles: files }),
  setProjectName: (name) => {
    set({ projectName: name });
  },

  // Axis titles/ranges are keyed by field key and live with the project, so a
  // range typed for one system never appears on another system's chart.
  setExplorerAxisLabel: (fieldKey, label) => set((state) => {
    const explorerAxisLabels = { ...state.explorerAxisLabels };
    if (label.trim()) explorerAxisLabels[fieldKey] = label.trim();
    else delete explorerAxisLabels[fieldKey];
    return { explorerAxisLabels };
  }),
  setExplorerAxisRange: (fieldKey, range) => set((state) => ({
    explorerAxisRanges: { ...state.explorerAxisRanges, [fieldKey]: range },
  })),

  setSymmetryStatus: (patch) =>
    set((state) => ({ symmetryStatus: { ...state.symmetryStatus, ...patch } })),

  applySymmetryResults: (results) => {
    if (results.length === 0) return;
    const byId = new Map(results.map((entry) => [entry.id, entry.analysis]));
    const merge = (list: Structure[]): Structure[] =>
      list.map((structure) => {
        const analysis = byId.get(structure.id);
        return analysis ? { ...structure, symmetry: analysis } : structure;
      });
    set((state) => ({
      structures: merge(state.structures),
      userStructures: merge(state.userStructures),
    }));
  },

  processFiles: async (detectedFiles, fileContents) => {
    /** Display name of the file being parsed, for the overlay's detail line. */
    const displayName = (type: USPEXFileType) =>
      detectedFiles.find((entry) => entry.type === type)?.displayName ?? type;

    const startedAt = performance.now();
    let yielded = false;

    set({
      isLoading: true,
      loadingStage: 'loadStage.parsing',
      loadingDetail: i18n.t('loadStage.files', { count: detectedFiles.length }),
      loadingProgress: 0,
    });
    // Let the overlay paint before parseAllFiles blocks the main thread.
    await nextPaint();

    try {
      const result: ParseResult = await parseAllFiles(detectedFiles, fileContents, async (step) => {
        set({
          loadingStage: step.stage,
          loadingDetail: step.fileType
            ? i18n.t('loadStage.file', { name: displayName(step.fileType) })
            : step.count != null
              ? i18n.t(step.detailKey ?? 'loadStage.structures', { count: step.count })
              : null,
          // `null` from the parser means "this step cannot measure itself"; the
          // overlay then shows its indeterminate bar rather than a frozen fill.
          loadingProgress: step.progress,
        });
        // Each handler call *is* a step boundary, so yielding here is what makes
        // the bar advance during the otherwise blocking parse. A run small
        // enough to finish inside the overlay's anti-flash delay skips the
        // frames entirely and stays instant.
        if (yielded || performance.now() - startedAt > 100) {
          yielded = true;
          await nextPaint();
        }
      });

      // Second stage: the heavy parse is done, the store update and the first
      // render of the analysis pages still take a moment.
      set({
        loadingStage: 'loadStage.finalizing',
        loadingDetail: i18n.t('loadStage.structures', { count: result.structures.length }),
        loadingProgress: 1,
      });
      await nextPaint();

      const parsedFiles = markParsedFileStatus(fileContents);

      set({
        systemInfo: result.systemInfo,
        structures: result.structures,
        userStructures: [],
        tags: [...DEFAULT_TAGS],
        filterPresets: [],
        projectName: '',
        persistenceError: null,
        hullGenerations: result.hullGenerations,
        detectedFiles,
        parsedFiles,
        parseWarnings: result.warnings,
        isLoading: false,
        loadingStage: null,
        loadingDetail: null,
        loadingProgress: null,
        isDataLoaded: true,
        projectId: makeProjectId(),   // generate once at creation
        // A brand-new analysis starts with clean per-project presentation state.
        explorerAxisLabels: {},
        explorerAxisRanges: {},
      });
      useUIStore.getState().clearProjectFilters();
      resetProjectScopedState();
      } catch (error) {
      console.error('Parse error:', error);
      set({
        isLoading: false,
        loadingStage: null,
        loadingDetail: null,
        loadingProgress: null,
        parseWarnings: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      });
    }
  },

  loadProjectFile: async (project, options) => {
    // Restoring a saved project has no measurable sub-steps (it is a single
    // IndexedDB read plus a normalization pass), so the bar stays indeterminate.
    set({
      isLoading: true,
      loadingStage: 'loadStage.restoring',
      loadingDetail: null,
      loadingProgress: null,
    });
    await nextPaint();

    try {
      validateProject(project);
      const migratedStructures = normalizeStructures(project.structures);

      // Ensure compositionMode exists (backward compat)
      const sysInfo = { ...project.systemInfo };
      if (!sysInfo.compositionMode) {
        sysInfo.compositionMode = 'varcomp';
      }

      const hullGens = project.hullGenerations ?? [];
      const parsedFiles: ParsedFileStatus = project.parsedFiles
        ? { ...EMPTY_PARSED_FILE_STATUS, ...project.parsedFiles }
        : inferParsedFiles(migratedStructures, sysInfo, hullGens.length);

      // Restoring the project that is already active (e.g. session restore on
      // page load) keeps the user's comparisons/marks; loading a *different*
      // project drops selections that referenced the previous project's ids.
      const activeProjectId = get().projectId;
      const incomingProjectId = project.projectId ?? '';
      const switchingProject = activeProjectId !== '' && incomingProjectId !== activeProjectId;

      set({
        systemInfo: sysInfo,
        structures: migratedStructures,
        userStructures: normalizeStructures(project.userAddedStructures ?? []),
        hullGenerations: hullGens,
        tags: project.tags?.length ? project.tags : [...DEFAULT_TAGS],
        filterPresets: project.filterPresets ?? [],
        parsedFiles,
        isLoading: false,
        loadingStage: null,
        loadingDetail: null,
        loadingProgress: null,
        isDataLoaded: true,
        parseWarnings: [],
        projectId: incomingProjectId || makeProjectId(),  // reuse existing ID or mint one for old files
        persistenceError: null,
      projectName: project.projectName || project.systemInfo?.elements?.join('-') || '',
        // Axis titles/ranges are stored with the project itself.
        explorerAxisLabels: project.explorerAxisLabels ?? {},
        explorerAxisRanges: project.explorerAxisRanges ?? {},
      });
      if (!options?.preserveFilters) useUIStore.getState().clearProjectFilters();
      if (switchingProject) resetProjectScopedState();
    } finally {
      set({ isLoading: false, loadingStage: null, loadingDetail: null, loadingProgress: null });
    }
  },

  exportProjectFile: () => {
    const state = get();
    if (!state.systemInfo) {
      throw new Error('No project data to export');
    }
    return {
      version: '1.0.0',
      projectId: state.projectId,
      projectName: state.projectName,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      systemInfo: state.systemInfo,
      structures: state.structures,
      userAddedStructures: state.userStructures,
      tags: state.tags,
      filterPresets: state.filterPresets,
      hullGenerations: state.hullGenerations,
      parsedFiles: state.parsedFiles,
      explorerAxisLabels: state.explorerAxisLabels,
      explorerAxisRanges: state.explorerAxisRanges,
    };
  },

  addUserStructure: (partial) => {
    const { userStructures } = get();
    const maxId = Math.max(
      0,
      ...get().structures.map((s) => s.id),
      ...userStructures.map((s) => s.id),
    );

    const newStructure = normalizeStructure({
      id: maxId + 1,
      formula: 'User',
      composition: [],
      generation: 0,
      enthalpy: 0,
      enthalpyTotal: 0,
      volume: 0,
      volumeTotal: 0,
      fitness: -1,
      spaceGroup: 0,
      hullX: [],
      hullY: 0,
      origin: 'UserAdded',
      parentIds: [],
      parentEnthalpy: 0,
      density: 0,
      paretoFront: -1,
      bulkModulus: ML_PROPERTY_MISSING,
      eForm: -1,
      eHullRecons: -1,
      shearModulus: ML_PROPERTY_MISSING,
      youngModulus: ML_PROPERTY_MISSING,
      poissonRatio: ML_PROPERTY_MISSING,
      pughRatio: ML_PROPERTY_MISSING,
      vickersHardness: ML_PROPERTY_MISSING,
      fractureToughness: ML_PROPERTY_MISSING,
      qEntropy: 0,
      aOrder: 0,
      sOrder: 0,
      tags: [],
      isUserAdded: true,
      notes: '',
      ...partial,
    });

    set({ userStructures: [...userStructures, newStructure] });
  },

  removeUserStructure: (id) => {
    set({ userStructures: get().userStructures.filter((s) => s.id !== id) });
  },

  updateStructureTags: (id, tags) => {
    const { structures, userStructures } = get();

    set({
      structures: structures.map((s) =>
        s.id === id ? { ...s, tags } : s
      ),
      userStructures: userStructures.map((s) =>
        s.id === id ? { ...s, tags } : s
      ),
    });
  },

  updateStructureNotes: (id, notes) => {
    const { structures, userStructures } = get();

    set({
      structures: structures.map((s) =>
        s.id === id ? { ...s, notes } : s
      ),
      userStructures: userStructures.map((s) =>
        s.id === id ? { ...s, notes } : s
      ),
    });
  },

  addTag: (tag) => set({ tags: [...get().tags, tag] }),
  removeTag: (tagId) => set({ tags: get().tags.filter((t) => t.id !== tagId) }),

  addFilterPreset: (preset) => set({ filterPresets: [...get().filterPresets, preset] }),
  removeFilterPreset: (presetId) =>
    set({ filterPresets: get().filterPresets.filter((p) => p.id !== presetId) }),

  reset: () =>
    set({
      systemInfo: null,
      structures: [],
      projectName: '',
      projectId: '',
      userStructures: [],
      hullGenerations: [],
      tags: [...DEFAULT_TAGS],
      filterPresets: [],
      detectedFiles: [],
      parsedFiles: createEmptyParsedFileStatus(),
      parseWarnings: [],
      isLoading: false,
      loadingStage: null,
      loadingDetail: null,
      loadingProgress: null,
      isDataLoaded: false,
      persistenceError: null,
      symmetryStatus: { running: false, done: 0, total: 0 },
      explorerAxisLabels: {},
      explorerAxisRanges: {},
    }),
}));
