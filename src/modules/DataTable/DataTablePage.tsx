import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowUpDown, ArrowUp, ArrowDown, Search, Eye, GitBranch, ArrowLeftRight, Tag, MessageSquare, X,
} from 'lucide-react';
import { LineagePanel } from './LineagePanel';
import type { Structure } from '@/types/structure';

// 数字列：支持 > < >= <= = 运算符
type NumericFilterColumn = 'enthalpy' | 'fitness' | 'volume' | 'density' | 'spaceGroup' | 'generation'
  | 'paretoFront' | 'bulkModulus' | 'shearModulus' | 'youngModulus' | 'poissonRatio'
  | 'pughRatio' | 'vickersHardness' | 'fractureToughness' | 'qEntropy' | 'aOrder' | 'sOrder';

// 文字列：支持"包含"和"不包含"，可多选值
type TextFilterColumn = 'formula' | 'origin';

// 数字筛选条件的数据结构
interface NumericFilterCondition {
  kind: 'numeric';
  column: NumericFilterColumn;
  label: string;
  operator: '>' | '<' | '>=' | '<=' | '=';
  value: number;
}

// 文字筛选条件的数据结构
// values 是一个数组，因为可以同时选多个值（比如选多个 origin）
interface TextFilterCondition {
  kind: 'text';
  column: TextFilterColumn;
  label: string;
  operator: 'contains' | 'notContains' | 'equals' | 'notEquals';
  values: string[];  // 多选的值列表
}

// 两种条件合并成一个联合类型，方便统一存储
type FilterCondition = NumericFilterCondition | TextFilterCondition;


function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />;
  if (sorted === 'asc') return <ArrowUp size={12} />;
  return <ArrowDown size={12} />;
}

