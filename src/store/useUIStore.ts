// ============================================================
// 文件名：useUIStore.ts
//
// 这个文件的作用：
//   管理整个应用的"界面状态"（UI State）。
//   界面状态是指那些不属于科学数据本身，但需要记住的东西，
//   比如：侧边栏是否折叠、当前主题是深色还是浅色、
//   筛选页面上用户设置的条件、Explorer 页面选的坐标轴等。
//
// 为什么用 persist 中间件？
//   普通的 Zustand store 数据存在内存里，一旦切换页面，
//   React 会销毁那个页面的组件，内存里的状态就丢了。
//   persist 中间件会把状态自动保存到浏览器的 localStorage，
//   就像把数据写进一个小本子，下次回来还能看到。
// ============================================================

import { create } from 'zustand';
// persist 是 Zustand 提供的"持久化中间件"
// 它会自动把 store 的数据存到 localStorage，并在页面加载时恢复
import { persist } from 'zustand/middleware';
import type { FilterCondition, UnifiedCondition, TableFilterCondition, UnifiedConditionGroup, TableFilterGroup, CustomNamePart } from '@/types/structure';

// -------------------------------------------------------
// 类型定义：描述整个 UI store 里有哪些数据和操作
// -------------------------------------------------------
interface UIState {
  // --- 侧边栏 ---
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // --- 3D 结构查看器弹窗 ---
  // null 表示弹窗关闭，数字表示正在查看哪个结构的 ID
  viewerStructureId: number | null;
  openViewer: (id: number) => void;
  closeViewer: () => void;

  // --- 结构对比模式（最多选 4 个） ---
  compareIds: number[];
  toggleCompare: (id: number) => void;
  clearCompare: () => void;

  // --- 表格多选（用 Set 存储选中的结构 ID） ---
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  selectMultiple: (ids: number[]) => void;
  clearSelection: () => void;

  // --- Dashboard 折叠状态 ---
  dashboardCollapsed: boolean;
  toggleDashboard: () => void;

  // --- 主题（浅色/深色） ---
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // ============================================================
  // 以下是各页面的 UI 状态，切换页面后不会丢失
  // ============================================================

  // --- Filter 页面 ---
  // 用户设置的数值筛选条件列表（旧，保留兼容）
  filterConditions: FilterCondition[];
  setFilterConditions: (conditions: FilterCondition[]) => void;

  // FilterPage 统一条件列表（持久化）
  filterUnifiedConditions: UnifiedCondition[];
  setFilterUnifiedConditions: (conditions: UnifiedCondition[]) => void;

  // FilterPage 条件组（组内 AND，组间 OR）
  filterConditionGroups: UnifiedConditionGroup[];
  setFilterConditionGroups: (groups: UnifiedConditionGroup[]) => void;

  // 标签三态状态：key 是标签 id，value 是 'include'（绿）或 'exclude'（红）
  filterTagStates: Record<string, 'include' | 'exclude'>;
  setFilterTagStates: (states: Record<string, 'include' | 'exclude'>) => void;

  // 导出格式选择
  filterExportFormat: 'zip' | 'seeds' | 'csv' | 'json';
  setFilterExportFormat: (fmt: 'zip' | 'seeds' | 'csv' | 'json') => void;

  // 文件命名规则（数字代表哪些部分要包含在文件名里）
  filterNameParts: number[];
  setFilterNameParts: (parts: number[]) => void;

  // 自定义命名段
  filterCustomNameParts: CustomNamePart[];
  setFilterCustomNameParts: (parts: CustomNamePart[]) => void;

  // 排序字段和方向
  filterSortKey: string;
  setFilterSortKey: (key: string) => void;
  filterSortReverse: boolean;
  setFilterSortReverse: (reverse: boolean) => void;

  // --- Explorer 页面 ---
  // 散点图的 X 轴、Y 轴、颜色映射选择
  explorerXKey: string;
  setExplorerXKey: (key: string) => void;
  explorerYKey: string;
  setExplorerYKey: (key: string) => void;
  explorerColorKey: string;
  setExplorerColorKey: (key: string) => void;
  // 边际分布图开关
  explorerShowXMarginal: boolean;
  setExplorerShowXMarginal: (v: boolean) => void;
  explorerShowYMarginal: boolean;
  setExplorerShowYMarginal: (v: boolean) => void;
  explorerMarginalBins: number;
  setExplorerMarginalBins: (v: number) => void;
  explorerXMarginalExcludeZero: boolean;
  setExplorerXMarginalExcludeZero: (v: boolean) => void;
  explorerYMarginalExcludeZero: boolean;
  setExplorerYMarginalExcludeZero: (v: boolean) => void;

