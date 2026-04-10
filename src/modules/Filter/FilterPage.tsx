import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { X, Plus, Download } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { buildSeedsFile } from '@/lib/poscarWriter';
import type { Structure, FilterCondition } from '@/types/structure';


const NUMERIC_FIELDS = [
  'fitness', 'enthalpy', 'volume', 'density', 'spaceGroup', 'generation',
  'youngModulus', 'bulkModulus', 'shearModulus', 'poissonRatio',
  'vickersHardness', 'fractureToughness', 'qEntropy', 'aOrder', 'sOrder',
  'paretoFront', 'secondObjective',
];

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;

function toSortableNumber(value: unknown): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function applyCondition(s: Structure, cond: FilterCondition): boolean {
  const val = (s as unknown as Record<string, unknown>)[cond.field];
  if (val == null) return false;

  const num = Number(val);
  if (isNaN(num)) return false;
  const target = Number(cond.value);

  switch (cond.operator) {
    case 'eq': return num === target;
    case 'neq': return num !== target;
    case 'gt': return num > target;
    case 'gte': return num >= target;
    case 'lt': return num < target;
    case 'lte': return num <= target;
    case 'contains': return String(val).toLowerCase().includes(String(cond.value).toLowerCase());
    default: return true;
  }
}

function applyAllConditions(s: Structure, conditions: FilterCondition[]): boolean {
  return conditions.every((c) => applyCondition(s, c));
}

function buildFilename(
  index: number,
  s: Structure,
  nameParts: number[],
  padding: number,
  prefix: string,
): string {
  const segments: string[] = [];

  for (const part of nameParts) {
    switch (part) {
      case 1: segments.push(String(index + 1).padStart(padding, '0')); break;
      case 2: segments.push(`EA${s.id}`); break;
      case 3: segments.push(`SG${s.spaceGroup}`); break;
      case 4: segments.push(`Ed${s.fitness >= 0 ? s.fitness.toFixed(4) : 'NA'}`); break;
      case 5: {
        const paretoVal = s.extraProps
          ? Object.entries(s.extraProps).find(([k]) => k.endsWith('-Pareto_ranking'))?.[1]
          : undefined;
        segments.push(`${prefix}${paretoVal != null ? paretoVal.toFixed(1) : 'NA'}`);
        break;
      }
      case 6: segments.push(s.formula || 'Unknown'); break;
    }
  }

  return segments.join('-') + '.vasp';
}

