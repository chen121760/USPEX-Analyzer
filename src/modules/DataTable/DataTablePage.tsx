import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useCompareStore } from '@/store/useCompareStore';
import { useTableStore } from '@/store/useTableStore';
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
import { DataTableFilterBuilder } from './components/DataTableFilterBuilder';
import { FormulaDisplay } from '@/components/FormulaDisplay';
import { ML_FIELD_KEYS, ML_FIELD_I18N } from '@/lib/constants';
import { collectDynamicFieldKeys } from '@/domain/structure/dynamicFields';
import type {
  Structure,
  NumericFilterColumn,
  TextFilterColumn,
  NumericFilterCondition,
  TextFilterCondition,
  ElementFractionFilterCondition,
  TableFilterCondition,
  TableFilterGroup,
} from '@/types/structure';

// 本地别名，保持组件内部代码不变
type FilterCondition = TableFilterCondition;

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  eForm: false,
  eHullRecons: false,
};

const PROGRAM_GENERATED_COLUMN_IDS = ['eForm', 'eHullRecons'] as const;

export function DataTablePage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
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
  const selectedTag = useTableStore((s) => s.tableSelectedTag);
  const setSelectedTag = useTableStore((s) => s.setTableSelectedTag);
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

  // 筛选条件组接入 TableStore，切换页面后不丢失
  const filterGroups    = useTableStore((s) => s.tableFilterGroups);
  const setFilterGroups = useTableStore((s) => s.setTableFilterGroups);
  // 当前追加目标组（null = 新建组）
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);

  const [pageIndex, setPageIndex] = useState(0);
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const pageSize = 50;

  // 这三个变量要在 numericFilterColumns 之前定义，因为后者依赖它们
  const isVarcomp      = systemInfo?.compositionMode === 'varcomp';
  const hasPareto      = systemInfo?.optimizationType === 'multi';
  const hasML          = structures.some((s) => s.bulkModulus >= 0);
  const hasFingerprint = structures.some((s) => s.qEntropy > 0);
  const hasVolume      = structures.some((s) => s.volume > 0);
  const hasDensity     = structures.some((s) => s.density > 0);

  // Columns where -1 is the sentinel for "no data"
  const SENTINEL_COLS = useMemo(() => new Set([
    'paretoFront', 'eForm', 'eHullRecons',
    ...ML_FIELD_KEYS,
    'aOrder', 'sOrder',
  ]), []);

  // 当前正在编辑的筛选条件（还没点"添加"）
  const [colKind, setColKind] = useState<'numeric' | 'text' | 'nComponents' | 'elementFraction'>('numeric');
  const [filterNumCol, setFilterNumCol] = useState<NumericFilterColumn>('enthalpy');
  const [filterNumOp, setFilterNumOp] = useState<NumericFilterCondition['operator']>('>');
  const [filterNumVal, setFilterNumVal] = useState('');
  const [filterTextCol, setFilterTextCol] = useState<TextFilterColumn>('formula');
  const [filterTextOp, setFilterTextOp] = useState<TextFilterCondition['operator']>('contains');
  const [filterTextInput, setFilterTextInput] = useState('');
  // 体系类型筛选：1=一元, 2=二元, 3=三元
  const [filterNComp, setFilterNComp] = useState<1 | 2 | 3>(2);
  // 元素摩尔分数筛选
  const [filterElemEl, setFilterElemEl] = useState('');
  const [filterElemOp, setFilterElemOp] = useState<ElementFractionFilterCondition['operator']>('>');
  const [filterElemVal, setFilterElemVal] = useState('');

  // 所有可选的数字列（从数据里动态判断哪些有值）
  const numericFilterColumns = useMemo(() => {
    // 基础列：永远存在
    const base: { key: NumericFilterColumn; label: string }[] = [
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
    return base;
  }, [t, isVarcomp, hasPareto, hasML, hasFingerprint, hasVolume, hasDensity]);

  // 文字列：固定两个
  const textFilterColumns: { key: TextFilterColumn; label: string }[] = useMemo(() => [
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

  const extraPropKeys = useMemo(() => collectDynamicFieldKeys(structures), [structures]);

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
        accessorKey: 'fitness',
        header: t('col.fitness'),
        size: 110,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          if (v == null || v < 0) return '—';
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
        accessorKey: 'eForm',
        header: () => <span title={t('col.eFormDesc')}>{t('col.eForm')}</span>,
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v === -1 ? '—' : v.toFixed(4);
        },
      });
      cols.push({
        id: 'eHullRecons',
        accessorKey: 'eHullRecons',
        header: () => <span title={t('col.eHullReconsDesc')}>{t('col.eHullRecons')}</span>,
        size: 130,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v === -1 ? '—' : v.toFixed(4);
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
      cols.push({
        id: `extra_${key}`,
        accessorFn: (s) => s.extraProps?.[key] ?? -1,
        header: key,
        size: 150,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v >= 0 ? v.toFixed(4) : '—';
        },
      });
    }

    // ML columns (conditional)
    if (hasML) {
      cols.push(
        {
          id: 'bulkModulus',
          accessorKey: 'bulkModulus',
          header: t('col.bulk'),
          size: 140,
          cell: ({ getValue }) => { const v = getValue<number>(); return v >= 0 ? v.toFixed(1) : '—'; },
        },
        {
          id: 'shearModulus',
          accessorKey: 'shearModulus',
          header: t('col.shear'),
          size: 150,
          cell: ({ getValue }) => { const v = getValue<number>(); return v >= 0 ? v.toFixed(1) : '—'; },
        },
        {
          id: 'youngModulus',
          accessorKey: 'youngModulus',
          header: t('col.young'),
          size: 150,
          cell: ({ getValue }) => { const v = getValue<number>(); return v >= 0 ? v.toFixed(1) : '—'; },
        },
        {
          id: 'poissonRatio',
          accessorKey: 'poissonRatio',
          header: t('col.poisson'),
          size: 120,
          cell: ({ getValue }) => { const v = getValue<number>(); return v >= 0 ? v.toFixed(3) : '—'; },
        },
        {
          id: 'pughRatio',
          accessorKey: 'pughRatio',
          header: t('col.pugh'),
          size: 120,
          cell: ({ getValue }) => { const v = getValue<number>(); return v >= 0 ? v.toFixed(3) : '—'; },
        },
        {
          id: 'vickersHardness',
          accessorKey: 'vickersHardness',
          header: t('col.hardness'),
          size: 160,
          cell: ({ getValue }) => { const v = getValue<number>(); return v >= 0 ? v.toFixed(2) : '—'; },
        },
        {
          id: 'fractureToughness',
          accessorKey: 'fractureToughness',
          header: t('col.toughness'),
          size: 200,
          cell: ({ getValue }) => { const v = getValue<number>(); return v >= 0 ? v.toFixed(2) : '—'; },
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
  }, [t, isVarcomp, hasPareto, hasML, hasFingerprint, hasVolume, hasDensity, extraPropKeys, tags, compareIds, openViewer, toggleCompare]);

  const tableData = useMemo(() => {
    let data = structures;

    // 标签筛选
    if (selectedTag) {
      data = data.filter((s) => s.tags.includes(selectedTag));
    }

    // 条件组：组间 OR，组内 AND
    if (filterGroups.length > 0) {
      data = data.filter((s) =>
        filterGroups.some((group) =>
          group.conditions.every((f) => {
            if (f.kind === 'numeric') {
              const val = (s as unknown as Record<string, number>)[f.column];
              if (val == null) return false;
              // Sentinel -1 means "no data" for these fields — exclude from numeric filters
              if (val === -1 && SENTINEL_COLS.has(f.column)) return false;
              switch (f.operator) {
                case '>':  return val > f.value;
                case '<':  return val < f.value;
                case '>=': return val >= f.value;
                case '<=': return val <= f.value;
                case '=':  return Math.abs(val - f.value) < 0.0001;
                default:   return true;
              }
            } else if (f.kind === 'text') {
              const val = String((s as unknown as Record<string, unknown>)[f.column] ?? '').toLowerCase();
              const matchesAny = f.values.some((v) => {
                const target = v.toLowerCase();
                return (f.operator === 'contains' || f.operator === 'notContains')
                  ? val.includes(target) : val === target;
              });
              return (f.operator === 'contains' || f.operator === 'equals') ? matchesAny : !matchesAny;
            } else if (f.kind === 'nComponents') {
              return s.composition.filter((c) => c > 0).length === f.value;
            } else if (f.kind === 'elementFraction') {
              const elIdx = systemInfo?.elements.indexOf(f.element) ?? -1;
              if (elIdx === -1) return true;
              const total = s.composition.reduce((a, b) => a + b, 0);
              if (total === 0) return false;
              const frac = s.composition[elIdx] / total;
              switch (f.operator) {
                case '>':  return frac > f.value;
                case '<':  return frac < f.value;
                case '>=': return frac >= f.value;
                case '<=': return frac <= f.value;
                case '=':  return Math.abs(frac - f.value) < 0.001;
                default:   return true;
              }
            }
            return true;
          })
        )
      );
    }

    return data;
  }, [structures, selectedTag, filterGroups, systemInfo]);

  // 把一个条件追加到目标组（null = 追加到最后一组，或新建）
  const addToGroup = (cond: FilterCondition, forceNewGroup = false) => {
    if (forceNewGroup) {
      const newGroup: TableFilterGroup = { id: crypto.randomUUID(), conditions: [cond] };
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
      const newGroup: TableFilterGroup = { id: crypto.randomUUID(), conditions: [cond] };
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

      {/* 标签筛选行 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('table.tagLabel')}</span>
        <button
          className={`btn btn-sm ${!selectedTag ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => { setSelectedTag(''); setPageIndex(0); }}
          style={{ fontSize: 11, padding: '2px 8px' }}
        >
          {t('btn.all')}
        </button>
        {tags.map((tag) => {
          const count = structures.filter((s) => s.tags.includes(tag.id)).length;
          if (count === 0) return null;
          return (
            <button
              key={tag.id}
              className={`btn btn-sm ${selectedTag === tag.id ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => { setSelectedTag(selectedTag === tag.id ? '' : tag.id); setPageIndex(0); }}
              style={{
                fontSize: 11, padding: '2px 8px',
                borderColor: tag.color,
                color: selectedTag === tag.id ? '#fff' : tag.color,
                background: selectedTag === tag.id ? tag.color : 'transparent',
              }}
            >
              {t(tag.nameKey)} ({count})
            </button>
          );
        })}
      </div>

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
        onResetFilters={() => { setFilterGroups([]); setTargetGroupId(null); setSelectedTag(''); setGlobalFilter(''); setPageIndex(0); }}
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
          {table.getRowModel().rows
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
