import { useState, useMemo } from 'react';
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
  ArrowUpDown, ArrowUp, ArrowDown, Search, Eye, GitBranch, ArrowLeftRight, Tag,
} from 'lucide-react';
import type { Structure } from '@/types/structure';

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />;
  if (sorted === 'asc') return <ArrowUp size={12} />;
  return <ArrowDown size={12} />;
}

export function DataTablePage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const tags = useProjectStore((s) => s.tags);
  const updateStructureTags = useProjectStore((s) => s.updateStructureTags);
  const openViewer = useUIStore((s) => s.openViewer);
  const toggleCompare = useUIStore((s) => s.toggleCompare);
  const compareIds = useUIStore((s) => s.compareIds);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

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

    // Tags
    cols.push({
      accessorKey: 'tags',
      header: t('col.tags'),
      size: 120,
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {s.tags.map((tagId) => {
              const tag = tags.find((t) => t.id === tagId);
              if (!tag) return null;
              return (
                <span
                  key={tagId}
                  className="tag-badge"
                  style={{ background: `${tag.color}20`, color: tag.color }}
                >
                  {t(tag.nameKey)}
                </span>
              );
            })}
          </div>
        );
      },
    });

    // Actions
    cols.push({
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
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => openViewer(s.id)}
                title={t('btn.viewStructure')}
                style={{ padding: '2px 6px' }}
              >
                <Eye size={14} />
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => toggleCompare(s.id)}
              title={isInCompare ? t('compare.removeFromCompare') : t('compare.addToCompare')}
              style={{
                padding: '2px 6px',
                color: isInCompare ? 'var(--color-primary)' : undefined,
              }}
            >
              <ArrowLeftRight size={14} />
            </button>
          </div>
        );
      },
    });

    return cols;
  }, [t, hasPareto, hasML, hasFingerprint, systemInfo, tags, compareIds, openViewer, toggleCompare]);

  const table = useReactTable({
    data: structures,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder={t('search')}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
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
          {table.getFilteredRowModel().rows.length} / {structures.length}
        </span>
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
            {table.getRowModel().rows.map((row) => (
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
    </div>
  );
}
