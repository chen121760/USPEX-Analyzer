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
} from '@/types/structure';
import { parseAllFiles, type ParseResult } from '@/parsers';
import { saveProject } from '@/lib/projectStorage';

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

interface ParsedFileStatus {
  parameters: boolean;
  extended_convex_hull: boolean;
  individuals: boolean;
  pareto_ranking: boolean;
  ml_properties: boolean;
  origin: boolean;
  gathered_poscars: boolean;
  gathered_poscars_unrelaxed: boolean;
  convex_hull: boolean;
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

const EMPTY_PARSED: ParsedFileStatus = {
  parameters: false,
  extended_convex_hull: false,
  individuals: false,
  pareto_ranking: false,
  ml_properties: false,
  origin: false,
  gathered_poscars: false,
  gathered_poscars_unrelaxed: false,
  convex_hull: false,
};

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
  structures: [],
  userStructures: [],
  hullGenerations: [],
  tags: [...DEFAULT_TAGS],
  filterPresets: [],
  detectedFiles: [],
  parsedFiles: { ...EMPTY_PARSED },
  parseWarnings: [],
  isLoading: false,
  isDataLoaded: false,

  setDetectedFiles: (files) => set({ detectedFiles: files }),
  setProjectName: (name) => set({ projectName: name }),

  processFiles: (detectedFiles, fileContents) => {
    set({ isLoading: true });

    try {
      const result: ParseResult = parseAllFiles(detectedFiles, fileContents);

      // Build parsed status
      const parsedFiles: ParsedFileStatus = { ...EMPTY_PARSED };
      for (const [type] of fileContents) {
        if (type in parsedFiles) {
          (parsedFiles as unknown as Record<string, boolean>)[type] = true;
        }
      }

      set({
        systemInfo: result.systemInfo,
        structures: result.structures,
        hullGenerations: result.hullGenerations,
        detectedFiles,
        parsedFiles,
        parseWarnings: result.warnings,
        isLoading: false,
        isDataLoaded: true,
      });
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
    // Migrate old project files: hullX was number, now number[]
    const migratedStructures = project.structures.map((s) => ({
      ...s,
      hullX: Array.isArray(s.hullX) ? s.hullX : [s.hullX as number],
    }));

    // Ensure compositionMode exists (backward compat)
    const sysInfo = { ...project.systemInfo };
    if (!sysInfo.compositionMode) {
      sysInfo.compositionMode = 'varcomp';
    }

    set({
      systemInfo: sysInfo,
      structures: migratedStructures,
      userStructures: project.userAddedStructures ?? [],
      hullGenerations: project.hullGenerations ?? [],
      tags: project.tags?.length ? project.tags : [...DEFAULT_TAGS],
      filterPresets: project.filterPresets ?? [],
      parsedFiles: { ...EMPTY_PARSED }, // not from files
      isLoading: false,
      isDataLoaded: true,
      parseWarnings: [],
    });
  },

  exportProjectFile: () => {
    const state = get();
    if (!state.systemInfo) {
      throw new Error('No project data to export');
    }
    return {
      version: '1.0.0',
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      systemInfo: state.systemInfo,
      structures: state.structures,
      userAddedStructures: state.userStructures,
      tags: state.tags,
      filterPresets: state.filterPresets,
      hullGenerations: state.hullGenerations,
    };
  },

  addUserStructure: (partial) => {
    const { userStructures } = get();
    const maxId = Math.max(
      0,
      ...get().structures.map((s) => s.id),
      ...userStructures.map((s) => s.id),
    );

    const newStructure: Structure = {
      id: maxId + 1,
      formula: partial.formula ?? 'User',
      composition: partial.composition ?? [],
      generation: 0,
      enthalpy: partial.enthalpy ?? 0,
      enthalpyTotal: 0,
      volume: partial.volume ?? 0,
      volumeTotal: 0,
      fitness: -1,
      spaceGroup: partial.spaceGroup ?? 0,
      hullX: [],
      hullY: 0,
      origin: 'UserAdded',
      parentIds: [],
      parentEnthalpy: 0,
      density: partial.density ?? 0,
      tags: [],
      isUserAdded: true,
      notes: partial.notes ?? '',
      poscarData: partial.poscarData,
      ...partial,
    };

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
      userStructures: [],
      hullGenerations: [],
      tags: [...DEFAULT_TAGS],
      filterPresets: [],
      detectedFiles: [],
      parsedFiles: { ...EMPTY_PARSED },
      parseWarnings: [],
      isLoading: false,
      isDataLoaded: false,
    }),
}));