export function FilterPage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const tags = useProjectStore((s) => s.tags);

  const [conditions, setConditions] = useState<FilterCondition[]>([
    { field: 'fitness', operator: 'lte', value: 0.1 },
  ]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);


  const [exportFormat, setExportFormat] = useState<'zip' | 'seeds' | 'csv' | 'json'>('zip');
  const [nameParts, setNameParts] = useState<number[]>([1, 2, 6, 3]);
  const [sortKey, setSortKey] = useState('fitness');
  const [sortReverse, setSortReverse] = useState(false);
  const [secondObjPrefix] = useState('Obj');

  const addCondition = () => {
    setConditions([...conditions, { field: 'spaceGroup', operator: 'gte', value: 1 }]);
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, key: keyof FilterCondition, value: unknown) => {
    const updated = [...conditions];
    (updated[idx] as unknown as Record<string, unknown>)[key] = value;
    setConditions(updated);
  };

  const filteredStructures = useMemo(() => {
    let result = structures;

    // 标签包含过滤：结构必须含有所有选中的标签
    if (selectedTags.length > 0) {
      result = result.filter((s) =>
        selectedTags.every((tagId) => s.tags.includes(tagId))
      );
    }

    // 标签排除过滤：含有任一排除标签的结构被移除
    if (excludedTags.length > 0) {
      result = result.filter((s) =>
        excludedTags.every((tagId) => !s.tags.includes(tagId))
      );
    }

    // 数值条件过滤
    if (conditions.length > 0) {
      result = result.filter((s) => applyAllConditions(s, conditions));
    }

    return result;
  }, [structures, conditions, selectedTags]);


  // Sort
  const sortedStructures = useMemo(() => {
    const sorted = [...filteredStructures].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      const na = toSortableNumber(av);
      const nb = toSortableNumber(bv);
      return na - nb;
    });
    return sortReverse ? sorted.reverse() : sorted;
  }, [filteredStructures, sortKey, sortReverse]);

  // Export handler
  const handleExport = useCallback(async () => {
    if (sortedStructures.length === 0) return;

    const padding = String(sortedStructures.length).length;

    if (exportFormat === 'zip') {
      const zip = new JSZip();
      sortedStructures.forEach((s, i) => {
        if (!s.poscarData) return;
        const fname = buildFilename(i, s, nameParts, padding, secondObjPrefix);
        zip.file(fname, s.poscarData);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `uspex-structures-${sortedStructures.length}.zip`);
    } else if (exportFormat === 'seeds') {
      const content = buildSeedsFile(sortedStructures);
      const blob = new Blob([content], { type: 'text/plain' });
      saveAs(blob, 'seeds.txt');
    } else if (exportFormat === 'csv') {
      const fmtVal = (v: number) => v < 900 ? v.toFixed(4) : '';
      const headers = ['ID', 'Formula', 'SpaceGroup', 'Generation', 'Enthalpy', 'Volume', 'Fitness', 'Density', 'Origin'];
      const rows = sortedStructures.map((s) =>
        [s.id, s.formula, s.spaceGroup, s.generation, fmtVal(s.enthalpy), fmtVal(s.volume), fmtVal(s.fitness), fmtVal(s.density), s.origin].join(','),
      );
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      saveAs(blob, 'structures.csv');
    } else if (exportFormat === 'json') {
      const project = useProjectStore.getState().exportProjectFile();
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
      saveAs(blob, `uspex-project-${systemInfo?.elements.join('-') ?? 'data'}.json`);
    }
  }, [sortedStructures, exportFormat, nameParts, secondObjPrefix, systemInfo]);

  const toggleNamePart = (part: number) => {
    setNameParts((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part].sort(),
    );
  };

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    fontSize: 12,
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  };

  const inputStyle: React.CSSProperties = {
    ...selectStyle,
    width: 100,
  };

  // Preview filename
  const previewName = sortedStructures.length > 0
    ? buildFilename(0, sortedStructures[0], nameParts, String(sortedStructures.length).length, secondObjPrefix)
    : '001-EA2-Ti10H28-SG82.vasp';

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('filter.title')}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left: Filter conditions */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            {t('filter.conditions')}
          </h3>

    {/* 标签筛选 */}
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        按标签筛选 / Filter by Tag
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tags.map((tag) => {
          const isSelected = selectedTags.includes(tag.id);
          const count = structures.filter((s) => s.tags.includes(tag.id)).length;
          return (
            <button
              key={tag.id}
              className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => {
                setSelectedTags((prev) =>
                  isSelected ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]
                );
              }}
              style={{
                borderColor: tag.color,
                color: isSelected ? '#fff' : tag.color,
                background: isSelected ? tag.color : 'transparent',
              }}
            >
              {t(tag.nameKey)} ({count})
            </button>
          );
        })}
        {selectedTags.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedTags([])}
            style={{ fontSize: 11 }}
          >
            清除 / Clear
          </button>
        )}
      </div>
    </div>

    {/* 标签排除 */}
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        排除标签 / Exclude by Tag
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tags.map((tag) => {
          const isExcluded = excludedTags.includes(tag.id);
          const count = structures.filter((s) => s.tags.includes(tag.id)).length;
          return (
            <button
              key={tag.id}
              className="btn btn-sm"
              onClick={() => {
                setExcludedTags((prev) =>
                  isExcluded ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]
                );
              }}
              style={{
                borderColor: tag.color,
                color: isExcluded ? '#fff' : tag.color,
                background: isExcluded ? tag.color : 'transparent',
                border: `1px solid ${tag.color}`,
                textDecoration: isExcluded ? 'line-through' : 'none',
                opacity: isExcluded ? 0.75 : 1,
              }}
            >
              {t(tag.nameKey)} ({count})
            </button>
          );
        })}
        {excludedTags.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExcludedTags([])}
            style={{ fontSize: 11 }}
          >
            清除 / Clear
          </button>
        )}
      </div>
    </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conditions.map((cond, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {idx > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 28 }}>AND</span>}
                {idx === 0 && <span style={{ minWidth: 28 }} />}

                <select
                  value={cond.field}
                  onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                  style={selectStyle}
                >
                  {NUMERIC_FIELDS.map((f) => (
                    <option key={f} value={f}>{t(`col.${f}`) || f}</option>
                  ))}
                </select>

                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                  style={selectStyle}
                >
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>{t(`op.${op}`)}</option>
                  ))}
                </select>

                <input
                  type="number"
                  step="any"
                  value={String(cond.value)}
                  onChange={(e) => updateCondition(idx, 'value', Number(e.target.value))}
                  style={inputStyle}
                />

                <button className="btn btn-ghost btn-sm" onClick={() => removeCondition(idx)}>
                  <X size={14} />
                </button>
              </div>
            ))}

            <button className="btn btn-outline btn-sm" onClick={addCondition} style={{ alignSelf: 'flex-start' }}>
              <Plus size={14} />
              {t('btn.addCondition')}
            </button>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 10,
              borderRadius: 6,
              background: filteredStructures.length > 0 ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
              fontSize: 13,
              fontWeight: 600,
              color: filteredStructures.length > 0 ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          >
            {filteredStructures.length > 0
              ? t('filter.matchCount', { count: filteredStructures.length })
              : t('filter.noMatch')}
          </div>
        </div>

        {/* Right: Export options */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            {t('export.title')}
          </h3>

          {/* Format */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {t('export.format')}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['zip', 'seeds', 'csv', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  className={`btn btn-sm ${exportFormat === fmt ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setExportFormat(fmt)}
                >
                  {t(`export.format${fmt.charAt(0).toUpperCase() + fmt.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Naming (only for zip) */}
          {exportFormat === 'zip' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {t('export.naming')}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  [1, t('export.nameParts.index')],
                  [2, t('export.nameParts.id')],
                  [3, t('export.nameParts.sg')],
                  [4, t('export.nameParts.fitness')],
                  [5, t('export.nameParts.secondObj')],
                  [6, t('export.nameParts.formula')],
                ] as [number, string][]).map(([n, label]) => (
                  <button
                    key={n}
                    className={`btn btn-sm ${nameParts.includes(n) ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => toggleNamePart(n)}
                  >
                    [{n}] {label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>
                {t('export.preview')}: <code style={{ background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>{previewName}</code>
              </div>
            </div>
          )}

          {/* Sort */}
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t('export.sortBy')}:</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={selectStyle}>
              {NUMERIC_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setSortReverse(!sortReverse)}
            >
              {sortReverse ? t('export.descending') : t('export.ascending')}
            </button>
          </div>

          {/* Export button */}
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={filteredStructures.length === 0}
            style={{
              width: '100%',
              padding: '10px 20px',
              fontSize: 14,
              opacity: filteredStructures.length > 0 ? 1 : 0.4,
            }}
          >
            <Download size={16} />
            {t('export.exportCount', { count: filteredStructures.length })}
          </button>
        </div>
      </div>

      {/* Preview table */}
      {sortedStructures.length > 0 && (
        <div className="card" style={{ marginTop: 16, maxHeight: 300, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ID</th>
                <th>{t('col.formula')}</th>
                <th>SG</th>
                <th>{t('col.enthalpy')}</th>
                <th>{t('col.fitness')}</th>
                <th>{t('col.origin')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedStructures.slice(0, 50).map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>EA{s.id}</td>
                  <td>{s.formula}</td>
                  <td>{s.spaceGroup}</td>
                  <td>{s.enthalpy < 900 ? s.enthalpy.toFixed(4) : '—'}</td>
                  <td>{s.fitness >= 0 ? s.fitness.toFixed(4) : '—'}</td>
                  <td>{s.origin}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedStructures.length > 50 && (
            <div style={{ padding: 8, textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>
              ... and {sortedStructures.length - 50} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
