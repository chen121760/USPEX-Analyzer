import { useUIStore } from '@/store/useUIStore';
import { FormulaDisplay } from '@/components/FormulaDisplay';
import { getStructureFieldValue } from '@/domain/structure/dynamicFields';
import { fitnessValue } from '@/domain/structure/fitness';
import type { NumericOperator, Structure, UnifiedConditionGroup } from '@/types/structure';

export function FilterPreviewTable({
  sortedStructures,
  groups,
  showGeometry,
  t,
}: {
  sortedStructures: Structure[];
  groups: UnifiedConditionGroup[];
  showGeometry: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const openViewer = useUIStore(state => state.openViewer);
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
      tabIndex={0}
      role="region"
      aria-label={t('filter.previewLabel')}
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
            {showGeometry && <th style={headerStyle}>POSCAR</th>}
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
              <th scope="row">
                {s.poscarData
                  ? <button type="button" className="structure-link" onClick={() => openViewer(s.id)}
                      aria-label={`EA${s.id} · ${t('btn.viewStructure')}`}>EA{s.id}</button>
                  : `EA${s.id}`}
              </th>
              <td><FormulaDisplay formula={s.formula} /></td>
              <td>{s.spaceGroup}</td>
              <td>{s.enthalpyTotal <= 900 ? s.enthalpy.toFixed(4) : '—'}</td>
              <td>{fitnessValue(s)?.toFixed(4) ?? '—'}</td>
              <td>{s.origin}</td>
              {showGeometry && <td>{t(s.poscarData ? 'upload.recognized' : 'upload.missing')}</td>}
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
          {t('filter.previewRemaining', { count: sortedStructures.length - 50 })}
        </div>
      )}
    </div>
  );
}