function TagPicker({
  structureId,
  currentTags,
  allTags,
  onToggle,
}: {
  structureId: number;
  currentTags: string[];
  allTags: { id: string; nameKey: string; color: string }[];
  onToggle: (id: number, tags: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // pos 是下拉框的最终显示位置，初始值在 handleOpen 里计算，之后由视口矫正 useEffect 微调
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // 点击外部关闭：同时排除 triggerRef 和 dropdownRef 内部的点击
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger  = triggerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 视口边界矫正：下拉框渲染后，检查是否超出屏幕边缘，超出则调整位置
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 每次只做最小幅度的矫正，避免抖动
    setPos((prev) => {
      let { top, left } = prev;
      // 右侧溢出：左移，让下拉框右边缘贴住视口右边缘（留 8px 间距）
      if (rect.right > vw - 8) left = left - (rect.right - vw + 8);
      // 底部溢出：向上弹出，让下拉框出现在触发按钮上方
      if (rect.bottom > vh - 8 && triggerRef.current) {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        top = triggerRect.top - rect.height - 4;
      }
      // 左侧溢出（矫正过头了）：贴住左边缘
      if (left < 8) left = 8;
      return { top, left };
    });
  }, [open]);

  const toggle = (tagId: string) => {
    const next = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId];
    onToggle(structureId, next);
  };

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // 初始位置：触发按钮正下方，左对齐
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={triggerRef}>
      {/* 已选标签 + 点击区域 */}
      <div
        onClick={handleOpen}
        style={{
          display: 'flex', gap: 4, flexWrap: 'wrap', cursor: 'pointer',
          minHeight: 24, alignItems: 'center', padding: '2px 4px',
          borderRadius: 4, border: '1px solid transparent',
        }}
        title="点击编辑标签"
      >
        {currentTags.length === 0 && <Tag size={12} style={{ opacity: 0.3 }} />}
        {currentTags.map((tagId) => {
          const tag = allTags.find((t) => t.id === tagId);
          if (!tag) return null;
          return (
            <span key={tagId} className="tag-badge"
              style={{ background: `${tag.color}20`, color: tag.color, fontSize: 11 }}>
              {t(tag.nameKey)}
            </span>
          );
        })}
      </div>

      {/* 下拉框：portal 到 body，视口矫正后显示 */}
      {open && createPortal(
        <div ref={dropdownRef} style={{
          position: 'fixed', top: pos.top, left: pos.left,
          zIndex: 9999,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 8, padding: 6, minWidth: 160,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {allTags.map((tag) => {
            const checked = currentTags.includes(tag.id);
            return (
              <label key={tag.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                fontSize: 12, color: 'var(--color-text)',
              }}>
                <input type="checkbox" checked={checked}
                  onChange={() => toggle(tag.id)} style={{ accentColor: tag.color }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%',
                  background: tag.color, flexShrink: 0 }} />
                {t(tag.nameKey)}
              </label>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

/** 备注编辑弹出框 */
function NotesEditor({
  structureId,
  currentNotes,
  onSave,
}: {
  structureId: number;
  currentNotes: string;
  onSave: (id: number, notes: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(currentNotes);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  // 点击外部时保存并关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const outsidePopup   = popupRef.current   && !popupRef.current.contains(target);
      const outsideTrigger = triggerRef.current && !triggerRef.current.contains(target);
      if (outsidePopup && outsideTrigger) {
        onSave(structureId, text);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, text, structureId, onSave]);

  // 视口边界矫正：弹框渲染后检查是否超出底部，超出则改为向上弹出
  useEffect(() => {
    if (!open || !popupRef.current || !triggerRef.current) return;
    const popupRect   = popupRef.current.getBoundingClientRect();
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    if (popupRect.bottom > vh - 8) {
      // 底部溢出：改为在触发按钮上方弹出
      setPos((prev) => ({
        ...prev,
        top: triggerRect.top - popupRect.height - 4,
      }));
    }
  }, [open]);

  const handleOpen = () => {
    setText(currentNotes);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // 初始位置：按钮正下方，右对齐到按钮右边缘
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="btn btn-ghost btn-sm"
        onClick={handleOpen}
        title={currentNotes || '添加备注'}
        style={{ padding: '2px 6px', color: currentNotes ? 'var(--color-primary)' : undefined }}
      >
        <MessageSquare size={14} />
      </button>

      {open && createPortal(
        <div ref={popupRef} style={{
          position: 'fixed', top: pos.top, right: pos.right,
          zIndex: 9999,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 8, padding: 10, width: 240,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>EA{structureId} 备注</span>
            <button className="btn btn-ghost btn-sm"
              onClick={() => { onSave(structureId, text); setOpen(false); }}
              style={{ padding: 2 }}>
              <X size={14} />
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="写点备注..."
            rows={3}
            autoFocus
            style={{
              width: '100%', padding: 8, borderRadius: 6, fontSize: 12,
              border: '1px solid var(--color-border)', resize: 'vertical',
              background: 'var(--color-bg)', color: 'var(--color-text)',
              boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
}

export function DataTablePage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const tags = useProjectStore((s) => s.tags);
  const updateStructureTags = useProjectStore((s) => s.updateStructureTags);
  const updateStructureNotes = useProjectStore((s) => s.updateStructureNotes);
  const openViewer = useUIStore((s) => s.openViewer);
  const toggleCompare = useUIStore((s) => s.toggleCompare);
  const compareIds = useUIStore((s) => s.compareIds);

  // 排序状态从 UIStore 读取，切换页面后不会丢失
  const sortingRaw    = useUIStore((s) => s.tableSorting) as SortingState;
  const setSortingRaw = useUIStore((s) => s.setTableSorting);
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
  const [globalFilter, setGlobalFilter] = useState('');
  const [lineageId, setLineageId] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [filters, setFilters] = useState<FilterCondition[]>([]);

  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 50;

  // 这三个变量要在 numericFilterColumns 之前定义，因为后者依赖它们
  const hasPareto     = systemInfo?.optimizationType === 'multi';
  const hasML         = structures.some((s) => s.bulkModulus != null);
  const hasFingerprint = structures.some((s) => s.qEntropy != null && s.qEntropy > 0);

  // 当前正在编辑的筛选条件（还没点"添加"）
  // colKind 区分当前选的列是数字列还是文字列
  const [colKind, setColKind] = useState<'numeric' | 'text'>('numeric');
  const [filterNumCol, setFilterNumCol] = useState<NumericFilterColumn>('enthalpy');
  const [filterNumOp, setFilterNumOp] = useState<NumericFilterCondition['operator']>('>');
  const [filterNumVal, setFilterNumVal] = useState('');
  const [filterTextCol, setFilterTextCol] = useState<TextFilterColumn>('formula');
  const [filterTextOp, setFilterTextOp] = useState<TextFilterCondition['operator']>('contains');
  // 文字筛选的输入框（单行输入，回车或逗号分隔多个值）
  const [filterTextInput, setFilterTextInput] = useState('');

  // 所有可选的数字列（从数据里动态判断哪些有值）
  const numericFilterColumns = useMemo(() => {
    // 基础列：永远存在
    const base: { key: NumericFilterColumn; label: string }[] = [
      { key: 'enthalpy',   label: t('col.enthalpy') },
      { key: 'fitness',    label: t('col.fitness') },
      { key: 'volume',     label: t('col.volume') },
      { key: 'density',    label: t('col.density') },
      { key: 'spaceGroup', label: t('col.spaceGroup') },
      { key: 'generation', label: t('col.generation') },
    ];
    // 条件列：只有数据里有这个字段才加进来
    if (hasPareto)     base.push({ key: 'paretoFront',       label: t('col.paretoFront') });
    if (hasML) {
      base.push({ key: 'bulkModulus',       label: t('col.bulk') });
      base.push({ key: 'shearModulus',      label: t('col.shear') });
      base.push({ key: 'youngModulus',      label: t('col.young') });
      base.push({ key: 'poissonRatio',      label: t('col.poisson') });
      base.push({ key: 'pughRatio',         label: t('col.pugh') });
      base.push({ key: 'vickersHardness',   label: t('col.hardness') });
      base.push({ key: 'fractureToughness', label: t('col.toughness') });
    }
    if (hasFingerprint) {
      base.push({ key: 'qEntropy', label: t('col.qEntropy') });
      base.push({ key: 'aOrder',   label: t('col.aOrder') });
      base.push({ key: 'sOrder',   label: t('col.sOrder') });
    }
    return base;
  }, [t, hasPareto, hasML, hasFingerprint]);

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

  // Collect all extraProps keys present in data
  const extraPropKeys = useMemo(() => {
    const keys = new Set<string>();
    structures.forEach((s) => {
      if (s.extraProps) Object.keys(s.extraProps).forEach((k) => keys.add(k));
    });
    return Array.from(keys).sort();
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
      },
      {
        id: 'tags',
        accessorFn: (s) => s.tags,
        header: t('col.tags'),
        size: 80,
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
        size: 100,
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
        size: 60,
      },
      {
        id: 'generation',
        accessorKey: 'generation',
        header: t('col.generation'),
        size: 60,
      },
      {
        id: 'enthalpy',
        accessorKey: 'enthalpy',
        header: t('col.enthalpy'),
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v > 900 ? '—' : v.toFixed(4);
        },
      },
      {
        id: 'fitness',
        accessorKey: 'fitness',
        header: t('col.fitness'),
        size: 110,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          if (v < 0) return '—';
          return (
            <span style={{ color: v === 0 ? 'var(--color-success)' : undefined, fontWeight: v === 0 ? 600 : undefined }}>
              {v.toFixed(4)}
            </span>
          );
        },
      },
      {
        id: 'volume',
        accessorKey: 'volume',
        header: t('col.volume'),
        size: 100,
        cell: ({ getValue }) => getValue<number>().toFixed(3),
      },
      {
        id: 'density',
        accessorKey: 'density',
        header: t('col.density'),
        size: 90,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v > 0 ? v.toFixed(3) : '—';
        },
      },
      {
        id: 'origin',
        accessorKey: 'origin',
        header: t('col.origin'),
        size: 100,
      },
    ];

    // Pareto front column (conditional)
    if (hasPareto) {
      cols.push({
        id: 'paretoFront',
        accessorKey: 'paretoFront',
        header: t('col.paretoFront'),
        size: 80,
        cell: ({ getValue }) => getValue<number | undefined>() ?? '—',
      });
    }

    // Dynamic extraProps columns (second objective from Individuals / Pareto_ranking)
    for (const key of extraPropKeys) {
      cols.push({
        id: `extra_${key}`,
        accessorFn: (s) => s.extraProps?.[key],
        header: key,
        size: 150,
        cell: ({ getValue }) => {
          const v = getValue<number | undefined>();
          return v != null ? v.toFixed(4) : '—';
        },
      });
    }

    // ML columns (conditional)
    if (hasML) {
      cols.push(
        {
          id: 'bulkModulus',
          accessorKey: 'bulkModulus',
          header: 'Bulk Modulus (GPa)',
          size: 140,
          cell: ({ getValue }) => { const v = getValue<number | undefined>(); return v != null ? v.toFixed(1) : '—'; },
        },
        {
          id: 'shearModulus',
          accessorKey: 'shearModulus',
          header: 'Shear Modulus (GPa)',
          size: 150,
          cell: ({ getValue }) => { const v = getValue<number | undefined>(); return v != null ? v.toFixed(1) : '—'; },
        },
        {
          id: 'youngModulus',
          accessorKey: 'youngModulus',
          header: 'Young Modulus (GPa)',
          size: 150,
          cell: ({ getValue }) => { const v = getValue<number | undefined>(); return v != null ? v.toFixed(1) : '—'; },
        },
        {
          id: 'poissonRatio',
          accessorKey: 'poissonRatio',
          header: 'Poisson Ratio',
          size: 120,
          cell: ({ getValue }) => { const v = getValue<number | undefined>(); return v != null ? v.toFixed(3) : '—'; },
        },
        {
          id: 'pughRatio',
          accessorKey: 'pughRatio',
          header: 'Pugh Ratio (G/K)',
          size: 120,
          cell: ({ getValue }) => { const v = getValue<number | undefined>(); return v != null ? v.toFixed(3) : '—'; },
        },
        {
          id: 'vickersHardness',
          accessorKey: 'vickersHardness',
          header: 'Vickers Hardness (GPa)',
          size: 160,
          cell: ({ getValue }) => { const v = getValue<number | undefined>(); return v != null ? v.toFixed(2) : '—'; },
        },
        {
          id: 'fractureToughness',
          accessorKey: 'fractureToughness',
          header: 'Fracture Toughness (MPa·m^½)',
          size: 200,
          cell: ({ getValue }) => { const v = getValue<number | undefined>(); return v != null ? v.toFixed(2) : '—'; },
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
          const v = getValue<number | undefined>();
          return v != null ? v.toFixed(3) : '—';
        },
      });
      cols.push({
        id: 'aOrder',
        accessorKey: 'aOrder',
        header: t('col.aOrder'),
        size: 80,
        cell: ({ getValue }) => {
          const v = getValue<number | undefined>();
          return v != null ? v.toFixed(3) : '—';
        },
      });
      cols.push({
        id: 'sOrder',
        accessorKey: 'sOrder',
        header: t('col.sOrder'),
        size: 80,
        cell: ({ getValue }) => {
          const v = getValue<number | undefined>();
          return v != null ? v.toFixed(3) : '—';
        },
      });
    }
    return cols;
  }, [t, hasPareto, hasML, hasFingerprint, extraPropKeys, tags, compareIds, openViewer, toggleCompare]);

  const tableData = useMemo(() => {
    let data = structures;

    // 标签筛选
    if (selectedTag) {
      data = data.filter((s) => s.tags.includes(selectedTag));
    }

    // 遍历所有筛选条件，逐一过滤
    for (const f of filters) {
      if (f.kind === 'numeric') {
        // 数字条件：读取对应字段的数值，用运算符比较
        data = data.filter((s) => {
          const val = (s as unknown as Record<string, number>)[f.column];
          if (val == null) return false;
          switch (f.operator) {
            case '>':  return val > f.value;
            case '<':  return val < f.value;
            case '>=': return val >= f.value;
            case '<=': return val <= f.value;
            case '=':  return Math.abs(val - f.value) < 0.0001;
            default:   return true;
          }
        });
      } else {
        // 文字条件：读取对应字段的文字，检查是否包含/等于 values 里的任意一个
        data = data.filter((s) => {
          const val = String((s as unknown as Record<string, unknown>)[f.column] ?? '').toLowerCase();
          // 检查 val 是否匹配 values 里的任意一个（只要匹配一个就算）
          const matchesAny = f.values.some((v) => {
            const target = v.toLowerCase();
            if (f.operator === 'contains' || f.operator === 'notContains') {
              return val.includes(target);
            } else {
              // equals / notEquals：精确匹配
              return val === target;
            }
          });
          // contains/equals：匹配到就保留；notContains/notEquals：匹配到就排除
          return (f.operator === 'contains' || f.operator === 'equals') ? matchesAny : !matchesAny;
        });
      }
    }

    return data;
  }, [structures, selectedTag, filters]);

  const table = useReactTable({
    data: tableData,
    columns,
    getRowId: (row) => String(row.id),
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
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

  useEffect(() => {
    if (pageIndex !== currentPageIndex) {
      setPageIndex(currentPageIndex);
    }
  }, [pageIndex, currentPageIndex]);

  return (
    <div className="fade-in">

    {/* ===== 工具栏 ===== */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>

      {/* 搜索框 + 结果计数 */}
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
      </div>

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

      {/* 筛选条件构建行 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('table.filterLabel')}</span>

        {/* 切换数字列 / 文字列 */}
        <select
          value={colKind}
          onChange={(e) => setColKind(e.target.value as 'numeric' | 'text')}
          style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          <option value="numeric"># {t('col.enthalpy').split(' ')[0]}...</option>
          <option value="text">Aa {t('col.formula')}/{t('col.origin')}</option>
        </select>

        {colKind === 'numeric' ? (
          <>
            {/* 数字列选择 */}
            <select
              value={filterNumCol}
              onChange={(e) => setFilterNumCol(e.target.value as NumericFilterColumn)}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              {numericFilterColumns.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            {/* 运算符 */}
            <select
              value={filterNumOp}
              onChange={(e) => setFilterNumOp(e.target.value as NumericFilterCondition['operator'])}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', width: 50 }}
            >
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&ge;</option>
              <option value="<=">&le;</option>
              <option value="=">=</option>
            </select>
            {/* 数值输入 */}
            <input
              type="number"
              value={filterNumVal}
              onChange={(e) => setFilterNumVal(e.target.value)}
              placeholder={t('table.filterPlaceholder')}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', width: 80 }}
            />
            <button
              className="btn btn-sm btn-primary"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => {
                if (filterNumVal === '') return;
                const col = numericFilterColumns.find((c) => c.key === filterNumCol);
                setFilters((prev) => [...prev, {
                  kind: 'numeric',
                  column: filterNumCol,
                  label: col?.label || filterNumCol,
                  operator: filterNumOp,
                  value: Number(filterNumVal),
                }]);
                setFilterNumVal('');
                setPageIndex(0);
              }}
            >
              {t('btn.addFilter')}
            </button>
          </>
        ) : (
          <>
            {/* 文字列选择 */}
            <select
              value={filterTextCol}
              onChange={(e) => setFilterTextCol(e.target.value as TextFilterColumn)}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              {textFilterColumns.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            {/* 文字运算符 */}
            <select
              value={filterTextOp}
              onChange={(e) => setFilterTextOp(e.target.value as TextFilterCondition['operator'])}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="contains">{t('table.filterContains')}</option>
              <option value="notContains">{t('table.filterNotContains')}</option>
              <option value="equals">{t('table.filterEquals')}</option>
              <option value="notEquals">{t('table.filterNotEquals')}</option>
            </select>
            {/* 可选值下拉（多选） */}
            <select
              multiple
              size={3}
              value={filterTextInput.split(',').filter(Boolean)}
              onChange={(e) => {
                // 把所有选中的 option 的 value 用逗号拼起来
                const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                setFilterTextInput(selected.join(','));
              }}
              style={{
                padding: '2px 4px', fontSize: 11, borderRadius: 4,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)', color: 'var(--color-text)',
                minWidth: 120, maxWidth: 200,
              }}
            >
              {textColumnOptions[filterTextCol].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button
              className="btn btn-sm btn-primary"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => {
                const values = filterTextInput.split(',').filter(Boolean);
                if (values.length === 0) return;
                const col = textFilterColumns.find((c) => c.key === filterTextCol);
                setFilters((prev) => [...prev, {
                  kind: 'text',
                  column: filterTextCol,
                  label: col?.label || filterTextCol,
                  operator: filterTextOp,
                  values,
                }]);
                setFilterTextInput('');
                setPageIndex(0);
              }}
            >
              {t('btn.addFilter')}
            </button>
          </>
        )}

        {/* 重置按钮：有任何筛选条件时才显示 */}
        {filters.length > 0 && (
          <button
            className="btn btn-sm btn-outline"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setFilters([]); setSelectedTag(''); setGlobalFilter(''); setPageIndex(0); }}
          >
            {t('btn.resetFilter')}
          </button>
        )}
      </div>

      {/* 已激活的筛选条件（小标签，点 × 可单独删除） */}
      {filters.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filters.map((f, i) => (
            <span
              key={i}
              style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                background: 'var(--color-primary)', color: '#fff',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {/* 数字条件显示：列名 运算符 数值 */}
              {f.kind === 'numeric'
                ? `${f.label} ${f.operator} ${f.value}`
                : `${f.label} ${t(`table.filter${f.operator.charAt(0).toUpperCase() + f.operator.slice(1)}`)} [${f.values.join(', ')}]`
              }
              <X
                size={12}
                style={{ cursor: 'pointer' }}
                onClick={() => { setFilters((prev) => prev.filter((_, idx) => idx !== i)); setPageIndex(0); }}
              />
            </span>
          ))}
        </div>
      )}
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
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <SortIcon sorted={header.column.getIsSorted()} />}
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
