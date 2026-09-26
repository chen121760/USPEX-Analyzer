import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useFilterStore } from '@/store/useFilterStore';
import JSZip from 'jszip';
import { structuresToCSV } from '@/export/csvExport';
import { downloadBlob } from '@/export/exportFileNames';
import { buildExportFilename, buildSeedsFile } from '@/export/poscarExport';
import { ML_FIELD_KEYS, ML_FIELD_I18N } from '@/lib/constants';
import { collectDynamicFieldKeys, getStructureFieldValue } from '@/domain/structure/dynamicFields';
import { hasMLProperties } from '@/domain/structure/mlProperties';
import type { UnifiedCondition, NumericOperator, CompOperator, UnifiedConditionGroup } from '@/types/structure';
import { matchesActiveFilter, toSortableNumber } from './filterLogic';
import { FilterExportPanel } from './components/FilterExportPanel';
import { FilterPreviewTable } from './components/FilterPreviewTable';
import {
  DataTableFilterBuilder,
  type FilterKind,
  type TextFilterField,
  type TextFilterOperator,
} from '@/modules/DataTable/components/DataTableFilterBuilder';
import { UnifiedTagFilter } from '@/components/filters/UnifiedTagFilter';

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
  const hasML          = hasMLProperties(structures);
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
  const [condKind, setCondKind] = useState<FilterKind>('numeric');
  const [numField, setNumField] = useState(() => numericFields[0]);
  const [numOp, setNumOp] = useState<NumericOperator>('lte');
  const [numVal, setNumVal] = useState('');
  const [textField, setTextField] = useState<TextFilterField>('formula');
  const [textOp, setTextOp] = useState<TextFilterOperator>('contains');
  const [textInput, setTextInput] = useState('');
  const [nComp, setNComp] = useState<1 | 2 | 3 | 4>(2);
  const [elemEl, setElemEl] = useState('');
  const [elemOp, setElemOp] = useState<CompOperator>('>');
  const [elemVal, setElemVal] = useState('');

  const textFilterColumns = useMemo(() => [
    { key: 'formula' as const, label: t('col.formula') },
    { key: 'origin' as const, label: t('col.origin') },
  ], [t]);
  const textColumnOptions = useMemo(() => ({
    formula: [...new Set(structures.map((structure) => structure.formula))].sort(),
    origin: [...new Set(structures.map((structure) => structure.origin))].sort(),
  }), [structures]);
  const numericFilterColumns = useMemo(() => numericFields.map((field) => ({
    key: field,
    label: field in ML_FIELD_I18N
      ? t(ML_FIELD_I18N[field as keyof typeof ML_FIELD_I18N])
      : (t(`col.${field}`) === `col.${field}` ? field : t(`col.${field}`)),
  })), [numericFields, t]);

  // 添加条件：追加到 targetGroupId 指定的组，或最后一组，或新建第一组
  const addCondition = (newCond: UnifiedCondition, forceNewGroup = false) => {
    if (forceNewGroup) {
      // 明确新建 OR 组
      const newGroup: UnifiedConditionGroup = { id: crypto.randomUUID(), conditions: [newCond] };
      setGroups([...groups, newGroup]);
      setTargetGroupId(null);
    } else if (targetGroupId !== null) {
      // 追加到指定组
      setGroups(groups.map((g) =>
          g.id === targetGroupId ? { ...g, conditions: [...g.conditions, newCond] } : g
      ));
    } else if (groups.length > 0) {
      // 追加到最后一组
      const last = groups[groups.length - 1];
      setGroups(groups.map((g) =>
          g.id === last.id ? { ...g, conditions: [...g.conditions, newCond] } : g
      ));
    } else {
      // 没有任何组，新建第一组
      const newGroup: UnifiedConditionGroup = { id: crypto.randomUUID(), conditions: [newCond] };
      setGroups([newGroup]);
    }
  };

  // 过滤逻辑：组间 OR，组内 AND
  const filteredStructures = useMemo(() => {
    return structures.filter((structure) => matchesActiveFilter(structure, elements, groups, tagStates));
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

          <div style={{ marginBottom: 14 }}>
            <UnifiedTagFilter
              t={t}
              tags={tags}
              structures={structures}
              tagStates={tagStates}
              setTagStates={setTagStates}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 5 }}>{t('filter.tagFilterHint')}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <DataTableFilterBuilder
              t={t}
              colKind={condKind}
              setColKind={setCondKind}
              filterNumCol={numField}
              setFilterNumCol={setNumField}
              filterNumOp={numOp}
              setFilterNumOp={setNumOp}
              filterNumVal={numVal}
              setFilterNumVal={setNumVal}
              numericFilterColumns={numericFilterColumns}
              filterTextCol={textField}
              setFilterTextCol={setTextField}
              filterTextOp={textOp}
              setFilterTextOp={setTextOp}
              filterTextInput={textInput}
              setFilterTextInput={setTextInput}
              textFilterColumns={textFilterColumns}
              textColumnOptions={textColumnOptions}
              filterNComp={nComp}
              setFilterNComp={setNComp}
              filterElemEl={elemEl}
              setFilterElemEl={setElemEl}
              filterElemOp={elemOp}
              setFilterElemOp={setElemOp}
              filterElemVal={elemVal}
              setFilterElemVal={setElemVal}
              elements={elements}
              filterGroups={groups}
              setFilterGroups={setGroups}
              targetGroupId={targetGroupId}
              setTargetGroupId={setTargetGroupId}
              addToGroup={addCondition}
              onResetFilters={() => { setGroups([]); setTagStates({}); setTargetGroupId(null); }}
            />
          </div>

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
