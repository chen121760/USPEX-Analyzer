/**
 * Main project data store (Zustand).
 *
 * This is the single source of truth for all parsed USPEX data.
 */

import { create } from 'zustand';
import type {
  Structure,
  SystemInfo,
  DetectedFile,
  USPEXFileType,
  HullGeneration,
  TagDefinition,
  FilterPreset,
  ProjectFile,
  ParsedFileStatus,
} from '@/types/structure';
import { parseAllFiles, type ParseResult } from '@/parsers';
import { saveProject, makeProjectId } from '@/lib/projectStorage';
import { useUIStore } from '@/store/useUIStore';
import {
  createEmptyParsedFileStatus,
  EMPTY_PARSED_FILE_STATUS,
  inferParsedFiles,
  markParsedFileStatus,
} from '@/domain/project/parsedFileStatus';
import { normalizeStructure, normalizeStructures } from '@/domain/structure/normalizeStructure';

// 这个函数负责把当前 store 的数据导出并存入 IndexedDB
// get 是 zustand 提供的，可以拿到 store 当前的所有数据
// 改成：
function autoSave(get: () => ProjectState) {
  const state = get();
  if (!state.isDataLoaded || !state.systemInfo) return;
  if (!state.projectName) return;  // 没有项目名就不存
  try {
    saveProject(state.exportProjectFile(), state.projectName);
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

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
  isDataLoaded: boolean;
  projectId: string;   // stable unique ID, never changes after creation
 // ---- Actions ----
  setDetectedFiles: (files: DetectedFile[]) => void;
  processFiles: (detectedFiles: DetectedFile[], fileContents: Map<USPEXFileType, string>) => void;
  loadProjectFile: (project: ProjectFile) => void;
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
  isDataLoaded: false,

  setDetectedFiles: (files) => set({ detectedFiles: files }),
  setProjectName: (name) => {
    set({ projectName: name });
    autoSave(get);
  },

  processFiles: (detectedFiles, fileContents) => {
    set({ isLoading: true });

    try {
      const result: ParseResult = parseAllFiles(detectedFiles, fileContents);

      const parsedFiles = markParsedFileStatus(fileContents);

      set({
        systemInfo: result.systemInfo,
        structures: result.structures,
        hullGenerations: result.hullGenerations,
        detectedFiles,
        parsedFiles,
        parseWarnings: result.warnings,
        isLoading: false,
        isDataLoaded: true,
        projectId: makeProjectId(),   // generate once at creation
      });
      useUIStore.getState().clearProjectFilters();
      autoSave(get);
    } catch (error) {
      console.error('Parse error:', error);
      set({
        isLoading: false,
        parseWarnings: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      });
    }
  },

  loadProjectFile: (project) => {
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

    set({
      systemInfo: sysInfo,
      structures: migratedStructures,
      userStructures: normalizeStructures(project.userAddedStructures ?? []),
      hullGenerations: hullGens,
      tags: project.tags?.length ? project.tags : [...DEFAULT_TAGS],
      filterPresets: project.filterPresets ?? [],
      parsedFiles,
      isLoading: false,
      isDataLoaded: true,
      parseWarnings: [],
      projectId: project.projectId ?? makeProjectId(),  // reuse existing ID or mint one for old files
      projectName: project.projectName || project.systemInfo?.elements?.join('-') || '',
    });
    useUIStore.getState().clearProjectFilters();
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
      bulkModulus: -1,
      eForm: -1,
      eHullRecons: -1,
      shearModulus: -1,
      youngModulus: -1,
      poissonRatio: -1,
      pughRatio: -1,
      vickersHardness: -1,
      fractureToughness: -1,
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
    autoSave(get);
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
    autoSave(get);
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
      isDataLoaded: false,
    }),
}));
