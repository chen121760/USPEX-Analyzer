import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { X, Plus, Download } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { buildSeedsFile, structuresToCSV } from '@/lib/poscarWriter';
import { FormulaDisplay } from '@/components/FormulaDisplay';
import type { Structure, UnifiedCondition, NumericOperator, CompOperator, UnifiedConditionGroup, CustomNamePart } from '@/types/structure';


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

function buildFilename(index: number, s: Structure, nameParts: number[], padding: number, prefix: string, customNameParts: CustomNamePart[] = []): string {
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
  for (const cp of customNameParts) {
    const raw = (s as unknown as Record<string, unknown>)[cp.field];
    if (raw == null) continue;
    const num = Number(raw);
    if (isNaN(num)) continue;
    const formatted = Number.isInteger(num) ? String(num) : num.toFixed(3);
    const p = cp.label.trim();
    segments.push(p ? `${p}${formatted}` : formatted);
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
  const nameParts          = useUIStore((s) => s.filterNameParts);
  const setNameParts       = useUIStore((s) => s.setFilterNameParts);
  const customNameParts    = useUIStore((s) => s.filterCustomNameParts);
  const setCustomNameParts = useUIStore((s) => s.setFilterCustomNameParts);
  const sortKey            = useUIStore((s) => s.filterSortKey);
  const setSortKey      = useUIStore((s) => s.setFilterSortKey);
  const sortReverse     = useUIStore((s) => s.filterSortReverse);
  const setSortReverse  = useUIStore((s) => s.setFilterSortReverse);

  const secondObjPrefix = 'Obj';

  // 动态数值字段列表（根据实际数据判断）
  const hasPareto      = systemInfo?.optimizationType === 'multi';
  const hasML          = structures.some((s) => s.bulkModulus != null);
  const hasFingerprint = structures.some((s) => s.qEntropy != null && s.qEntropy > 0);

  const numericFields = useMemo(() => {
    const base = ['fitness', 'enthalpy', 'volume', 'density', 'spaceGroup', 'generation'];
    if (hasPareto)      base.push('paretoFront');
    if (hasML)          base.push('youngModulus', 'bulkModulus', 'shearModulus', 'poissonRatio', 'vickersHardness', 'fractureToughness');
    if (hasFingerprint) base.push('qEntropy', 'aOrder', 'sOrder');
    return base;
  }, [hasPareto, hasML, hasFingerprint]);

  // 条件组 — 接入 UIStore
  const groups    = useUIStore((s) => s.filterConditionGroups);
  const setGroups = useUIStore((s) => s.setFilterConditionGroups);

  // 当前追加目标组 ID（null = 追加到最后一组，或新建）
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);

  // 条件构建器的临时状态
  const [condKind, setCondKind] = useState<'numeric' | 'nComponents' | 'elementFraction'>('numeric');
  const [numField, setNumField] = useState(() => numericFields[0]);
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

  // 添加条件：追加到 targetGroupId 指定的组，或最后一组，或新建第一组
  const addCondition = (forceNewGroup = false) => {
    let newCond: UnifiedCondition | null = null;
    if (condKind === 'numeric') {
      if (numVal === '') return;
      newCond = { kind: 'numeric', field: numField, operator: numOp, value: Number(numVal) };
      setNumVal('');
    } else if (condKind === 'nComponents') {
      newCond = { kind: 'nComponents', value: nComp };
    } else {
      if (!elemEl || elemVal === '') return;
      newCond = { kind: 'elementFraction', element: elemEl, operator: elemOp, value: Number(elemVal) };
      setElemVal('');
    }
    if (!newCond) return;

    if (forceNewGroup) {
      // 明确新建 OR 组
      const newGroup: UnifiedConditionGroup = { id: crypto.randomUUID(), conditions: [newCond] };
      setGroups([...groups, newGroup]);
      setTargetGroupId(null);
    } else if (targetGroupId !== null) {
      // 追加到指定组
      setGroups(groups.map((g) =>
        g.id === targetGroupId ? { ...g, conditions: [...g.conditions, newCond!] } : g
      ));
    } else if (groups.length > 0) {
      // 追加到最后一组
      const last = groups[groups.length - 1];
      setGroups(groups.map((g) =>
        g.id === last.id ? { ...g, conditions: [...g.conditions, newCond!] } : g
      ));
    } else {
      // 没有任何组，新建第一组
      const newGroup: UnifiedConditionGroup = { id: crypto.randomUUID(), conditions: [newCond] };
      setGroups([newGroup]);
    }
  };

  // 过滤逻辑：组间 OR，组内 AND
  const filteredStructures = useMemo(() => {
    let result = structures;

    const includedTagIds = Object.entries(tagStates).filter(([, s]) => s === 'include').map(([id]) => id);
    const excludedTagIds = Object.entries(tagStates).filter(([, s]) => s === 'exclude').map(([id]) => id);
    if (includedTagIds.length > 0) result = result.filter((s) => includedTagIds.every((id) => s.tags.includes(id)));
    if (excludedTagIds.length > 0) result = result.filter((s) => excludedTagIds.every((id) => !s.tags.includes(id)));

    if (groups.length > 0) {
      result = result.filter((s) =>
        groups.some((group) =>
          group.conditions.every((cond) => applyCondition(s, cond, elements))
        )
      );
    }
    return result;
  }, [structures, tagStates, groups, elements]);

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
        zip.file(buildFilename(i, s, nameParts, padding, secondObjPrefix, customNameParts), s.poscarData);
      });
      saveAs(await zip.generateAsync({ type: 'blob' }), `uspex-structures-${sortedStructures.length}.zip`);
    } else if (exportFormat === 'seeds') {
      saveAs(new Blob([buildSeedsFile(sortedStructures)], { type: 'text/plain' }), 'seeds.txt');
    } else if (exportFormat === 'csv') {
      saveAs(new Blob([structuresToCSV(sortedStructures, { hasPareto, hasML, hasFingerprint })], { type: 'text/csv' }), 'structures.csv');
    } else if (exportFormat === 'json') {
      const project = useProjectStore.getState().exportProjectFile();
      saveAs(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `uspex-project-${systemInfo?.elements.join('-') ?? 'data'}.json`);
    }
  }, [sortedStructures, exportFormat, nameParts, customNameParts, secondObjPrefix, systemInfo]);

  const toggleNamePart = (part: number) => {
    setNameParts(nameParts.includes(part) ? nameParts.filter((p) => p !== part) : [...nameParts, part].sort());
  };

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 6,
    fontSize: 12, background: 'var(--color-bg)', color: 'var(--color-text)',
  };
  const inputStyle: React.CSSProperties = { ...selectStyle, width: 100 };

  const previewName = sortedStructures.length > 0
    ? buildFilename(0, sortedStructures[0], nameParts, String(sortedStructures.length).length, secondObjPrefix, customNameParts)
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
                  {numericFields.map((f) => <option key={f} value={f}>{t(`col.${f}`) || f}</option>)}
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

              <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => addCondition(false)}>
                <Plus size={12} /> {t('btn.addFilter')}
              </button>
              {groups.length > 0 && (
                <button className="btn btn-sm btn-outline" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }} onClick={() => addCondition(true)}>
                  {t('btn.newOrGroup')}
                </button>
              )}
            </div>
          </div>

          {/* 条件组展示：组内 AND，组间 OR */}
          {groups.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {groups.map((group, gi) => (
                <div key={group.id}>
                  {gi > 0 && (
                    <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700,
                      color: 'var(--color-primary)', margin: '2px 0', letterSpacing: 2 }}>
                      OR
                    </div>
                  )}
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
                    padding: '6px 8px', borderRadius: 6,
                    border: `1px solid ${targetGroupId === group.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: 'var(--color-bg)',
                  }}>
                    {group.conditions.map((cond, ci) => (
                      <span key={ci} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {ci > 0 && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: '0 2px' }}>AND</span>}
                        <span style={{
                          fontSize: 11, padding: '2px 7px', borderRadius: 10,
                          background: 'var(--color-primary)', color: '#fff',
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          {conditionLabel(cond, t)}
                          <X size={11} style={{ cursor: 'pointer' }}
                            onClick={() => {
                              const newConds = group.conditions.filter((_, idx) => idx !== ci);
                              if (newConds.length === 0) {
                                setGroups(groups.filter((g) => g.id !== group.id));
                                if (targetGroupId === group.id) setTargetGroupId(null);
                              } else {
                                setGroups(groups.map((g) => g.id === group.id ? { ...g, conditions: newConds } : g));
                              }
                            }}
                          />
                        </span>
                      </span>
                    ))}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                      <button
                        className={`btn btn-sm ${targetGroupId === group.id ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: 10, padding: '1px 6px' }}
                        onClick={() => setTargetGroupId(targetGroupId === group.id ? null : group.id)}
                      >
                        {targetGroupId === group.id ? t('btn.cancelAppend') : t('btn.appendToGroup')}
                      </button>
                      <X size={13} style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}
                        onClick={() => {
                          setGroups(groups.filter((g) => g.id !== group.id));
                          if (targetGroupId === group.id) setTargetGroupId(null);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, alignSelf: 'flex-start' }}
                onClick={() => { setGroups([]); setTargetGroupId(null); }}>
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

              {/* 自定义命名段 */}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  {t('export.customNameParts')}
                </div>
                {customNameParts.map((cp) => (
                  <div key={cp.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <input
                      type="text"
                      value={cp.label}
                      placeholder={t('export.customLabel')}
                      style={{ padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 6,
                               fontSize: 12, background: 'var(--color-bg)', color: 'var(--color-text)', width: 70 }}
                      onChange={(e) => setCustomNameParts(
                        customNameParts.map((p) => p.id === cp.id ? { ...p, label: e.target.value } : p)
                      )}
                    />
                    <select
                      value={cp.field}
                      style={selectStyle}
                      onChange={(e) => setCustomNameParts(
                        customNameParts.map((p) => p.id === cp.id ? { ...p, field: e.target.value } : p)
                      )}
                    >
                      {numericFields.map((f) => (
                        <option key={f} value={f}>{t(`col.${f}`) || f}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn-sm btn-outline"
                      style={{ padding: '3px 7px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                      onClick={() => setCustomNameParts(customNameParts.filter((p) => p.id !== cp.id))}
                    >×</button>
                  </div>
                ))}
                <button
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setCustomNameParts([
                    ...customNameParts,
                    { id: crypto.randomUUID(), label: '', field: numericFields[0] ?? 'generation' },
                  ])}
                >
                  <Plus size={12} /> {t('export.addCustomPart')}
                </button>
              </div>

              <div style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>
                {t('export.preview')}: <code style={{ background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>{previewName}</code>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t('export.sortBy')}:</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={selectStyle}>
              {numericFields.map((f) => <option key={f} value={f}>{t(`col.${f}`) || f}</option>)}
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
                {groups
                  .flatMap((g) => g.conditions)
                  .filter((c): c is { kind: 'numeric'; field: string; operator: NumericOperator; value: number } => c.kind === 'numeric')
                  .map((c) => c.field)
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
                const extraFields = groups
                  .flatMap((g) => g.conditions)
                  .filter((c): c is { kind: 'numeric'; field: string; operator: NumericOperator; value: number } => c.kind === 'numeric')
                  .map((c) => c.field)
                  .filter((f, idx, arr) => arr.indexOf(f) === idx && !['enthalpy', 'fitness', 'spaceGroup'].includes(f));
                return (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>EA{s.id}</td>
                    <td><FormulaDisplay formula={s.formula} /></td>
                    <td>{s.spaceGroup}</td>
                    <td>{s.enthalpy != null && s.enthalpy < 900 ? s.enthalpy.toFixed(4) : '—'}</td>
                    <td>{s.fitness != null && s.fitness >= 0 ? s.fitness.toFixed(4) : '—'}</td>
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
