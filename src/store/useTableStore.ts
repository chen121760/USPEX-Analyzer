import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TableFilterCondition, TableFilterGroup } from '@/types/structure';
import { getLegacyUIValue, isBooleanRecord, isString, isUnknownArray } from '@/store/uiPersistence';

type TableSorting = { id: string; desc: boolean };

interface TableState {
  tableSorting: TableSorting[];
  setTableSorting: (sorting: TableSorting[]) => void;
  tableFilters: TableFilterCondition[];
  setTableFilters: (filters: TableFilterCondition[]) => void;
  tableFilterGroups: TableFilterGroup[];
  setTableFilterGroups: (groups: TableFilterGroup[]) => void;
  tableGlobalFilter: string;
  setTableGlobalFilter: (filter: string) => void;
  tableSelectedTag: string;
  setTableSelectedTag: (tagId: string) => void;
  tableColumnVisibility: Record<string, boolean>;
  setTableColumnVisibility: (visibility: Record<string, boolean>) => void;
  clearTableFilters: () => void;
}

function legacyArray<T>(key: string, fallback: T[]): T[] {
  return getLegacyUIValue<unknown[]>(key, fallback, isUnknownArray) as T[];
}

export const useTableStore = create<TableState>()(
  persist(
    (set) => ({
      tableSorting: legacyArray<TableSorting>('tableSorting', []),
      setTableSorting: (sorting) => set({ tableSorting: sorting }),

      tableFilters: legacyArray<TableFilterCondition>('tableFilters', []),
      setTableFilters: (filters) => set({ tableFilters: filters }),

      tableFilterGroups: legacyArray<TableFilterGroup>('tableFilterGroups', []),
      setTableFilterGroups: (groups) => set({ tableFilterGroups: groups }),

      tableGlobalFilter: getLegacyUIValue('tableGlobalFilter', '', isString),
      setTableGlobalFilter: (filter) => set({ tableGlobalFilter: filter }),

      tableSelectedTag: getLegacyUIValue('tableSelectedTag', '', isString),
      setTableSelectedTag: (tagId) => set({ tableSelectedTag: tagId }),

      tableColumnVisibility: getLegacyUIValue('tableColumnVisibility', {}, isBooleanRecord),
      setTableColumnVisibility: (visibility) => set({ tableColumnVisibility: visibility }),

      clearTableFilters: () => set({
        tableFilters: [],
        tableFilterGroups: [],
        tableGlobalFilter: '',
        tableSelectedTag: '',
      }),
    }),
    {
      name: 'uspex-table-state',
      version: 1,
      partialize: (state) => ({
        tableSorting: state.tableSorting,
        tableFilters: state.tableFilters,
        tableFilterGroups: state.tableFilterGroups,
        tableGlobalFilter: state.tableGlobalFilter,
        tableSelectedTag: state.tableSelectedTag,
        tableColumnVisibility: state.tableColumnVisibility,
      }),
    },
  ),
);
