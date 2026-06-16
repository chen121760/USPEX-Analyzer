import { X } from 'lucide-react';
import type {
  ElementFractionFilterCondition,
  NumericFilterColumn,
  NumericFilterCondition,
  TableFilterCondition,
  TableFilterGroup,
  TextFilterColumn,
  TextFilterCondition,
} from '@/types/structure';

type FilterKind = 'numeric' | 'text' | 'nComponents' | 'elementFraction';

export function DataTableFilterBuilder({
  t,
  colKind,
  setColKind,
  filterNumCol,
  setFilterNumCol,
  filterNumOp,
  setFilterNumOp,
  filterNumVal,
  setFilterNumVal,
  numericFilterColumns,
  filterTextCol,
  setFilterTextCol,
  filterTextOp,
  setFilterTextOp,
  filterTextInput,
  setFilterTextInput,
  textFilterColumns,
  textColumnOptions,
  filterNComp,
  setFilterNComp,
  filterElemEl,
  setFilterElemEl,
  filterElemOp,
  setFilterElemOp,
  filterElemVal,
  setFilterElemVal,
  elements,
  filterGroups,
  setFilterGroups,
  targetGroupId,
  setTargetGroupId,
  addToGroup,
  onResetFilters,
  onFilterChanged,
}: {
  t: (key: string) => string;
  colKind: FilterKind;
  setColKind: (kind: FilterKind) => void;
  filterNumCol: NumericFilterColumn;
  setFilterNumCol: (column: NumericFilterColumn) => void;
  filterNumOp: NumericFilterCondition['operator'];
  setFilterNumOp: (operator: NumericFilterCondition['operator']) => void;
  filterNumVal: string;
  setFilterNumVal: (value: string) => void;
  numericFilterColumns: { key: NumericFilterColumn; label: string }[];
  filterTextCol: TextFilterColumn;
  setFilterTextCol: (column: TextFilterColumn) => void;
  filterTextOp: TextFilterCondition['operator'];
  setFilterTextOp: (operator: TextFilterCondition['operator']) => void;
  filterTextInput: string;
  setFilterTextInput: (value: string) => void;
  textFilterColumns: { key: TextFilterColumn; label: string }[];
  textColumnOptions: Record<TextFilterColumn, string[]>;
  filterNComp: 1 | 2 | 3;
  setFilterNComp: (value: 1 | 2 | 3) => void;
  filterElemEl: string;
  setFilterElemEl: (value: string) => void;
  filterElemOp: ElementFractionFilterCondition['operator'];
  setFilterElemOp: (operator: ElementFractionFilterCondition['operator']) => void;
  filterElemVal: string;
  setFilterElemVal: (value: string) => void;
  elements: string[];
  filterGroups: TableFilterGroup[];
  setFilterGroups: (groups: TableFilterGroup[]) => void;
  targetGroupId: string | null;
  setTargetGroupId: (id: string | null) => void;
  addToGroup: (condition: TableFilterCondition, forceNewGroup?: boolean) => void;
  onResetFilters: () => void;
  onFilterChanged: () => void;
}) {
  const addNumericFilter = (forceNewGroup = false) => {
    if (filterNumVal === '') return;
    const col = numericFilterColumns.find((c) => c.key === filterNumCol);
    addToGroup({
      kind: 'numeric',
      column: filterNumCol,
      label: col?.label || filterNumCol,
      operator: filterNumOp,
      value: Number(filterNumVal),
    }, forceNewGroup);
    setFilterNumVal('');
    onFilterChanged();
  };

  const addTextFilter = (forceNewGroup = false) => {
    const values = filterTextInput.split(',').filter(Boolean);
    if (values.length === 0) return;
    const col = textFilterColumns.find((c) => c.key === filterTextCol);
    addToGroup({
      kind: 'text',
      column: filterTextCol,
      label: col?.label || filterTextCol,
      operator: filterTextOp,
      values,
    }, forceNewGroup);
    setFilterTextInput('');
    onFilterChanged();
  };

  const addNComponentsFilter = (forceNewGroup = false) => {
    const labelMap: Record<number, string> = {
      1: t('table.filterUnary'),
      2: t('table.filterBinary'),
      3: t('table.filterTernary'),
    };
    addToGroup({
      kind: 'nComponents',
      label: labelMap[filterNComp],
      value: filterNComp,
    }, forceNewGroup);
    onFilterChanged();
  };

  const addElementFractionFilter = (forceNewGroup = false) => {
    if (!filterElemEl || filterElemVal === '') return;
    addToGroup({
      kind: 'elementFraction',
      label: `x(${filterElemEl})`,
      element: filterElemEl,
      operator: filterElemOp,
      value: Number(filterElemVal),
    }, forceNewGroup);
    setFilterElemVal('');
    onFilterChanged();
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('table.filterLabel')}</span>

        <select
          value={colKind}
          onChange={(e) => setColKind(e.target.value as FilterKind)}
          style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          <option value="numeric">{t('table.filterNumeric')}</option>
          <option value="text">{t('table.filterText')}</option>
          <option value="nComponents">{t('table.filterNComponents')}</option>
          <option value="elementFraction">{t('table.filterElemFraction')}</option>
        </select>

        {colKind === 'numeric' ? (
          <>
            <select
              value={filterNumCol}
              onChange={(e) => setFilterNumCol(e.target.value as NumericFilterColumn)}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              {numericFilterColumns.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
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
              onClick={() => addNumericFilter(false)}
            >
              {t('btn.addFilter')}
            </button>
            {filterGroups.length > 0 && (
              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: 11, padding: '3px 10px', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                onClick={() => addNumericFilter(true)}
              >
                {t('btn.newOrGroup')}
              </button>
            )}
          </>
        ) : colKind === 'text' ? (
          <>
            <select
              value={filterTextCol}
              onChange={(e) => setFilterTextCol(e.target.value as TextFilterColumn)}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              {textFilterColumns.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
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
            <select
              multiple
              size={3}
              value={filterTextInput.split(',').filter(Boolean)}
              onChange={(e) => {
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
              onClick={() => addTextFilter(false)}
            >
              {t('btn.addFilter')}
            </button>
            {filterGroups.length > 0 && (
              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: 11, padding: '3px 10px', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                onClick={() => addTextFilter(true)}
              >
                {t('btn.newOrGroup')}
              </button>
            )}
          </>
        ) : colKind === 'nComponents' ? (
          <>
            <select
              value={filterNComp}
              onChange={(e) => setFilterNComp(Number(e.target.value) as 1 | 2 | 3)}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value={1}>{t('table.filterUnary')}</option>
              <option value={2}>{t('table.filterBinary')}</option>
              <option value={3}>{t('table.filterTernary')}</option>
            </select>
            <button
              className="btn btn-sm btn-primary"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => addNComponentsFilter(false)}
            >
              {t('btn.addFilter')}
            </button>
            {filterGroups.length > 0 && (
              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: 11, padding: '3px 10px', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                onClick={() => addNComponentsFilter(true)}
              >
                {t('btn.newOrGroup')}
              </button>
            )}
          </>
        ) : (
          <>
            <select
              value={filterElemEl}
              onChange={(e) => setFilterElemEl(e.target.value)}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="">{t('table.filterSelectElement')}</option>
              {elements.map((el) => (
                <option key={el} value={el}>{el}</option>
              ))}
            </select>
            <select
              value={filterElemOp}
              onChange={(e) => setFilterElemOp(e.target.value as ElementFractionFilterCondition['operator'])}
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', width: 50 }}
            >
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&ge;</option>
              <option value="<=">&le;</option>
              <option value="=">=</option>
            </select>
            <input
              type="number"
              min={0} max={1} step={0.01}
              value={filterElemVal}
              onChange={(e) => setFilterElemVal(e.target.value)}
              placeholder="0~1"
              style={{ padding: '3px 6px', fontSize: 12, borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', width: 70 }}
            />
            <button
              className="btn btn-sm btn-primary"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => addElementFractionFilter(false)}
            >
              {t('btn.addFilter')}
            </button>
            {filterGroups.length > 0 && (
              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: 11, padding: '3px 10px', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                onClick={() => addElementFractionFilter(true)}
              >
                {t('btn.newOrGroup')}
              </button>
            )}
          </>
        )}

        {filterGroups.length > 0 && (
          <button
            className="btn btn-sm btn-outline"
            style={{ fontSize: 11, padding: '3px 10px' }}
            onClick={onResetFilters}
          >
            {t('btn.resetFilter')}
          </button>
        )}
      </div>

      {filterGroups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filterGroups.map((group, gi) => (
            <div key={group.id}>
              {gi > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)',
                  letterSpacing: 2, margin: '1px 0', paddingLeft: 4 }}>
                  OR
                </div>
              )}
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
                padding: '4px 6px', borderRadius: 6,
                border: `1px solid ${targetGroupId === group.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: 'transparent',
              }}>
                {group.conditions.map((f, ci) => (
                  <span key={ci} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {ci > 0 && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: '0 2px' }}>AND</span>}
                    <span style={{
                      fontSize: 11, padding: '2px 7px', borderRadius: 10,
                      background: 'var(--color-primary)', color: 'var(--color-primary-contrast)',
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      {f.kind === 'numeric'
                        ? `${f.label} ${f.operator} ${f.value}`
                        : f.kind === 'nComponents'
                          ? f.label
                          : f.kind === 'elementFraction'
                            ? `x(${f.element}) ${f.operator} ${f.value}`
                            : `${f.label} [${f.values.join(', ')}]`
                      }
                      <X size={11} style={{ cursor: 'pointer' }}
                        onClick={() => {
                          const newConds = group.conditions.filter((_, idx) => idx !== ci);
                          if (newConds.length === 0) {
                            setFilterGroups(filterGroups.filter((g) => g.id !== group.id));
                            if (targetGroupId === group.id) setTargetGroupId(null);
                          } else {
                            setFilterGroups(filterGroups.map((g) => g.id === group.id ? { ...g, conditions: newConds } : g));
                          }
                          onFilterChanged();
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
                  <X size={12} style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}
                    onClick={() => {
                      setFilterGroups(filterGroups.filter((g) => g.id !== group.id));
                      if (targetGroupId === group.id) setTargetGroupId(null);
                      onFilterChanged();
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