  // --- Beta Explorer 页面 ---
  betaXKey: string;
  setBetaXKey: (key: string) => void;
  betaYKey: string;
  setBetaYKey: (key: string) => void;
  betaColorKey: string;
  setBetaColorKey: (key: string) => void;
  betaXMinimize: boolean;
  setBetaXMinimize: (v: boolean) => void;
  betaYMinimize: boolean;
  setBetaYMinimize: (v: boolean) => void;
  betaColorByFront: boolean;
  setBetaColorByFront: (v: boolean) => void;
  betaNumFronts: number;
  setBetaNumFronts: (v: number) => void;
  betaRefMode: 'auto' | 'manual';
  setBetaRefMode: (v: 'auto' | 'manual') => void;
  betaRefX: number | null;
  setBetaRefX: (v: number | null) => void;
  betaRefY: number | null;
  setBetaRefY: (v: number | null) => void;
  betaShowXMarginal: boolean;
  setBetaShowXMarginal: (v: boolean) => void;
  betaShowYMarginal: boolean;
  setBetaShowYMarginal: (v: boolean) => void;
  betaMarginalBins: number;
  setBetaMarginalBins: (v: number) => void;
  betaXMarginalExcludeZero: boolean;
  setBetaXMarginalExcludeZero: (v: boolean) => void;
  betaYMarginalExcludeZero: boolean;
  setBetaYMarginalExcludeZero: (v: boolean) => void;

  // --- Pareto 页面 ---
  // 选中显示哪些 Pareto 前沿（用数组存，因为 Set 不能直接被 JSON 序列化）
  paretoSelectedFronts: number[];
  setParetoSelectedFronts: (fronts: number[]) => void;
  // 是否显示前沿连线
  paretoShowLines: boolean;
  setParetoShowLines: (show: boolean) => void;

  // --- DataTable 页面 ---
  // 表格排序状态：[{ id: '列名', desc: true/false }]
  tableSorting: { id: string; desc: boolean }[];
  setTableSorting: (sorting: { id: string; desc: boolean }[]) => void;
  // 表格筛选条件（持久化）
  tableFilters: TableFilterCondition[];
  setTableFilters: (filters: TableFilterCondition[]) => void;
  // 表格筛选条件组（组内 AND，组间 OR）
  tableFilterGroups: TableFilterGroup[];
  setTableFilterGroups: (groups: TableFilterGroup[]) => void;

  // 表格搜索框文字
  tableGlobalFilter: string;
  setTableGlobalFilter: (filter: string) => void;

  // 表格标签筛选
  tableSelectedTag: string;
  setTableSelectedTag: (tagId: string) => void;

  // 切换项目时清空所有项目相关的临时筛选状态
  clearProjectFilters: () => void;

  // --- Mark 标记（图表五角星覆盖层） ---
  markActiveTags: string[];
  markEaInput: string;
  setMarkActiveTags: (tags: string[]) => void;
  setMarkEaInput: (input: string) => void;
  clearMarks: () => void;

  // --- 帮助抽屉 ---
  hintPanelOpen: boolean;
  toggleHintPanel: () => void;
  setHintPanelOpen: (open: boolean) => void;
}

