import { formationEnergy } from '@/domain/structure/formationEnergy';
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useCompareStore } from '@/store/useCompareStore';
import { useTableStore } from '@/store/useTableStore';
import { useFilterStore } from '@/store/useFilterStore';
import { useUIStore } from '@/store/useUIStore';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  Search, Eye, GitBranch, ArrowLeftRight, Columns3,
} from 'lucide-react';
import { LineagePanel } from './LineagePanel';
import { NotesEditor, SortIcon, TagPicker } from './components/DataTableCellControls';
import {
  DataTableFilterBuilder,
  type FilterKind,
  type TextFilterField,
  type TextFilterOperator,
} from './components/DataTableFilterBuilder';
import { UnifiedTagFilter } from '@/components/filters/UnifiedTagFilter';
import { TableSkeletonRows } from '@/components/ui/Skeleton';
import { useProgressiveData } from '@/hooks/useProgressiveData';
import { matchesActiveFilter } from '@/modules/Filter/filterLogic';
import { FormulaDisplay } from '@/components/FormulaDisplay';
import { ML_FIELD_KEYS, ML_FIELD_I18N } from '@/lib/constants';
import { collectDynamicFieldKeys, dynamicFieldValue } from '@/domain/structure/dynamicFields';
import { hasMLProperties, isMLPropertyValue } from '@/domain/structure/mlProperties';
import type {
  Structure,
  CompOperator,
  NumericOperator,
  TableFilterCondition,
  UnifiedCondition,
  UnifiedConditionGroup,
} from '@/types/structure';

function migrateTableCondition(condition: TableFilterCondition): UnifiedCondition {
  if (condition.kind === 'numeric') {
    const operators: Record<typeof condition.operator, NumericOperator> = {
      '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte', '=': 'eq',
    };
    return { kind: 'numeric', field: condition.column, operator: operators[condition.operator], value: condition.value };
  }
  if (condition.kind === 'text') {
    return { kind: 'text', field: condition.column, operator: condition.operator, values: condition.values };
  }
  if (condition.kind === 'nComponents') return { kind: 'nComponents', value: condition.value };
  return { kind: 'elementFraction', element: condition.element, operator: condition.operator, value: condition.value };
}

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  eForm: false,
  eHullRecons: false,
};

const PROGRAM_GENERATED_COLUMN_IDS = ['eForm', 'eHullRecons'] as const;

