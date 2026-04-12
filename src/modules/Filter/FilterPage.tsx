import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { X, Plus, Download } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { buildSeedsFile } from '@/lib/poscarWriter';
import { FormulaDisplay } from '@/components/FormulaDisplay';
import type { Structure } from '@/types/structure';

// ── 统一筛选条件类型 ──────────────────────────────────────────
type NumericOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
type CompOperator = '>' | '<' | '>=' | '<=' | '=';

type UnifiedCondition =
  | { kind: 'numeric'; field: string; operator: NumericOperator; value: number }
  | { kind: 'nComponents'; value: 1 | 2 | 3 }
  | { kind: 'elementFraction'; element: string; operator: CompOperator; value: number };

// ── 数值字段列表 ──────────────────────────────────────────────
const NUMERIC_FIELDS = [
  'fitness', 'enthalpy', 'volume', 'density', 'spaceGroup', 'generation',
  'youngModulus', 'bulkModulus', 'shearModulus', 'poissonRatio',
  'vickersHardness', 'fractureToughness', 'qEntropy', 'aOrder', 'sOrder',
  'paretoFront',
];

const NUMERIC_OPS: NumericOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
const COMP_OPS: CompOperator[] = ['>', '>=', '<', '<=', '='];

// ── 辅助函数 ──────────────────────────────────────────────────
function toSortableNumber(value: unknown): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function applyCondition(s: Structure, cond: UnifiedCondition, elements: string[]): boolean {
  if (cond.kind === 'numeric') {
    const val = (s as unknown as Record<string, unknown>)[cond.field];
    if (val == null) return false;
    const num = Number(val);
    if (isNaN(num)) return false;
    const target = cond.value;
    switch (cond.operator) {
      case 'eq':  return num === target;
      case 'neq': return num !== target;
      case 'gt':  return num > target;
      case 'gte': return num >= target;
      case 'lt':  return num < target;
      case 'lte': return num <= target;
    }
  }
  if (cond.kind === 'nComponents') {
    return s.composition.filter((c) => c > 0).length === cond.value;
  }
  if (cond.kind === 'elementFraction') {
    const elIdx = elements.indexOf(cond.element);
    if (elIdx === -1) return true;
    const total = s.composition.reduce((a, b) => a + b, 0);
    if (total === 0) return false;
    const frac = s.composition[elIdx] / total;
    switch (cond.operator) {
      case '>':  return frac > cond.value;
      case '<':  return frac < cond.value;
      case '>=': return frac >= cond.value;
      case '<=': return frac <= cond.value;
      case '=':  return Math.abs(frac - cond.value) < 0.001;
    }
  }
  return true;
}

function conditionLabel(cond: UnifiedCondition, t: (k: string) => string): string {
  if (cond.kind === 'numeric') {
    const opLabel: Record<NumericOperator, string> = {
      gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠',
    };
    return `${t(`col.${cond.field}`) || cond.field} ${opLabel[cond.operator]} ${cond.value}`;
  }
  if (cond.kind === 'nComponents') {
    return ({ 1: t('table.filterUnary'), 2: t('table.filterBinary'), 3: t('table.filterTernary') })[cond.value];
  }
  return `x(${cond.element}) ${cond.operator} ${cond.value}`;
}

