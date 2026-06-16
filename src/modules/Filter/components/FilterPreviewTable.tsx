import { FormulaDisplay } from '@/components/FormulaDisplay';
import { getStructureFieldValue } from '@/domain/structure/dynamicFields';
import type { NumericOperator, Structure, UnifiedConditionGroup } from '@/types/structure';

export function FilterPreviewTable({
  sortedStructures,
  groups,
  t,
}: {
  sortedStructures: Structure[];
  groups: UnifiedConditionGroup[];
  t: (key: string) => string;
}) {
  if (sortedStructures.length === 0) return null;

  const headerStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'var(--color-surface)',
    boxShadow: '0 1px 0 var(--color-border), 0 6px 12px rgba(15, 23, 42, 0.06)',
  };

  const extraFields = groups
    .flatMap((g) => g.conditions)
    .filter((c): c is { kind: 'numeric'; field: string; operator: NumericOperator; value: number } => c.kind === 'numeric')
    .map((c) => c.field)
    .filter((f, i, arr) => arr.indexOf(f) === i && !['enthalpy', 'fitness', 'spaceGroup'].includes(f));

  return (
    <div
      className="card"
      style={{
        marginTop: 16,
        maxHeight: 300,
        overflow: 'auto',
        padding: 0,
        position: 'relative',
      }}
    >
      <table
        className="data-table"
        style={{
          borderCollapse: 'separate',
          borderSpacing: 0,
        }}
      >
        <thead>
          <tr>
            <th style={headerStyle}>#</th>
            <th style={headerStyle}>ID</th>
            <th style={headerStyle}>{t('col.formula')}</th>
            <th style={headerStyle}>SG</th>
            <th style={headerStyle}>{t('col.enthalpy')}</th>
            <th style={headerStyle}>{t('col.fitness')}</th>
            <th style={headerStyle}>{t('col.origin')}</th>
            {extraFields.map((f) => (
              <th key={f} style={{ ...headerStyle, color: 'var(--color-primary)', fontStyle: 'italic' }}>
                {t(`col.${f}`) || f}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedStructures.slice(0, 50).map((s, i) => (
            <tr key={s.id}>
              <td>{i + 1}</td>
              <td style={{ fontWeight: 600 }}>EA{s.id}</td>
              <td><FormulaDisplay formula={s.formula} /></td>
              <td>{s.spaceGroup}</td>
              <td>{s.enthalpyTotal <= 900 ? s.enthalpy.toFixed(4) : '—'}</td>
              <td>{s.fitness != null && s.fitness >= 0 ? s.fitness.toFixed(4) : '—'}</td>
              <td>{s.origin}</td>
              {extraFields.map((f) => {
                const v = Number(getStructureFieldValue(s, f));
                return (
                  <td key={f} style={{ color: 'var(--color-primary)' }}>
                    {isNaN(v) ? '—' : v < 900 ? v.toFixed(4) : v.toFixed(1)}
                  </td>
                );
              })}
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
  );
}
