import { useState, useMemo, useRef, useEffect } from 'react';
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
interface FilterCondition {
  column: string;
  label: string;
  operator: '>' | '<' | '>=' | '<=' | '=';
  value: number;
}


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
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (tagId: string) => {
    const next = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId];
    onToggle(structureId, next);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* 已选标签 + 点击区域 */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', gap: 4, flexWrap: 'wrap', cursor: 'pointer',
          minHeight: 24, alignItems: 'center', padding: '2px 4px',
          borderRadius: 4, border: '1px solid transparent',
        }}
        title="点击编辑标签"
      >
        {currentTags.length === 0 && (
          <Tag size={12} style={{ opacity: 0.3 }} />
        )}
        {currentTags.map((tagId) => {
          const tag = allTags.find((t) => t.id === tagId);
          if (!tag) return null;
          return (
            <span
              key={tagId}
              className="tag-badge"
              style={{ background: `${tag.color}20`, color: tag.color, fontSize: 11 }}
            >
              {t(tag.nameKey)}
            </span>
          );
        })}
      </div>

      {/* 下拉框 */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 8, padding: 6, minWidth: 160,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {allTags.map((tag) => {
            const checked = currentTags.includes(tag.id);
            return (
              <label
                key={tag.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                  fontSize: 12, color: 'var(--color-text)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(tag.id)}
                  style={{ accentColor: tag.color }}
                />
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: tag.color, flexShrink: 0,
                }} />
                {t(tag.nameKey)}
              </label>
            );
          })}
        </div>
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onSave(structureId, text);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, text, structureId, onSave]);

  if (!open) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => { setText(currentNotes); setOpen(true); }}
        title={currentNotes || '添加备注'}
        style={{
          padding: '2px 6px',
          color: currentNotes ? 'var(--color-primary)' : undefined,
        }}
      >
        <MessageSquare size={14} />
      </button>
    );
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', right: 0, top: '100%', zIndex: 50,
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 8, padding: 10, width: 240,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>EA{structureId} 备注</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { onSave(structureId, text); setOpen(false); }}
          style={{ padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="写点备注..."
        rows={3}
        style={{
          width: '100%', padding: 8, borderRadius: 6, fontSize: 12,
          border: '1px solid var(--color-border)', resize: 'vertical',
          background: 'var(--color-bg)', color: 'var(--color-text)',
          boxSizing: 'border-box', outline: 'none',
        }}
      />
    </div>
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

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [lineageId, setLineageId] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>('');  
    // 筛选条件列表
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  // 正在编辑的筛选条件
  const [filterCol, setFilterCol] = useState('enthalpy');
  const [filterOp, setFilterOp] = useState<FilterCondition['operator']>('>');
  const [filterVal, setFilterVal] = useState('');

  // 可以筛选的数值列
  const filterableColumns = useMemo(() => [
    { key: 'enthalpy', label: t('col.enthalpy') },
    { key: 'fitness', label: t('col.fitness') },
    { key: 'volume', label: t('col.volume') },
    { key: 'density', label: t('col.density') },
    { key: 'spaceGroup', label: t('col.spaceGroup') },
    { key: 'generation', label: t('col.generation') },
  ], [t]);

  const [pageIndex, setPageIndex] = useState(0);               
  const pageSize = 50; 

  const hasPareto = systemInfo?.optimizationType === 'multi';
  const hasML = structures.some((s) => s.youngModulus != null && s.youngModulus > 0);
  const hasFingerprint = structures.some((s) => s.qEntropy != null && s.qEntropy > 0);

  const columns = useMemo<ColumnDef<Structure, unknown>[]>(() => {
    const cols: ColumnDef<Structure, unknown>[] = [
      {
        accessorKey: 'id',
        header: t('col.id'),
        size: 70,
        cell: ({ getValue }) => <span style={{ fontWeight: 600 }}>EA{getValue<number>()}</span>,
      },
      { accessorKey: 'formula', header: t('col.formula'), size: 100 },
      {
          accessorKey: 'tags',
          header: t('col.tags'),
          size: 120,
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
        // ★ Actions 第二个
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
                <div style={{ position: 'relative' }}>
                  <NotesEditor structureId={s.id} currentNotes={s.notes} onSave={updateStructureNotes} />
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setLineageId(s.id)} title="查看谱系 / Lineage" style={{ padding: '2px 6px' }}>
                  <GitBranch size={14} />
                </button>
              </div>
            );
          },
        },
      { accessorKey: 'spaceGroup', header: t('col.spaceGroup'), size: 60 },
      { accessorKey: 'generation', header: t('col.generation'), size: 60 },
      {
        accessorKey: 'enthalpy',
        header: t('col.enthalpy'),
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v > 900 ? '—' : v.toFixed(4);
        },
      },
      {
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
        accessorKey: 'volume',
        header: t('col.volume'),
        size: 100,
        cell: ({ getValue }) => getValue<number>().toFixed(3),
      },
      {
        accessorKey: 'density',
        header: t('col.density'),
        size: 90,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return v > 0 ? v.toFixed(3) : '—';
        },
      },
      { accessorKey: 'origin', header: t('col.origin'), size: 100 },
    ];

    // Pareto columns (conditional)
    if (hasPareto) {
      cols.push({
        accessorKey: 'paretoFront',
        header: t('col.paretoFront'),
        size: 80,
        cell: ({ getValue }) => getValue<number | undefined>() ?? '—',
      });
      cols.push({
        accessorKey: 'secondObjective',
        header: systemInfo?.secondObjectiveName || t('col.secondObj'),
        size: 120,
        cell: ({ getValue }) => {
          const v = getValue<number | undefined>();
          return v != null ? v.toFixed(3) : '—';
        },
      });
    }

    // ML columns (conditional)
    if (hasML) {
      cols.push({
        accessorKey: 'youngModulus',
        header: t('col.young'),
        size: 110,
        cell: ({ getValue }) => {
          const v = getValue<number | undefined>();
          return v != null && v > 0 ? v.toFixed(1) : '—';
        },
      });
      cols.push({
        accessorKey: 'bulkModulus',
        header: t('col.bulk'),
        size: 100,
        cell: ({ getValue }) => {
          const v = getValue<number | undefined>();
          return v != null && v > 0 ? v.toFixed(1) : '—';
        },
      });
    }

    // Fingerprint columns (conditional)
    if (hasFingerprint) {
      cols.push({
        accessorKey: 'qEntropy',
        header: t('col.qEntropy'),
        size: 80,
        cell: ({ getValue }) => {
          const v = getValue<number | undefined>();
          return v != null ? v.toFixed(3) : '—';
        },
      });
      cols.push({
        accessorKey: 'aOrder',
        header: t('col.aOrder'),
        size: 80,
        cell: ({ getValue }) => {
          const v = getValue<number | undefined>();
          return v != null ? v.toFixed(3) : '—';
        },
      });
      cols.push({
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
  }, [t, hasPareto, hasML, hasFingerprint, systemInfo, tags, compareIds, openViewer, toggleCompare]);

  // 按标签过滤
  // 按标签 + 数值条件过滤
  const tableData = useMemo(() => {
    let data = structures;

    // 标签筛选
    if (selectedTag) {
      data = data.filter((s) => s.tags.includes(selectedTag));
    }

    // 数值筛选
    for (const f of filters) {
      data = data.filter((s) => {
        const val = (s as unknown as Record<string, number>)[f.column];
        if (val == null) return false;
        switch (f.operator) {
          case '>': return val > f.value;
          case '<': return val < f.value;
          case '>=': return val >= f.value;
          case '<=': return val <= f.value;
          case '=': return Math.abs(val - f.value) < 0.0001;
          default: return true;
        }
      });
    }

    return data;
  }, [structures, selectedTag, filters]);


  // 当筛选条件变化时重置页码
  const filteredCount = tableData.length;
  const totalPages = Math.ceil(filteredCount / pageSize);

  const table = useReactTable({
    data: tableData,
    columns,
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

  return (
    <div className="fade-in">

    {/* Toolbar */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
      {/* 搜索 + 计数 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder={t('search')}
            value={globalFilter}
            onChange={(e) => { setGlobalFilter(e.target.value); setPageIndex(0); }}
            style={{
              width: '100%',
              padding: '6px 12px 6px 30px',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              fontSize: 13,
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              outline: 'none',
            }}
          />
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {table.getRowModel().rows.length} / {tableData.length}
        </span>
      </div>

      {/* 标签筛选 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>标签:</span>
        <button
          className={`btn btn-sm ${!selectedTag ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => { setSelectedTag(''); setPageIndex(0); }}
          style={{ fontSize: 11, padding: '2px 8px' }}
        >
          全部
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
                fontSize: 11,
                padding: '2px 8px',
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
      {/* 数值筛选 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>筛选 Filter:</span>

        {/* 选列 */}
        <select
          value={filterCol}
          onChange={(e) => setFilterCol(e.target.value)}
          style={{
            padding: '3px 6px', fontSize: 12, borderRadius: 4,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)', color: 'var(--color-text)',
          }}
        >
          {filterableColumns.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>

        {/* 选运算符 */}
        <select
          value={filterOp}
          onChange={(e) => setFilterOp(e.target.value as FilterCondition['operator'])}
          style={{
            padding: '3px 6px', fontSize: 12, borderRadius: 4,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)', color: 'var(--color-text)',
            width: 50,
          }}
        >
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
          <option value=">=">&ge;</option>
          <option value="<=">&le;</option>
          <option value="=">=</option>
        </select>

        {/* 输入数值 */}
        <input
          type="number"
          value={filterVal}
          onChange={(e) => setFilterVal(e.target.value)}
          placeholder="数值"
          style={{
            padding: '3px 6px', fontSize: 12, borderRadius: 4,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)', color: 'var(--color-text)',
            width: 80,
          }}
        />

        {/* 添加按钮 */}
        <button
          className="btn btn-sm btn-primary"
          style={{ fontSize: 11, padding: '3px 10px' }}
          onClick={() => {
            if (filterVal === '') return;
            const col = filterableColumns.find((c) => c.key === filterCol);
            setFilters((prev) => [...prev, {
              column: filterCol,
              label: col?.label || filterCol,
              operator: filterOp,
              value: Number(filterVal),
            }]);
            setFilterVal('');
            setPageIndex(0);
          }}
        >
          添加 Add
        </button>

        {/* 重置按钮 */}
        {filters.length > 0 && (
          <button
            className="btn btn-sm btn-outline"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={() => { setFilters([]); setSelectedTag(''); setGlobalFilter(''); setPageIndex(0); }}
          >
            重置 Reset
          </button>
        )}
      </div>

      {/* 已激活的筛选条件（小标签） */}
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
              {f.label} {f.operator} {f.value}
              <X
                size={12}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setFilters((prev) => prev.filter((_, idx) => idx !== i));
                  setPageIndex(0);
                }}
              />
            </span>
          ))}
        </div>
      )}  
    </div>


      {/* Table */}
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 180px)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    style={{ width: header.getSize(), cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <SortIcon sorted={header.column.getIsSorted()} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows
              .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
              .map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        gap: 12, marginTop: 12, fontSize: 13,
      }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setPageIndex(0)}
          disabled={pageIndex === 0}
        >
          首页
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
          disabled={pageIndex === 0}
        >
          上一页
        </button>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          第 {pageIndex + 1} / {Math.max(1, Math.ceil(table.getRowModel().rows.length / pageSize))} 页
        </span>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setPageIndex((p) => p + 1)}
          disabled={(pageIndex + 1) * pageSize >= table.getRowModel().rows.length}
        >
          下一页
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setPageIndex(Math.ceil(table.getRowModel().rows.length / pageSize) - 1)}
          disabled={(pageIndex + 1) * pageSize >= table.getRowModel().rows.length}
        >
          末页
        </button>
      </div>

      {/* ↓ 谱系面板加在这里 ↓ */}
      {lineageId !== null && (() => {
        const target = structures.find((s) => s.id === lineageId);
        if (!target) return null;
        return (
          <LineagePanel
            structure={target}
            allStructures={structures}
            onClose={() => setLineageId(null)}
            onSelect={(id) => setLineageId(id)}
          />
        );
      })()}

    </div>   // ← 最外层的 </div>，不要动它
  );
}