function buildFilename(index: number, s: Structure, nameParts: number[], padding: number, prefix: string): string {
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

// ── 主组件 ────────────────────────────────────────────────────
export function FilterPage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const tags = useProjectStore((s) => s.tags);
  const elements = systemInfo?.elements ?? [];

  const tagStates       = useUIStore((s) => s.filterTagStates);
  const setTagStates    = useUIStore((s) => s.setFilterTagStates);
  const exportFormat    = useUIStore((s) => s.filterExportFormat);
  const setExportFormat = useUIStore((s) => s.setFilterExportFormat);
  const nameParts       = useUIStore((s) => s.filterNameParts);
  const setNameParts    = useUIStore((s) => s.setFilterNameParts);
  const sortKey         = useUIStore((s) => s.filterSortKey);
  const setSortKey      = useUIStore((s) => s.setFilterSortKey);
  const sortReverse     = useUIStore((s) => s.filterSortReverse);
  const setSortReverse  = useUIStore((s) => s.setFilterSortReverse);

  const secondObjPrefix = 'Obj';

  // 统一条件列表
  const [conditions, setConditions] = useState<UnifiedCondition[]>([]);

  // 条件构建器的临时状态
  const [condKind, setCondKind] = useState<'numeric' | 'nComponents' | 'elementFraction'>('numeric');
  const [numField, setNumField] = useState(NUMERIC_FIELDS[0]);
  const [numOp, setNumOp] = useState<NumericOperator>('lte');
  const [numVal, setNumVal] = useState('');
  const [nComp, setNComp] = useState<1 | 2 | 3>(2);
  const [elemEl, setElemEl] = useState('');
  const [elemOp, setElemOp] = useState<CompOperator>('>');
  const [elemVal, setElemVal] = useState('');

  // 标签三态切换
  const handleTagClick = (tagId: string) => {
    const cur = tagStates[tagId];
    if (cur === undefined) {
      setTagStates({ ...tagStates, [tagId]: 'include' });
    } else if (cur === 'include') {
      setTagStates({ ...tagStates, [tagId]: 'exclude' });
    } else {
      const next = { ...tagStates };
      delete next[tagId];
      setTagStates(next);
    }
  };

  // 添加条件
  const addCondition = () => {
    if (condKind === 'numeric') {
      if (numVal === '') return;
      setConditions((prev) => [...prev, { kind: 'numeric', field: numField, operator: numOp, value: Number(numVal) }]);
      setNumVal('');
    } else if (condKind === 'nComponents') {
      setConditions((prev) => [...prev, { kind: 'nComponents', value: nComp }]);
    } else {
      if (!elemEl || elemVal === '') return;
      setConditions((prev) => [...prev, { kind: 'elementFraction', element: elemEl, operator: elemOp, value: Number(elemVal) }]);
      setElemVal('');
    }
  };

  // 过滤逻辑
  const filteredStructures = useMemo(() => {
    let result = structures;

    const includedTagIds = Object.entries(tagStates).filter(([, s]) => s === 'include').map(([id]) => id);
    const excludedTagIds = Object.entries(tagStates).filter(([, s]) => s === 'exclude').map(([id]) => id);
    if (includedTagIds.length > 0) result = result.filter((s) => includedTagIds.every((id) => s.tags.includes(id)));
    if (excludedTagIds.length > 0) result = result.filter((s) => excludedTagIds.every((id) => !s.tags.includes(id)));

    for (const cond of conditions) {
      result = result.filter((s) => applyCondition(s, cond, elements));
    }
    return result;
  }, [structures, tagStates, conditions, elements]);

  // 排序
  const sortedStructures = useMemo(() => {
    const sorted = [...filteredStructures].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      return toSortableNumber(av) - toSortableNumber(bv);
    });
    return sortReverse ? sorted.reverse() : sorted;
  }, [filteredStructures, sortKey, sortReverse]);

  // 导出
  const handleExport = useCallback(async () => {
    if (sortedStructures.length === 0) return;
    const padding = String(sortedStructures.length).length;
    if (exportFormat === 'zip') {
      const zip = new JSZip();
      sortedStructures.forEach((s, i) => {
        if (!s.poscarData) return;
        zip.file(buildFilename(i, s, nameParts, padding, secondObjPrefix), s.poscarData);
      });
      saveAs(await zip.generateAsync({ type: 'blob' }), `uspex-structures-${sortedStructures.length}.zip`);
    } else if (exportFormat === 'seeds') {
      saveAs(new Blob([buildSeedsFile(sortedStructures)], { type: 'text/plain' }), 'seeds.txt');
    } else if (exportFormat === 'csv') {
      const fmtVal = (v: number) => v < 900 ? v.toFixed(4) : '';
      const headers = ['ID', 'Formula', 'SpaceGroup', 'Generation', 'Enthalpy', 'Volume', 'Fitness', 'Density', 'Origin'];
      const rows = sortedStructures.map((s) =>
        [s.id, s.formula, s.spaceGroup, s.generation, fmtVal(s.enthalpy), fmtVal(s.volume), fmtVal(s.fitness), fmtVal(s.density), s.origin].join(','),
      );
      saveAs(new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' }), 'structures.csv');
    } else if (exportFormat === 'json') {
      const project = useProjectStore.getState().exportProjectFile();
      saveAs(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `uspex-project-${systemInfo?.elements.join('-') ?? 'data'}.json`);
    }
  }, [sortedStructures, exportFormat, nameParts, secondObjPrefix, systemInfo]);

  const toggleNamePart = (part: number) => {
    setNameParts(nameParts.includes(part) ? nameParts.filter((p) => p !== part) : [...nameParts, part].sort());
  };

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 6,
    fontSize: 12, background: 'var(--color-bg)', color: 'var(--color-text)',
  };
  const inputStyle: React.CSSProperties = { ...selectStyle, width: 100 };

  const previewName = sortedStructures.length > 0
    ? buildFilename(0, sortedStructures[0], nameParts, String(sortedStructures.length).length, secondObjPrefix)
    : '001-EA2-Ti10H28-SG82.vasp';

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('filter.title')}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* ── 左：筛选条件 ── */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t('filter.conditions')}</h3>

          {/* 标签筛选 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t('filter.tagFilter')}</span>
              {Object.keys(tagStates).length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setTagStates({})} style={{ fontSize: 11 }}>
                  {t('filter.clearTags')}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>{t('filter.tagFilterHint')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tags.map((tag) => {
                const state = tagStates[tag.id];
                const count = structures.filter((s) => s.tags.includes(tag.id)).length;
                return (
                  <button key={tag.id} className="btn btn-sm" onClick={() => handleTagClick(tag.id)} style={{
                    border: `1px solid ${state === 'exclude' ? '#ef4444' : tag.color}`,
                    color: state ? '#fff' : tag.color,
                    background: state === 'include' ? tag.color : state === 'exclude' ? '#ef4444' : 'transparent',
                    textDecoration: state === 'exclude' ? 'line-through' : 'none',
                    transition: 'all 0.15s',
                  }}>
                    {state === 'include' ? '✓ ' : state === 'exclude' ? '✗ ' : ''}{t(tag.nameKey)} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* 条件构建：第一行类型选择，第二行具体条件 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {/* 第一行：类型下拉 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                {t('table.filterLabel')}
              </span>
              <select value={condKind} onChange={(e) => setCondKind(e.target.value as typeof condKind)} style={selectStyle}>
                <option value="numeric">{t('table.filterNumeric')}</option>
                <option value="nComponents">{t('table.filterNComponents')}</option>
                <option value="elementFraction">{t('table.filterElemFraction')}</option>
              </select>
            </div>

            {/* 第二行：具体条件控件 + 添加按钮 */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {condKind === 'numeric' && <>
                <select value={numField} onChange={(e) => setNumField(e.target.value)} style={selectStyle}>
                  {NUMERIC_FIELDS.map((f) => <option key={f} value={f}>{t(`col.${f}`) || f}</option>)}
                </select>
                <select value={numOp} onChange={(e) => setNumOp(e.target.value as NumericOperator)} style={{ ...selectStyle, width: 120 }}>
                  {NUMERIC_OPS.map((op) => <option key={op} value={op}>{t(`op.${op}`)}</option>)}
                </select>
                {/* <input type="number" step="any" value={numVal} onChange={(e) => setNumVal(e.target.value)}
                  placeholder={t('table.filterPlaceholder')} style={inputStyle} /> */}
                <input type="number" step="any" value={numVal} onChange={(e) => setNumVal(e.target.value)}
                  placeholder={t('table.filterPlaceholder')} 
                  style={{ ...inputStyle, flex: 1, minWidth: 80 }} />
              </>}

              {condKind === 'nComponents' && (
                <select value={nComp} onChange={(e) => setNComp(Number(e.target.value) as 1 | 2 | 3)} style={selectStyle}>
                  <option value={1}>{t('table.filterUnary')}</option>
                  <option value={2}>{t('table.filterBinary')}</option>
                  <option value={3}>{t('table.filterTernary')}</option>
                </select>
              )}

              {condKind === 'elementFraction' && <>
                <select value={elemEl} onChange={(e) => setElemEl(e.target.value)} style={selectStyle}>
                  <option value="">{t('table.filterSelectElement')}</option>
                  {elements.map((el) => <option key={el} value={el}>{el}</option>)}
                </select>
                <select value={elemOp} onChange={(e) => setElemOp(e.target.value as CompOperator)} style={{ ...selectStyle, width: 50 }}>
                  {COMP_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
                <input type="number" min={0} max={1} step={0.01} value={elemVal}
                  onChange={(e) => setElemVal(e.target.value)} placeholder="0~1"
                  style={{ ...inputStyle, width: 70 }} />
              </>}

              <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={addCondition}>
                <Plus size={12} /> {t('btn.addFilter')}
              </button>
            </div>
          </div>

          {/* 已激活条件标签 */}
          {conditions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {conditions.map((cond, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 12,
                  background: 'var(--color-primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {conditionLabel(cond, t)}
                  <X size={12} style={{ cursor: 'pointer' }}
                    onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))} />
                </span>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                onClick={() => setConditions([])}>
                {t('btn.resetFilter')}
              </button>
            </div>
          )}

          {/* 匹配结果 */}
          <div style={{
            padding: 10, borderRadius: 6, fontSize: 13, fontWeight: 600,
            background: filteredStructures.length > 0 ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
            color: filteredStructures.length > 0 ? 'var(--color-success)' : 'var(--color-danger)',
          }}>
            {filteredStructures.length > 0
              ? t('filter.matchCount', { count: filteredStructures.length })
              : t('filter.noMatch')}
          </div>
        </div>

        {/* ── 右：导出选项 ── */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t('export.title')}</h3>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{t('export.format')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['zip', 'seeds', 'csv', 'json'] as const).map((fmt) => (
                <button key={fmt} className={`btn btn-sm ${exportFormat === fmt ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setExportFormat(fmt)}>
                  {t(`export.format${fmt.charAt(0).toUpperCase() + fmt.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>

          {exportFormat === 'zip' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{t('export.naming')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  [1, t('export.nameParts.index')], [2, t('export.nameParts.id')],
                  [3, t('export.nameParts.sg')], [4, t('export.nameParts.fitness')],
                  [5, t('export.nameParts.secondObj')], [6, t('export.nameParts.formula')],
                ] as [number, string][]).map(([n, label]) => (
                  <button key={n} className={`btn btn-sm ${nameParts.includes(n) ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => toggleNamePart(n)}>
                    [{n}] {label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>
                {t('export.preview')}: <code style={{ background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>{previewName}</code>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t('export.sortBy')}:</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={selectStyle}>
              {NUMERIC_FIELDS.map((f) => <option key={f} value={f}>{t(`col.${f}`) || f}</option>)}
            </select>
            <button className="btn btn-outline btn-sm" onClick={() => setSortReverse(!sortReverse)}>
              {sortReverse ? t('export.descending') : t('export.ascending')}
            </button>
          </div>

          <button className="btn btn-primary" onClick={handleExport} disabled={filteredStructures.length === 0}
            style={{ width: '100%', padding: '10px 20px', fontSize: 14, opacity: filteredStructures.length > 0 ? 1 : 0.4 }}>
            <Download size={16} />
            {t('export.exportCount', { count: filteredStructures.length })}
          </button>
        </div>
      </div>

      {/* 预览表格 */}
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
                {conditions
                  .filter((c) => c.kind === 'numeric')
                  .map((c) => (c as { kind: 'numeric'; field: string }).field)
                  .filter((f, i, arr) => arr.indexOf(f) === i && !['enthalpy', 'fitness', 'spaceGroup'].includes(f))
                  .map((f) => (
                    <th key={f} style={{ color: 'var(--color-primary)', fontStyle: 'italic' }}>
                      {t(`col.${f}`) || f}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {sortedStructures.slice(0, 50).map((s, i) => {
                const extraFields = conditions
                  .filter((c) => c.kind === 'numeric')
                  .map((c) => (c as { kind: 'numeric'; field: string }).field)
                  .filter((f, idx, arr) => arr.indexOf(f) === idx && !['enthalpy', 'fitness', 'spaceGroup'].includes(f));
                return (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>EA{s.id}</td>
                    <td><FormulaDisplay formula={s.formula} /></td>
                    <td>{s.spaceGroup}</td>
                    <td>{s.enthalpy < 900 ? s.enthalpy.toFixed(4) : '—'}</td>
                    <td>{s.fitness >= 0 ? s.fitness.toFixed(4) : '—'}</td>
                    <td>{s.origin}</td>
                    {extraFields.map((f) => {
                      const v = Number((s as unknown as Record<string, unknown>)[f]);
                      return (
                        <td key={f} style={{ color: 'var(--color-primary)' }}>
                          {isNaN(v) ? '—' : v < 900 ? v.toFixed(4) : v.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