export function DataTablePage() {
  const { t } = useTranslation();
  const rawStructures = useProjectStore((s) => s.structures);
  // The table engine re-derives every row model from the data: hand it the real
  // array one frame after mount, so the toolbar and the header paint first and
  // the body shows reserved skeleton rows meanwhile.
  const { data: structures, ready } = useProgressiveData(rawStructures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const tags = useProjectStore((s) => s.tags);
  const updateStructureTags = useProjectStore((s) => s.updateStructureTags);
  const updateStructureNotes = useProjectStore((s) => s.updateStructureNotes);
  const openViewer = useUIStore((s) => s.openViewer);
  const toggleCompare = useCompareStore((s) => s.toggleCompare);
  const compareIds = useCompareStore((s) => s.compareIds);

  // 排序状态从 TableStore 读取，切换页面后不会丢失
  const sortingRaw    = useTableStore((s) => s.tableSorting) as SortingState;
  const setSortingRaw = useTableStore((s) => s.setTableSorting);
  // react-table 的 onSortingChange 可能传入新值，也可能传入一个"更新函数"
  // 这个包装函数统一处理两种情况
  const sorting = sortingRaw;
  const setSorting = (updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => {
    if (typeof updaterOrValue === 'function') {
      setSortingRaw(updaterOrValue(sortingRaw));
    } else {
      setSortingRaw(updaterOrValue);
    }
  };
  const globalFilterRaw = useTableStore((s) => s.tableGlobalFilter);
  const setGlobalFilterRaw = useTableStore((s) => s.setTableGlobalFilter);
  const globalFilter = globalFilterRaw;
  const setGlobalFilter = (updaterOrValue: string | ((old: string) => string)) => {
    if (typeof updaterOrValue === 'function') {
      setGlobalFilterRaw(updaterOrValue(globalFilterRaw));
    } else {
      setGlobalFilterRaw(updaterOrValue);
    }
  };
  const [lineageId, setLineageId] = useState<number | null>(null);
  const tagStates = useFilterStore((s) => s.filterTagStates);
  const setTagStates = useFilterStore((s) => s.setFilterTagStates);
  const columnVisibilityRaw = useTableStore((s) => s.tableColumnVisibility);
  const setColumnVisibilityRaw = useTableStore((s) => s.setTableColumnVisibility);
  const columnVisibility = useMemo<VisibilityState>(
    () => ({ ...DEFAULT_COLUMN_VISIBILITY, ...columnVisibilityRaw }),
    [columnVisibilityRaw],
  );
  const setColumnVisibility = (
    updaterOrValue: VisibilityState | ((old: VisibilityState) => VisibilityState),
  ) => {
    if (typeof updaterOrValue === 'function') {
      setColumnVisibilityRaw(updaterOrValue(columnVisibility));
    } else {
      setColumnVisibilityRaw(updaterOrValue);
    }
  };

  // Data Table、筛选导出和 Explorer 共享同一筛选工作区。
  const filterGroups = useFilterStore((s) => s.filterConditionGroups);
  const setFilterGroups = useFilterStore((s) => s.setFilterConditionGroups);
  const legacyFilterGroups = useTableStore((s) => s.tableFilterGroups);
  const setLegacyFilterGroups = useTableStore((s) => s.setTableFilterGroups);
  const legacySelectedTag = useTableStore((s) => s.tableSelectedTag);
  const setLegacySelectedTag = useTableStore((s) => s.setTableSelectedTag);
  // 当前追加目标组（null = 新建组）
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);

  const [pageIndex, setPageIndex] = useState(0);
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const pageSize = 50;

  // One-time upgrade for filters saved by versions that kept Data Table state separately.
  useEffect(() => {
    if (filterGroups.length === 0 && legacyFilterGroups.length > 0) {
      setFilterGroups(legacyFilterGroups.map((group) => ({
        id: group.id,
        conditions: group.conditions.map(migrateTableCondition),
      })));
      setLegacyFilterGroups([]);
    }
    if (Object.keys(tagStates).length === 0 && legacySelectedTag) {
      setTagStates({ [legacySelectedTag]: 'include' });
      setLegacySelectedTag('');
    }
  }, [filterGroups.length, legacyFilterGroups, legacySelectedTag, setFilterGroups, setLegacyFilterGroups, setLegacySelectedTag, setTagStates, tagStates]);

  // 这三个变量要在 numericFilterColumns 之前定义，因为后者依赖它们
  const isVarcomp      = systemInfo?.compositionMode === 'varcomp';
  const hasPareto      = systemInfo?.optimizationType === 'multi';
  const secondObjectiveName = systemInfo?.secondObjectiveName ?? '';
  const hasML          = hasMLProperties(structures);
  const hasFingerprint = structures.some((s) => s.qEntropy > 0);
  const hasVolume      = structures.some((s) => s.volume > 0);
  const hasDensity     = structures.some((s) => s.density > 0);

  // 当前正在编辑的筛选条件（还没点"添加"）
  const [colKind, setColKind] = useState<FilterKind>('numeric');
  const [filterNumCol, setFilterNumCol] = useState('enthalpy');
  const [filterNumOp, setFilterNumOp] = useState<NumericOperator>('gt');
  const [filterNumVal, setFilterNumVal] = useState('');
  const [filterTextCol, setFilterTextCol] = useState<TextFilterField>('formula');
  const [filterTextOp, setFilterTextOp] = useState<TextFilterOperator>('contains');
  const [filterTextInput, setFilterTextInput] = useState('');
  // 体系类型筛选：1=一元, 2=二元, 3=三元, 4=四元
  const [filterNComp, setFilterNComp] = useState<1 | 2 | 3 | 4>(2);
  // 元素摩尔分数筛选
  const [filterElemEl, setFilterElemEl] = useState('');
  const [filterElemOp, setFilterElemOp] = useState<CompOperator>('>');
  const [filterElemVal, setFilterElemVal] = useState('');

  const extraPropKeys = useMemo(() => collectDynamicFieldKeys(structures), [structures]);

  // 所有可选的数字列（从数据里动态判断哪些有值）
  const numericFilterColumns = useMemo(() => {
    // 基础列：永远存在
    const base: { key: string; label: string }[] = [
      { key: 'enthalpy',      label: t('col.enthalpy') },
      { key: 'enthalpyTotal', label: t('col.enthalpyTotal') },
      { key: 'fitness',       label: t('col.fitness') },
      { key: 'spaceGroup', label: t('col.spaceGroup') },
      { key: 'generation', label: t('col.generation') },
    ];
    // 条件列：只在实际有数据时才加入
    if (hasVolume)  base.push({ key: 'volume',  label: t('col.volume') });
    if (hasDensity) base.push({ key: 'density', label: t('col.density') });
    if (isVarcomp) {
      base.push({ key: 'eForm',              label: t('col.eForm') });
      base.push({ key: 'eHullRecons', label: t('col.eHullRecons') });
    }
    if (hasPareto)     base.push({ key: 'paretoFront',       label: t('col.paretoFront') });
    if (hasML) {
      for (const key of ML_FIELD_KEYS) {
        base.push({ key, label: t(ML_FIELD_I18N[key]) });
      }
    }
    if (hasFingerprint) {
      base.push({ key: 'qEntropy', label: t('col.qEntropy') });
      base.push({ key: 'aOrder',   label: t('col.aOrder') });
      base.push({ key: 'sOrder',   label: t('col.sOrder') });
    }
    for (const key of extraPropKeys) base.push({ key, label: t(`col.${key}`) || key });
    return base;
  }, [t, isVarcomp, hasPareto, hasML, hasFingerprint, hasVolume, hasDensity, extraPropKeys]);

  // 文字列：固定两个
  const textFilterColumns: { key: TextFilterField; label: string }[] = useMemo(() => [
    { key: 'formula', label: t('col.formula') },
    { key: 'origin',  label: t('col.origin') },
  ], [t]);

  // 文字列的可选值（从数据里收集所有出现过的值，供用户点选）
  const textColumnOptions = useMemo(() => {
    const formulaSet = new Set(structures.map((s) => s.formula));
    const originSet  = new Set(structures.map((s) => s.origin));
    return {
      formula: Array.from(formulaSet).sort(),
      origin:  Array.from(originSet).sort(),
    };
  }, [structures]);

  const columns = useMemo<ColumnDef<Structure, unknown>[]>(() => {
    const cols: ColumnDef<Structure, unknown>[] = [      {
        id: 'id',
        accessorKey: 'id',
        header: t('col.id'),
        size: 70,
        cell: ({ getValue }) => <span style={{ fontWeight: 600 }}>EA{getValue<number>()}</span>,
      },
      {
        id: 'formula',
        accessorKey: 'formula',
        header: t('col.formula'),
        size: 100,
        cell: ({ getValue }) => <FormulaDisplay formula={getValue<string>()} />,
      },
      {
        id: 'tags',
        accessorFn: (s) => s.tags,
        header: t('col.tags'),
        size: 100,
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <TagPicker
              structureId={s.id}
              currentTags={s.tags}
              allTags={tags}
              onToggle={updateStructureTags}
            />
          );
        },
      },
      {
        id: 'actions',
        header: t('col.actions'),
        size: 140,
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original;
          const isInCompare = compareIds.includes(s.id);
          return (
            <div style={{ display: 'flex', gap: 4 }}>
              {s.poscarData && (
                <button className="btn btn-ghost btn-sm" onClick={() => openViewer(s.id)} title={t('btn.viewStructure')} style={{ padding: '2px 6px' }}>
                  <Eye size={14} />
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => toggleCompare(s.id)} title={isInCompare ? t('compare.removeFromCompare') : t('compare.addToCompare')} style={{ padding: '2px 6px', color: isInCompare ? 'var(--color-primary)' : undefined }}>
                <ArrowLeftRight size={14} />
              </button>
              <NotesEditor structureId={s.id} currentNotes={s.notes} onSave={updateStructureNotes} />
              <button className="btn btn-ghost btn-sm" onClick={() => setLineageId(s.id)} title="查看谱系 / Lineage" style={{ padding: '2px 6px' }}>
                <GitBranch size={14} />
              </button>
            </div>
          );
        },
      },
      {
        id: 'spaceGroup',
        accessorKey: 'spaceGroup',
        header: t('col.spaceGroup'),
        size: 100,
      },
      {
        id: 'generation',
        accessorKey: 'generation',
        header: t('col.generation'),
        size: 100,
      },
      {
        id: 'enthalpy',
        accessorKey: 'enthalpy',
        header: t('col.enthalpy'),
        size: 120,
        cell: ({ row, getValue }) => {
          const v = getValue<number>();
          return row.original.enthalpyTotal > 900 ? '—' : v.toFixed(4);
        },
      },
      {
        id: 'enthalpyTotal',
        accessorKey: 'enthalpyTotal',
        header: t('col.enthalpyTotal'),
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v > 900 ? '—' : v.toFixed(2);
        },
      },
      {
        id: 'fitness',
        accessorFn: s => Number.isFinite(s.fitness) && s.fitness >= 0 ? s.fitness : undefined,
        sortUndefined: 'last',
        header: () => <span title={t(systemInfo?.fitnessSemantics === 'uspex-original' ? 'col.fitnessDesc' : 'hull.legacyFitnessDetail')}>{t('col.fitness')}</span>,
        size: 110,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          // NaN = the run provides no hull distance for this structure.
          if (v == null || !Number.isFinite(v) || v < 0) return '—';
          return (
            <span style={{ color: v === 0 ? 'var(--color-success)' : undefined, fontWeight: v === 0 ? 600 : undefined }}>
              {v.toFixed(4)}
            </span>
          );
        },
      },
      {
        id: 'origin',
        accessorKey: 'origin',
        header: t('col.origin'),
        size: 100,
      },
    ];

    // Volume / Density columns (conditional: hidden when all values are zero, e.g. 2D systems)
    if (hasVolume) {
      cols.push({
        id: 'volume',
        accessorKey: 'volume',
        header: () => <span>{t('col.volume')}</span>,
        size: 120,
        cell: ({ getValue }) => getValue<number>().toFixed(3),
      });
    }
    if (hasDensity) {
      cols.push({
        id: 'density',
        accessorKey: 'density',
        header: () => <span>{t('col.density')}</span>,
        size: 100,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v > 0 ? v.toFixed(3) : '—';
        },
      });
    }

    // eForm / eHullRecons columns (conditional: varcomp only)
    if (isVarcomp) {
      cols.push({
        id: 'eForm',
        accessorFn: s => formationEnergy(s, systemInfo),
        header: () => <span title={t('col.eFormDesc')}>{t('col.eForm')}</span>,
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v == null || !Number.isFinite(v) ? '—' : v.toFixed(4);
        },
      });
      cols.push({
        id: 'eHullRecons',
        accessorKey: 'eHullRecons',
        header: () => <span title={t('col.eHullReconsDesc')}>{t('col.eHullRecons')}</span>,
        size: 130,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return !Number.isFinite(v) || v < 0 ? '—' : v.toFixed(4);
        },
      });
    }

    // Pareto front column (conditional)
    if (hasPareto) {
      cols.push({
        id: 'paretoFront',
        accessorKey: 'paretoFront',
        header: t('col.paretoFront'),
        size: 80,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v >= 0 ? v : '—';
        },
      });
    }

    // Dynamic extraProps columns (second objective from Individuals / Pareto_ranking)
    for (const key of extraPropKeys) {
      // The plain second-objective column (`Property_X`) is defined to be the
      // `Individuals` copy — USPEX stores a larger-is-better objective there
      // negated — so those three columns may show a negative number.  Every other
      // dynamic field keeps the old rule, where a negative value means "absent".
      const isSecondObjectiveColumn = secondObjectiveName !== '' && (
        key === secondObjectiveName ||
        key === `${secondObjectiveName}-Individuals` ||
        key === `${secondObjectiveName}-Pareto_ranking`
      );
      cols.push({
        id: `extra_${key}`,
        accessorFn: (s) => dynamicFieldValue(s, key, secondObjectiveName) ?? Number.NaN,
        header: key,
        size: 150,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          if (isSecondObjectiveColumn) return Number.isFinite(v) ? v.toFixed(4) : '—';
          return v >= 0 ? v.toFixed(4) : '—';
        },
      });
    }

    // ML columns (conditional).  Negative values are real predictions
    // (e.g. negative bulk modulus), so only a non-finite value is "—".
    if (hasML) {
      const mlCell = (decimals: number) => ({ getValue }: { getValue: () => unknown }) => {
        const v = getValue();
        return isMLPropertyValue(v) ? v.toFixed(decimals) : '—';
      };
      cols.push(
        {
          id: 'bulkModulus',
          accessorKey: 'bulkModulus',
          header: t('col.bulk'),
          size: 140,
          cell: mlCell(1),
        },
        {
          id: 'shearModulus',
          accessorKey: 'shearModulus',
          header: t('col.shear'),
          size: 150,
          cell: mlCell(1),
        },
        {
          id: 'youngModulus',
          accessorKey: 'youngModulus',
          header: t('col.young'),
          size: 150,
          cell: mlCell(1),
        },
        {
          id: 'poissonRatio',
          accessorKey: 'poissonRatio',
          header: t('col.poisson'),
          size: 120,
          cell: mlCell(3),
        },
        {
          id: 'pughRatio',
          accessorKey: 'pughRatio',
          header: t('col.pugh'),
          size: 120,
          cell: mlCell(3),
        },
        {
          id: 'vickersHardness',
          accessorKey: 'vickersHardness',
          header: t('col.hardness'),
          size: 160,
          cell: mlCell(2),
        },
        {
          id: 'fractureToughness',
          accessorKey: 'fractureToughness',
          header: t('col.toughness'),
          size: 200,
          cell: mlCell(2),
        },
      );
    }

    // Fingerprint columns (conditional)
    if (hasFingerprint) {
      cols.push({
        id: 'qEntropy',
        accessorKey: 'qEntropy',
        header: t('col.qEntropy'),
        size: 80,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v > 0 ? v.toFixed(3) : '—';
        },
      });
      cols.push({
        id: 'aOrder',
        accessorFn: (s) => s.qEntropy > 0 ? s.aOrder : -1,
        header: t('col.aOrder'),
        size: 80,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v >= 0 ? v.toFixed(3) : '—';
        },
      });
      cols.push({
        id: 'sOrder',
        accessorFn: (s) => s.qEntropy > 0 ? s.sOrder : -1,
        header: t('col.sOrder'),
        size: 80,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v >= 0 ? v.toFixed(3) : '—';
        },
      });
    }
    return cols;
  }, [t, isVarcomp, hasPareto, hasML, hasFingerprint, hasVolume, hasDensity, extraPropKeys, tags, compareIds, openViewer, toggleCompare, systemInfo]);

  const tableData = useMemo(() => {
    const elements = systemInfo?.elements ?? [];
    return structures.filter((structure) => matchesActiveFilter(structure, elements, filterGroups, tagStates));
  }, [structures, filterGroups, tagStates, systemInfo]);

  // 把一个条件追加到目标组（null = 追加到最后一组，或新建）
  const addToGroup = (cond: UnifiedCondition, forceNewGroup = false) => {
    if (forceNewGroup) {
      const newGroup: UnifiedConditionGroup = { id: crypto.randomUUID(), conditions: [cond] };
      setFilterGroups([...filterGroups, newGroup]);
      setTargetGroupId(null);
    } else if (targetGroupId !== null) {
      setFilterGroups(filterGroups.map((g) =>
        g.id === targetGroupId ? { ...g, conditions: [...g.conditions, cond] } : g
      ));
    } else if (filterGroups.length > 0) {
      const last = filterGroups[filterGroups.length - 1];
      setFilterGroups(filterGroups.map((g) =>
        g.id === last.id ? { ...g, conditions: [...g.conditions, cond] } : g
      ));
    } else {
      const newGroup: UnifiedConditionGroup = { id: crypto.randomUUID(), conditions: [cond] };
      setFilterGroups([newGroup]);
    }
  };

  const table = useReactTable({
    data: tableData,
    columns,
    getRowId: (row) => String(row.id),
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const s = row.original;
      const search = String(filterValue).toLowerCase();
      return (
        String(s.id).includes(search) ||
        s.formula.toLowerCase().includes(search) ||
        s.origin.toLowerCase().includes(search) ||
        String(s.spaceGroup).includes(search)
      );
    },
  });

  const rowCount = table.getRowModel().rows.length;
  const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
  const currentPageIndex = Math.min(pageIndex, totalPages - 1);
  const programGeneratedColumns = PROGRAM_GENERATED_COLUMN_IDS
    .map((id) => table.getColumn(id))
    .filter((column): column is NonNullable<typeof column> => column !== undefined);

  useEffect(() => {
    if (pageIndex !== currentPageIndex) {
      setPageIndex(currentPageIndex);
    }
  }, [pageIndex, currentPageIndex]);

  return (
    <div className="fade-in">
    {systemInfo?.fitnessSemantics !== 'uspex-original' &&
      <div role="status" style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-warning)' }}>{t('hull.legacyFitnessDetail')}</div>}

    {/* ===== 工具栏 ===== */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>

      {/* 搜索框 + 结果计数 + hint */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder={t('search')}
            value={globalFilter}
            onChange={(e) => { setGlobalFilter(e.target.value); setPageIndex(0); }}
            style={{
              width: '100%', padding: '6px 12px 6px 30px',
              border: '1px solid var(--color-border)', borderRadius: 6,
              fontSize: 13, background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
            }}
          />
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {rowCount} / {tableData.length}
        </span>
        {programGeneratedColumns.length > 0 && (
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() => setIsColumnPanelOpen((open) => !open)}
            title={t('table.columnsGeneratedHint')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <Columns3 size={14} />
            {t('btn.columns')}
          </button>
        )}
      </div>

      {isColumnPanelOpen && programGeneratedColumns.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '8px 10px',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            background: 'var(--color-surface)',
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--color-text-muted)' }}>{t('table.generatedColumns')}</span>
          {programGeneratedColumns.map((column) => (
            <label
              key={column.id}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
              title={column.id === 'eForm' ? t('col.eFormDesc') : t('col.eHullReconsDesc')}
            >
              <input
                type="checkbox"
                checked={column.getIsVisible()}
                onChange={column.getToggleVisibilityHandler()}
              />
              <span>{column.id === 'eForm' ? t('col.eForm') : t('col.eHullRecons')}</span>
            </label>
          ))}
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setColumnVisibilityRaw({})}
            style={{ fontSize: 11, padding: '2px 8px' }}
          >
            {t('table.columnsReset')}
          </button>
        </div>
      )}

      <UnifiedTagFilter
        t={t}
        tags={tags}
        structures={structures}
        tagStates={tagStates}
        setTagStates={setTagStates}
        compact
        onChanged={() => setPageIndex(0)}
      />

      <DataTableFilterBuilder
        t={t}
        colKind={colKind}
        setColKind={setColKind}
        filterNumCol={filterNumCol}
        setFilterNumCol={setFilterNumCol}
        filterNumOp={filterNumOp}
        setFilterNumOp={setFilterNumOp}
        filterNumVal={filterNumVal}
        setFilterNumVal={setFilterNumVal}
        numericFilterColumns={numericFilterColumns}
        filterTextCol={filterTextCol}
        setFilterTextCol={setFilterTextCol}
        filterTextOp={filterTextOp}
        setFilterTextOp={setFilterTextOp}
        filterTextInput={filterTextInput}
        setFilterTextInput={setFilterTextInput}
        textFilterColumns={textFilterColumns}
        textColumnOptions={textColumnOptions}
        filterNComp={filterNComp}
        setFilterNComp={setFilterNComp}
        filterElemEl={filterElemEl}
        setFilterElemEl={setFilterElemEl}
        filterElemOp={filterElemOp}
        setFilterElemOp={setFilterElemOp}
        filterElemVal={filterElemVal}
        setFilterElemVal={setFilterElemVal}
        elements={systemInfo?.elements ?? []}
        filterGroups={filterGroups}
        setFilterGroups={setFilterGroups}
        targetGroupId={targetGroupId}
        setTargetGroupId={setTargetGroupId}
        addToGroup={addToGroup}
        onResetFilters={() => { setFilterGroups([]); setTargetGroupId(null); setTagStates({}); setGlobalFilter(''); setPageIndex(0); }}
        onFilterChanged={() => setPageIndex(0)}
      />
    </div>

    {/* ===== 表格 ===== */}
    {/*
      overflow: auto  → 让表格可以横向和纵向滚动
      position: relative → 让内部的 sticky 定位生效（sticky 需要一个有滚动的父容器）
    */}
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)', border: '1px solid var(--color-border)', borderRadius: 8, position: 'relative' }}>
      {/*
        tableLayout: 'fixed' → 列宽完全由 th 的 width 决定，不会被内容撑开
        width: table.getTotalSize() → 表格总宽度 = 所有列宽之和，确保横向滚动正确
      */}
      <table
        className="data-table"
        style={{
          borderCollapse: 'separate',
          borderSpacing: 0,
          tableLayout: 'fixed',
          width: table.getTotalSize(),
          minWidth: table.getTotalSize(),
        }}
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header, colIndex) => {
                const isSticky = colIndex < 4;
                const stickyLeft = isSticky
                  ? hg.headers.slice(0, colIndex).reduce((sum, h) => sum + h.getSize(), 0)
                  : undefined;
                // 列宽：同时设 width / minWidth / maxWidth，配合 tableLayout: fixed 才能精确控制
                const colWidth = header.getSize();
                const headerLabel = typeof header.column.columnDef.header === 'string'
                  ? header.column.columnDef.header
                  : undefined;

                return (
                  <th
                    key={header.id}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    style={{
                      width: colWidth,
                      minWidth: colWidth,
                      maxWidth: colWidth,
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      position: isSticky ? 'sticky' : undefined,
                      left: stickyLeft,
                      zIndex: isSticky ? 3 : 1,
                      background: 'var(--color-surface)',
                      borderRight: colIndex === 3 ? '2px solid var(--color-border)' : undefined,
                    }}
                    title={headerLabel}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      {header.column.getCanSort() && (
                        <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                          <SortIcon sorted={header.column.getIsSorted()} />
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {!ready && (
            <TableSkeletonRows columns={table.getVisibleLeafColumns().length} />
          )}
          {ready && table.getRowModel().rows
            .slice(currentPageIndex * pageSize, (currentPageIndex + 1) * pageSize)
            .map((row) => (
            <tr key={row.original.id}>
              {row.getVisibleCells().map((cell, colIndex) => {
                const isSticky = colIndex < 4;
                const stickyLeft = isSticky
                  ? row.getVisibleCells().slice(0, colIndex).reduce((sum, c) => sum + c.column.getSize(), 0)
                  : undefined;
                const colWidth = cell.column.getSize();

                return (
                  <td
                    key={cell.id}
                    style={{
                      width: colWidth,
                      minWidth: colWidth,
                      maxWidth: colWidth,
                      // overflow: hidden 配合 tableLayout: fixed，防止内容撑开列宽
                      overflow: 'hidden',
                      position: isSticky ? 'sticky' : undefined,
                      left: stickyLeft,
                      zIndex: isSticky ? 2 : undefined,
                      background: 'var(--color-bg)',
                      borderRight: colIndex === 3 ? '2px solid var(--color-border)' : undefined,
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* 分页控制 */}
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 13 }}>
      <button className="btn btn-outline btn-sm" onClick={() => setPageIndex(0)} disabled={currentPageIndex === 0}>{t('table.first')}</button>
      <button className="btn btn-outline btn-sm" onClick={() => setPageIndex((p) => Math.max(0, p - 1))} disabled={currentPageIndex === 0}>{t('table.prev')}</button>
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {t('table.page')} {currentPageIndex + 1} {t('table.of')} {totalPages}
      </span>
      <button className="btn btn-outline btn-sm" onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPageIndex >= totalPages - 1}>{t('table.next')}</button>
      <button className="btn btn-outline btn-sm" onClick={() => setPageIndex(totalPages - 1)} disabled={currentPageIndex >= totalPages - 1}>{t('table.last')}</button>
    </div>

    {/* 谱系面板（点击谱系按钮后弹出） */}
    {lineageId !== null && (() => {
      const target = structures.find((s) => s.id === lineageId);
      if (!target) return null;
      return (
        <LineagePanel
          structure={target}
          allStructures={structures}
          systemInfo={systemInfo!}
          onClose={() => setLineageId(null)}
          onSelect={(id) => setLineageId(id)}
          onViewStructure={openViewer}
        />
      );
    })()}

    </div>
  );
}
