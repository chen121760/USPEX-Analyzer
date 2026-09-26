import { X } from 'lucide-react';
import { conditionLabel, NUMERIC_OPS } from '@/modules/Filter/filterLogic';
import type { CompOperator, NumericOperator, UnifiedCondition, UnifiedConditionGroup } from '@/types/structure';

export type FilterKind = 'numeric' | 'text' | 'nComponents' | 'elementFraction';
export type TextFilterField = 'formula' | 'origin';
export type TextFilterOperator = 'contains' | 'notContains' | 'equals' | 'notEquals';
type Translate = (key: string, options?: Record<string, unknown>) => string;

interface Props {
  t: Translate;
  colKind: FilterKind;
  setColKind: (kind: FilterKind) => void;
  filterNumCol: string;
  setFilterNumCol: (column: string) => void;
  filterNumOp: NumericOperator;
  setFilterNumOp: (operator: NumericOperator) => void;
  filterNumVal: string;
  setFilterNumVal: (value: string) => void;
  numericFilterColumns: { key: string; label: string }[];
  filterTextCol: TextFilterField;
  setFilterTextCol: (column: TextFilterField) => void;
  filterTextOp: TextFilterOperator;
  setFilterTextOp: (operator: TextFilterOperator) => void;
  filterTextInput: string;
  setFilterTextInput: (value: string) => void;
  textFilterColumns: { key: TextFilterField; label: string }[];
  textColumnOptions: Record<TextFilterField, string[]>;
  filterNComp: 1 | 2 | 3 | 4;
  setFilterNComp: (value: 1 | 2 | 3 | 4) => void;
  filterElemEl: string;
  setFilterElemEl: (value: string) => void;
  filterElemOp: CompOperator;
  setFilterElemOp: (operator: CompOperator) => void;
  filterElemVal: string;
  setFilterElemVal: (value: string) => void;
  elements: string[];
  filterGroups: UnifiedConditionGroup[];
  setFilterGroups: (groups: UnifiedConditionGroup[]) => void;
  targetGroupId: string | null;
  setTargetGroupId: (id: string | null) => void;
  addToGroup: (condition: UnifiedCondition, forceNewGroup?: boolean) => void;
  onResetFilters: () => void;
  onFilterChanged?: () => void;
}

const controlStyle = {
  padding: '3px 6px', fontSize: 12, borderRadius: 4,
  border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)',
} as const;

