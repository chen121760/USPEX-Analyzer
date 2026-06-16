import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useFilterStore } from '@/store/useFilterStore';
import { X, Plus } from 'lucide-react';
import JSZip from 'jszip';
import { structuresToCSV } from '@/export/csvExport';
import { downloadBlob } from '@/export/exportFileNames';
import { buildExportFilename, buildSeedsFile } from '@/export/poscarExport';
import { ML_FIELD_KEYS } from '@/lib/constants';
import { collectDynamicFieldKeys, getStructureFieldValue } from '@/domain/structure/dynamicFields';
import type { UnifiedCondition, NumericOperator, CompOperator, UnifiedConditionGroup } from '@/types/structure';
import { COMP_OPS, NUMERIC_OPS, applyCondition, conditionLabel, toSortableNumber } from './filterLogic';
import { FilterExportPanel } from './components/FilterExportPanel';
import { FilterPreviewTable } from './components/FilterPreviewTable';

// ── 主组件 ────────────────────────────────────────────────────
export function FilterPage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const tags = useProjectStore((s) => s.tags);
  const elements = systemInfo?.elements ?? [];

  const tagStates       = useFilterStore((s) => s.filterTagStates);
  const setTagStates    = useFilterStore((s) => s.setFilterTagStates);
  const exportFormat    = useFilterStore((s) => s.filterExportFormat);
  const setExportFormat = useFilterStore((s) => s.setFilterExportFormat);
  const nameParts          = useFilterStore((s) => s.filterNameParts);
  const setNameParts       = useFilterStore((s) => s.setFilterNameParts);
  const customNameParts    = useFilterStore((s) => s.filterCustomNameParts);
  const setCustomNameParts = useFilterStore((s) => s.setFilterCustomNameParts);
  const sortKey            = useFilterStore((s) => s.filterSortKey);
  const setSortKey      = useFilterStore((s) => s.setFilterSortKey);
  const sortReverse     = useFilterStore((s) => s.filterSortReverse);
  const setSortReverse  = useFilterStore((s) => s.setFilterSortReverse);

  const secondObjPrefix = 'Obj';

  // 动态数值字段列表（根据实际数据判断）
  const isVarcomp     = systemInfo?.compositionMode === 'varcomp';
  const hasPareto      = systemInfo?.optimizationType === 'multi';
  const hasML          = structures.some((s) => s.bulkModulus >= 0);
  const hasFingerprint = structures.some((s) => s.qEntropy > 0);

  const extraPropKeys = useMemo(() => collectDynamicFieldKeys(structures), [structures]);

  const numericFields = useMemo(() => {
    const base = ['fitness', 'enthalpy', 'enthalpyTotal', 'volume', 'density', 'spaceGroup', 'generation'];
    if (isVarcomp)      base.push('eForm', 'eHullRecons');
    if (hasPareto)      base.push('paretoFront');
    if (hasML)          base.push(...ML_FIELD_KEYS);
    if (hasFingerprint) base.push('qEntropy', 'aOrder', 'sOrder');
    base.push(...extraPropKeys);
    return base;
  }, [isVarcomp, hasPareto, hasML, hasFingerprint, extraPropKeys]);

  // 条件组 — 接入 FilterStore
  const groups    = useFilterStore((s) => s.filterConditionGroups);
  const setGroups = useFilterStore((s) => s.setFilterConditionGroups);

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
      const av = getStructureFieldValue(a, sortKey);
      const bv = getStructureFieldValue(b, sortKey);
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
        zip.file(buildExportFilename(i, s, nameParts, padding, secondObjPrefix, customNameParts), s.poscarData);
      });
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `uspex-structures-${sortedStructures.length}.zip`);
    } else if (exportFormat === 'seeds') {
      downloadBlob(new Blob([buildSeedsFile(sortedStructures)], { type: 'text/plain' }), 'seeds.txt');
    } else if (exportFormat === 'csv') {
      downloadBlob(new Blob([structuresToCSV(sortedStructures, { hasPareto, hasML, hasFingerprint })], { type: 'text/csv' }), 'structures.csv');
    } else if (exportFormat === 'json') {
      const project = useProjectStore.getState().exportProjectFile();
      downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `uspex-project-${systemInfo?.elements.join('-') ?? 'data'}.json`);
    }
  }, [sortedStructures, exportFormat, nameParts, customNameParts, secondObjPrefix, hasPareto, hasML, hasFingerprint, systemInfo]);

  const toggleNamePart = (part: number) => {
    setNameParts(nameParts.includes(part) ? nameParts.filter((p) => p !== part) : [...nameParts, part].sort());
  };

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 6,
    fontSize: 12, background: 'var(--color-bg)', color: 'var(--color-text)',
  };
  const inputStyle: React.CSSProperties = { ...selectStyle, width: 100 };

  const previewName = sortedStructures.length > 0
    ? buildExportFilename(0, sortedStructures[0], nameParts, String(sortedStructures.length).length, secondObjPrefix, customNameParts)
    : '001-EA2-Ti10H28-SG82.vasp';

  return (
    <div className="fade-in">
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('filter.title')}</h1>

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
                          background: 'var(--color-primary)', color: 'var(--color-primary-contrast)',
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

        <FilterExportPanel
          t={t}
          exportFormat={exportFormat}
          setExportFormat={setExportFormat}
          nameParts={nameParts}
          customNameParts={customNameParts}
          setCustomNameParts={setCustomNameParts}
          numericFields={numericFields}
          sortKey={sortKey}
          sortReverse={sortReverse}
          previewName={previewName}
          filteredCount={filteredStructures.length}
          toggleNamePart={toggleNamePart}
          setSortKey={setSortKey}
          setSortReverse={setSortReverse}
          handleExport={handleExport}
        />
      </div>

      <FilterPreviewTable sortedStructures={sortedStructures} groups={groups} t={t} />
    </div>
  );
}
