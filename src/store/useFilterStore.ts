import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CustomNamePart,
  FilterCondition,
  UnifiedCondition,
  UnifiedConditionGroup,
} from '@/types/structure';
import {
  getLegacyUIValue,
  isIncludeExcludeRecord,
  isNumberArray,
  isString,
  isUnknownArray,
} from '@/store/uiPersistence';

type FilterExportFormat = 'zip' | 'seeds' | 'csv' | 'json';

interface FilterState {
  filterConditions: FilterCondition[];
  setFilterConditions: (conditions: FilterCondition[]) => void;
  filterUnifiedConditions: UnifiedCondition[];
  setFilterUnifiedConditions: (conditions: UnifiedCondition[]) => void;
  filterConditionGroups: UnifiedConditionGroup[];
  setFilterConditionGroups: (groups: UnifiedConditionGroup[]) => void;
  filterTagStates: Record<string, 'include' | 'exclude'>;
  setFilterTagStates: (states: Record<string, 'include' | 'exclude'>) => void;
  filterExportFormat: FilterExportFormat;
  setFilterExportFormat: (fmt: FilterExportFormat) => void;
  filterNameParts: number[];
  setFilterNameParts: (parts: number[]) => void;
  filterCustomNameParts: CustomNamePart[];
  setFilterCustomNameParts: (parts: CustomNamePart[]) => void;
  filterSortKey: string;
  setFilterSortKey: (key: string) => void;
  filterSortReverse: boolean;
  setFilterSortReverse: (reverse: boolean) => void;
  clearFilterState: () => void;
}

const defaultFilterConditions: FilterCondition[] = [{ field: 'fitness', operator: 'lte', value: 0.1 }];

function isFilterExportFormat(value: unknown): value is FilterExportFormat {
  return value === 'zip' || value === 'seeds' || value === 'csv' || value === 'json';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function legacyArray<T>(key: string, fallback: T[]): T[] {
  return getLegacyUIValue<unknown[]>(key, fallback, isUnknownArray) as T[];
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      filterConditions: legacyArray<FilterCondition>('filterConditions', defaultFilterConditions),
      setFilterConditions: (conditions) => set({ filterConditions: conditions }),

      filterUnifiedConditions: legacyArray<UnifiedCondition>('filterUnifiedConditions', []),
      setFilterUnifiedConditions: (conditions) => set({ filterUnifiedConditions: conditions }),

      filterConditionGroups: legacyArray<UnifiedConditionGroup>('filterConditionGroups', []),
      setFilterConditionGroups: (groups) => set({ filterConditionGroups: groups }),

      filterTagStates: getLegacyUIValue('filterTagStates', {}, isIncludeExcludeRecord),
      setFilterTagStates: (states) => set({ filterTagStates: states }),

      filterExportFormat: getLegacyUIValue('filterExportFormat', 'zip', isFilterExportFormat),
      setFilterExportFormat: (fmt) => set({ filterExportFormat: fmt }),

      filterNameParts: getLegacyUIValue('filterNameParts', [1, 2, 6, 3], isNumberArray),
      setFilterNameParts: (parts) => set({ filterNameParts: parts }),

      filterCustomNameParts: legacyArray<CustomNamePart>('filterCustomNameParts', []),
      setFilterCustomNameParts: (parts) => set({ filterCustomNameParts: parts }),

      filterSortKey: getLegacyUIValue('filterSortKey', 'fitness', isString),
      setFilterSortKey: (key) => set({ filterSortKey: key }),

      filterSortReverse: getLegacyUIValue('filterSortReverse', false, isBoolean),
      setFilterSortReverse: (reverse) => set({ filterSortReverse: reverse }),

      clearFilterState: () => set({
        filterUnifiedConditions: [],
        filterConditionGroups: [],
        filterTagStates: {},
      }),
    }),
    {
      name: 'uspex-filter-state',
      version: 1,
      partialize: (state) => ({
        filterConditions: state.filterConditions,
        filterUnifiedConditions: state.filterUnifiedConditions,
        filterConditionGroups: state.filterConditionGroups,
        filterTagStates: state.filterTagStates,
        filterExportFormat: state.filterExportFormat,
        filterNameParts: state.filterNameParts,
        filterCustomNameParts: state.filterCustomNameParts,
        filterSortKey: state.filterSortKey,
        filterSortReverse: state.filterSortReverse,
      }),
    },
  ),
);