export function DataTableFilterBuilder(props: Props) {
  const {
    t, colKind, setColKind,
    filterNumCol, setFilterNumCol, filterNumOp, setFilterNumOp, filterNumVal, setFilterNumVal,
    numericFilterColumns, filterTextCol, setFilterTextCol, filterTextOp, setFilterTextOp,
    filterTextInput, setFilterTextInput, textFilterColumns, textColumnOptions,
    filterNComp, setFilterNComp, filterElemEl, setFilterElemEl, filterElemOp, setFilterElemOp,
    filterElemVal, setFilterElemVal, elements, filterGroups, setFilterGroups,
    targetGroupId, setTargetGroupId, addToGroup, onResetFilters,
    onFilterChanged = () => undefined,
  } = props;

  const add = (condition: UnifiedCondition, forceNewGroup: boolean) => {
    addToGroup(condition, forceNewGroup);
    onFilterChanged();
  };
  const addCurrent = (forceNewGroup: boolean) => {
    if (colKind === 'numeric') {
      if (filterNumVal === '' || !Number.isFinite(Number(filterNumVal))) return;
      add({ kind: 'numeric', field: filterNumCol, operator: filterNumOp, value: Number(filterNumVal) }, forceNewGroup);
      setFilterNumVal('');
    } else if (colKind === 'text') {
      const values = filterTextInput.split(',').map((value) => value.trim()).filter(Boolean);
      if (values.length === 0) return;
      add({ kind: 'text', field: filterTextCol, operator: filterTextOp, values }, forceNewGroup);
      setFilterTextInput('');
    } else if (colKind === 'nComponents') {
      add({ kind: 'nComponents', value: filterNComp }, forceNewGroup);
    } else {
      if (!filterElemEl || filterElemVal === '' || !Number.isFinite(Number(filterElemVal))) return;
      add({ kind: 'elementFraction', element: filterElemEl, operator: filterElemOp, value: Number(filterElemVal) }, forceNewGroup);
      setFilterElemVal('');
    }
  };

  const removeCondition = (groupId: string, conditionIndex: number) => {
    const nextGroups = filterGroups.flatMap((group) => {
      if (group.id !== groupId) return [group];
      const conditions = group.conditions.filter((_, index) => index !== conditionIndex);
      return conditions.length > 0 ? [{ ...group, conditions }] : [];
    });
    setFilterGroups(nextGroups);
    if (!nextGroups.some((group) => group.id === targetGroupId)) setTargetGroupId(null);
    onFilterChanged();
  };

  return <>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('table.filterLabel')}</span>
      <select value={colKind} onChange={(event) => setColKind(event.target.value as FilterKind)} style={controlStyle}>
        <option value="numeric">{t('table.filterNumeric')}</option>
        <option value="text">{t('table.filterText')}</option>
        <option value="nComponents">{t('table.filterNComponents')}</option>
        <option value="elementFraction">{t('table.filterElemFraction')}</option>
      </select>

      {colKind === 'numeric' && <>
        <select value={filterNumCol} onChange={(event) => setFilterNumCol(event.target.value)} style={controlStyle}>
          {numericFilterColumns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
        </select>
        <select value={filterNumOp} onChange={(event) => setFilterNumOp(event.target.value as NumericOperator)} style={{ ...controlStyle, width: 58 }}>
          {NUMERIC_OPS.map((operator) => <option key={operator} value={operator}>{({ gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' })[operator]}</option>)}
        </select>
        <input type="number" step="any" value={filterNumVal} onChange={(event) => setFilterNumVal(event.target.value)} placeholder={t('table.filterPlaceholder')} style={{ ...controlStyle, width: 90 }} />
      </>}

      {colKind === 'text' && <>
        <select value={filterTextCol} onChange={(event) => setFilterTextCol(event.target.value as TextFilterField)} style={controlStyle}>
          {textFilterColumns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
        </select>
        <select value={filterTextOp} onChange={(event) => setFilterTextOp(event.target.value as TextFilterOperator)} style={controlStyle}>
          <option value="contains">{t('table.filterContains')}</option>
          <option value="notContains">{t('table.filterNotContains')}</option>
          <option value="equals">{t('table.filterEquals')}</option>
          <option value="notEquals">{t('table.filterNotEquals')}</option>
        </select>
        <select multiple size={3} value={filterTextInput.split(',').filter(Boolean)}
          onChange={(event) => setFilterTextInput(Array.from(event.target.selectedOptions).map((option) => option.value).join(','))}
          style={{ ...controlStyle, minWidth: 120, maxWidth: 220 }}>
          {textColumnOptions[filterTextCol].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </>}

      {colKind === 'nComponents' && <select value={filterNComp} onChange={(event) => setFilterNComp(Number(event.target.value) as 1 | 2 | 3 | 4)} style={controlStyle}>
        <option value={1}>{t('table.filterUnary')}</option><option value={2}>{t('table.filterBinary')}</option>
        <option value={3}>{t('table.filterTernary')}</option><option value={4}>{t('table.filterQuaternary')}</option>
      </select>}

      {colKind === 'elementFraction' && <>
        <select value={filterElemEl} onChange={(event) => setFilterElemEl(event.target.value)} style={controlStyle}>
          <option value="">{t('table.filterSelectElement')}</option>
          {elements.map((element) => <option key={element} value={element}>{element}</option>)}
        </select>
        <select value={filterElemOp} onChange={(event) => setFilterElemOp(event.target.value as CompOperator)} style={{ ...controlStyle, width: 58 }}>
          {['>', '>=', '<', '<=', '='].map((operator) => <option key={operator} value={operator}>{operator}</option>)}
        </select>
        <input type="number" min={0} max={1} step={0.01} value={filterElemVal} onChange={(event) => setFilterElemVal(event.target.value)} placeholder="0~1" style={{ ...controlStyle, width: 72 }} />
      </>}

      <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => addCurrent(false)}>{t('btn.addFilter')}</button>
      {filterGroups.length > 0 && <button className="btn btn-sm btn-outline" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }} onClick={() => addCurrent(true)}>{t('btn.newOrGroup')}</button>}
      {filterGroups.length > 0 && <button className="btn btn-sm btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={onResetFilters}>{t('btn.resetFilter')}</button>}
    </div>

    {filterGroups.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {filterGroups.map((group, groupIndex) => <div key={group.id}>
        {groupIndex > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', letterSpacing: 2, margin: '1px 0', paddingLeft: 4 }}>OR</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '4px 6px', borderRadius: 6, border: `1px solid ${targetGroupId === group.id ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
          {group.conditions.map((condition, conditionIndex) => <span key={`${condition.kind}-${conditionIndex}`} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {conditionIndex > 0 && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: '0 2px' }}>AND</span>}
            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: 'var(--color-primary)', color: 'var(--color-primary-contrast)', display: 'flex', alignItems: 'center', gap: 3 }}>
              {conditionLabel(condition, t)}<X size={11} style={{ cursor: 'pointer' }} onClick={() => removeCondition(group.id, conditionIndex)} />
            </span>
          </span>)}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className={`btn btn-sm ${targetGroupId === group.id ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => setTargetGroupId(targetGroupId === group.id ? null : group.id)}>
              {targetGroupId === group.id ? t('btn.cancelAppend') : t('btn.appendToGroup')}
            </button>
            <X size={12} style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }} onClick={() => {
              setFilterGroups(filterGroups.filter((candidate) => candidate.id !== group.id));
              if (targetGroupId === group.id) setTargetGroupId(null);
              onFilterChanged();
            }} />
          </div>
        </div>
      </div>)}
    </div>}
  </>;
}