// -------------------------------------------------------
// 创建 store，用 persist 包裹，自动存到 localStorage
// -------------------------------------------------------
export const useUIStore = create<UIState>()(
  // persist 是一个"包装器"，把我们的 store 包起来，
  // 让它在每次数据变化时自动保存到 localStorage
  persist(
    (set, get) => ({
      // --- 侧边栏 ---
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      // --- 3D 查看器 ---
      // 弹窗状态不需要持久化（刷新后不应该自动弹出），
      // 但放在这里统一管理更方便
      viewerStructureId: null,
      openViewer: (id) => set({ viewerStructureId: id }),
      closeViewer: () => set({ viewerStructureId: null }),

      // --- 对比模式 ---
      compareIds: [],
      toggleCompare: (id) => {
        const { compareIds } = get();
        if (compareIds.includes(id)) {
          set({ compareIds: compareIds.filter((cid) => cid !== id) });
        } else if (compareIds.length < 4) {
          set({ compareIds: [...compareIds, id] });
        }
      },
      clearCompare: () => set({ compareIds: [] }),

      // --- 表格多选 ---
      // Set 不能被 JSON 序列化，所以不会被 persist 保存，这是正常的
      selectedIds: new Set(),
      toggleSelect: (id) => {
        const next = new Set(get().selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        set({ selectedIds: next });
      },
      selectMultiple: (ids) => set({ selectedIds: new Set(ids) }),
      clearSelection: () => set({ selectedIds: new Set() }),

      // --- Dashboard ---
      dashboardCollapsed: false,
      toggleDashboard: () => set((s) => ({ dashboardCollapsed: !s.dashboardCollapsed })),

      // --- 主题 ---
      theme: 'light',
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      // --- Filter 页面状态 ---
      filterConditions: [{ field: 'fitness', operator: 'lte', value: 0.1 }],
      setFilterConditions: (conditions) => set({ filterConditions: conditions }),

      filterUnifiedConditions: [],
      setFilterUnifiedConditions: (conditions) => set({ filterUnifiedConditions: conditions }),

      filterConditionGroups: [],
      setFilterConditionGroups: (groups) => set({ filterConditionGroups: groups }),

      filterTagStates: {},
      setFilterTagStates: (states) => set({ filterTagStates: states }),

      filterExportFormat: 'zip',
      setFilterExportFormat: (fmt) => set({ filterExportFormat: fmt }),

      filterNameParts: [1, 2, 6, 3],
      setFilterNameParts: (parts) => set({ filterNameParts: parts }),

      filterCustomNameParts: [],
      setFilterCustomNameParts: (parts) => set({ filterCustomNameParts: parts }),

      filterSortKey: 'fitness',
      setFilterSortKey: (key) => set({ filterSortKey: key }),

      filterSortReverse: false,
      setFilterSortReverse: (reverse) => set({ filterSortReverse: reverse }),

      // --- Explorer 页面状态 ---
      explorerXKey: 'fitness',
      setExplorerXKey: (key) => set({ explorerXKey: key }),

      explorerYKey: 'enthalpy',
      setExplorerYKey: (key) => set({ explorerYKey: key }),

      explorerColorKey: 'origin',
      setExplorerColorKey: (key) => set({ explorerColorKey: key }),

      explorerShowXMarginal: false,
      setExplorerShowXMarginal: (v) => set({ explorerShowXMarginal: v }),
      explorerShowYMarginal: false,
      setExplorerShowYMarginal: (v) => set({ explorerShowYMarginal: v }),
      explorerMarginalBins: 30,
      setExplorerMarginalBins: (v) => set({ explorerMarginalBins: v }),
      explorerXMarginalExcludeZero: false,
      setExplorerXMarginalExcludeZero: (v) => set({ explorerXMarginalExcludeZero: v }),
      explorerYMarginalExcludeZero: false,
      setExplorerYMarginalExcludeZero: (v) => set({ explorerYMarginalExcludeZero: v }),

      // --- Beta Explorer 页面状态 ---
      betaXKey: 'fitness',
      setBetaXKey: (key) => set({ betaXKey: key }),
      betaYKey: 'enthalpy',
      setBetaYKey: (key) => set({ betaYKey: key }),
      betaColorKey: '',
      setBetaColorKey: (key) => set({ betaColorKey: key }),
      betaXMinimize: true,
      setBetaXMinimize: (v) => set({ betaXMinimize: v }),
      betaYMinimize: true,
      setBetaYMinimize: (v) => set({ betaYMinimize: v }),
      betaColorByFront: true,
      setBetaColorByFront: (v) => set({ betaColorByFront: v }),
      betaNumFronts: 1,
      setBetaNumFronts: (v) => set({ betaNumFronts: v }),
      betaRefMode: 'auto',
      setBetaRefMode: (v) => set({ betaRefMode: v }),
      betaRefX: null,
      setBetaRefX: (v) => set({ betaRefX: v }),
      betaRefY: null,
      setBetaRefY: (v) => set({ betaRefY: v }),
      betaShowXMarginal: false,
      setBetaShowXMarginal: (v) => set({ betaShowXMarginal: v }),
      betaShowYMarginal: false,
      setBetaShowYMarginal: (v) => set({ betaShowYMarginal: v }),
      betaMarginalBins: 30,
      setBetaMarginalBins: (v) => set({ betaMarginalBins: v }),
      betaXMarginalExcludeZero: false,
      setBetaXMarginalExcludeZero: (v) => set({ betaXMarginalExcludeZero: v }),
      betaYMarginalExcludeZero: false,
      setBetaYMarginalExcludeZero: (v) => set({ betaYMarginalExcludeZero: v }),

      // --- Pareto 页面状态 ---
      paretoSelectedFronts: [],
      setParetoSelectedFronts: (fronts) => set({ paretoSelectedFronts: fronts }),

      paretoShowLines: true,
      setParetoShowLines: (show) => set({ paretoShowLines: show }),

      // --- DataTable 页面状态 ---
      tableSorting: [],
      setTableSorting: (sorting) => set({ tableSorting: sorting }),

      tableFilters: [],
      setTableFilters: (filters) => set({ tableFilters: filters }),

      tableFilterGroups: [],
      setTableFilterGroups: (groups) => set({ tableFilterGroups: groups }),

      tableGlobalFilter: '',
      setTableGlobalFilter: (filter) => set({ tableGlobalFilter: filter }),

      tableSelectedTag: '',
      setTableSelectedTag: (tagId) => set({ tableSelectedTag: tagId }),

      clearProjectFilters: () => set({
        tableFilters: [],
        tableFilterGroups: [],
        tableGlobalFilter: '',
        tableSelectedTag: '',
        filterUnifiedConditions: [],
        filterConditionGroups: [],
        filterTagStates: {},
      }),

      // --- Mark 标记 ---
      markActiveTags: [],
      markEaInput: '',
      setMarkActiveTags: (tags) => set({ markActiveTags: tags }),
      setMarkEaInput: (input) => set({ markEaInput: input }),
      clearMarks: () => set({ markActiveTags: [], markEaInput: '' }),

      // --- 帮助抽屉 ---
      hintPanelOpen: true,
      toggleHintPanel: () => set((s) => ({ hintPanelOpen: !s.hintPanelOpen })),
      setHintPanelOpen: (open) => set({ hintPanelOpen: open }),
    }),
    {
      // localStorage 里存储用的 key 名，要唯一，不能和其他应用冲突
      name: 'uspex-ui-state',

      // partialize 让我们选择"哪些字段需要持久化"
      // viewerStructureId 和 selectedIds 不需要持久化：
      //   - 弹窗刷新后不应该自动打开
      //   - 多选状态刷新后清空更合理
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        dashboardCollapsed: state.dashboardCollapsed,
        theme: state.theme,
        compareIds: state.compareIds,
        filterConditions: state.filterConditions,
        filterUnifiedConditions: state.filterUnifiedConditions,
        filterConditionGroups: state.filterConditionGroups,
        filterTagStates: state.filterTagStates,
        filterExportFormat: state.filterExportFormat,
        filterNameParts: state.filterNameParts,
        filterCustomNameParts: state.filterCustomNameParts,
        filterSortKey: state.filterSortKey,
        filterSortReverse: state.filterSortReverse,
        explorerXKey: state.explorerXKey,
        explorerYKey: state.explorerYKey,
        explorerColorKey: state.explorerColorKey,
        explorerShowXMarginal: state.explorerShowXMarginal,
        explorerShowYMarginal: state.explorerShowYMarginal,
        explorerMarginalBins: state.explorerMarginalBins,
        explorerXMarginalExcludeZero: state.explorerXMarginalExcludeZero,
        explorerYMarginalExcludeZero: state.explorerYMarginalExcludeZero,
        paretoSelectedFronts: state.paretoSelectedFronts,
        paretoShowLines: state.paretoShowLines,
        betaXKey: state.betaXKey,
        betaYKey: state.betaYKey,
        betaColorKey: state.betaColorKey,
        betaXMinimize: state.betaXMinimize,
        betaYMinimize: state.betaYMinimize,
        betaColorByFront: state.betaColorByFront,
        betaNumFronts: state.betaNumFronts,
        betaRefMode: state.betaRefMode,
        betaRefX: state.betaRefX,
        betaRefY: state.betaRefY,
        betaShowXMarginal: state.betaShowXMarginal,
        betaShowYMarginal: state.betaShowYMarginal,
        betaMarginalBins: state.betaMarginalBins,
        betaXMarginalExcludeZero: state.betaXMarginalExcludeZero,
        betaYMarginalExcludeZero: state.betaYMarginalExcludeZero,
        tableSorting: state.tableSorting,
        tableFilters: state.tableFilters,
        tableFilterGroups: state.tableFilterGroups,
        tableGlobalFilter: state.tableGlobalFilter,
        tableSelectedTag: state.tableSelectedTag,
        markActiveTags: state.markActiveTags,
        markEaInput: state.markEaInput,
        hintPanelOpen: state.hintPanelOpen,
      }),
    }
  )
);
