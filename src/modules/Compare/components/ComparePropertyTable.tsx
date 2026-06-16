import { FormulaDisplay } from '@/components/FormulaDisplay';
import type { Structure } from '@/types/structure';

function PropRow({
  label,
  values,
  fmt,
}: {
  label: string;
  values: (string | number | undefined)[];
  fmt?: (v: unknown) => string;
}) {
  const format = fmt ?? ((v: unknown) => (v != null ? String(v) : '—'));
  return (
    <tr>
      <td style={{ fontWeight: 500, color: 'var(--color-text-secondary)', fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}>
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} style={{ padding: '6px 12px', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {format(v)}
        </td>
      ))}
    </tr>
  );
}

export function ComparePropertyTable({
  compareStructures,
  hasML,
  hasFingerprint,
  extraPropKeys,
  t,
}: {
  compareStructures: Structure[];
  hasML: boolean;
  hasFingerprint: boolean;
  extraPropKeys: string[];
  t: (key: string) => string;
}) {
  const numFmt = (decimals: number) => (v: unknown) => {
    if (v == null) return '—';
    const n = Number(v);
    return isNaN(n) || n > 900 ? '—' : n.toFixed(decimals);
  };

  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', borderBottom: '2px solid var(--color-border)' }}>
              Property
            </th>
            {compareStructures.map((s) => (
              <th key={s.id} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, borderBottom: '2px solid var(--color-border)' }}>
                EA{s.id} (<FormulaDisplay formula={s.formula} />)
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={compareStructures.length + 1} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Thermodynamic</td></tr>
          <PropRow label={t('col.enthalpy')} values={compareStructures.map((s) => s.enthalpy)} fmt={numFmt(4)} />
          <PropRow label={t('col.volume')} values={compareStructures.map((s) => s.volume)} fmt={numFmt(3)} />
          <PropRow label={t('col.fitness')} values={compareStructures.map((s) => s.fitness)} fmt={numFmt(4)} />
          <PropRow label={t('col.density')} values={compareStructures.map((s) => s.density)} fmt={numFmt(3)} />

          <tr><td colSpan={compareStructures.length + 1} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Symmetry & Origin</td></tr>
          <PropRow label={t('col.spaceGroup')} values={compareStructures.map((s) => s.spaceGroup)} />
          <PropRow label={t('col.generation')} values={compareStructures.map((s) => s.generation)} />
          <PropRow label={t('col.origin')} values={compareStructures.map((s) => s.origin)} />

          {compareStructures.some((s) => s.latticeParams) && (
            <>
              <tr><td colSpan={compareStructures.length + 1} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Lattice</td></tr>
              <PropRow label="a (Å)" values={compareStructures.map((s) => s.latticeParams?.a)} fmt={numFmt(3)} />
              <PropRow label="b (Å)" values={compareStructures.map((s) => s.latticeParams?.b)} fmt={numFmt(3)} />
              <PropRow label="c (Å)" values={compareStructures.map((s) => s.latticeParams?.c)} fmt={numFmt(3)} />
              <PropRow label="α (°)" values={compareStructures.map((s) => s.latticeParams?.alpha)} fmt={numFmt(2)} />
              <PropRow label="β (°)" values={compareStructures.map((s) => s.latticeParams?.beta)} fmt={numFmt(2)} />
              <PropRow label="γ (°)" values={compareStructures.map((s) => s.latticeParams?.gamma)} fmt={numFmt(2)} />
            </>
          )}

          {hasML && compareStructures.some((s) => s.youngModulus >= 0) && (
            <>
              <tr><td colSpan={compareStructures.length + 1} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Elastic Properties (ML)</td></tr>
              <PropRow label={t('col.young')} values={compareStructures.map((s) => s.youngModulus)} fmt={numFmt(1)} />
              <PropRow label={t('col.bulk')} values={compareStructures.map((s) => s.bulkModulus)} fmt={numFmt(1)} />
              <PropRow label={t('col.shear')} values={compareStructures.map((s) => s.shearModulus)} fmt={numFmt(1)} />
              <PropRow label={t('col.poisson')} values={compareStructures.map((s) => s.poissonRatio)} fmt={numFmt(3)} />
              <PropRow label={t('col.pugh')} values={compareStructures.map((s) => s.pughRatio)} fmt={numFmt(3)} />
              <PropRow label={t('col.hardness')} values={compareStructures.map((s) => s.vickersHardness)} fmt={numFmt(1)} />
              <PropRow label={t('col.toughness')} values={compareStructures.map((s) => s.fractureToughness)} fmt={numFmt(2)} />
            </>
          )}

          {hasFingerprint && compareStructures.some((s) => s.qEntropy > 0) && (
            <>
              <tr><td colSpan={compareStructures.length + 1} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Fingerprint</td></tr>
              <PropRow label={t('col.qEntropy')} values={compareStructures.map((s) => s.qEntropy)} fmt={numFmt(3)} />
              <PropRow label={t('col.aOrder')} values={compareStructures.map((s) => s.aOrder)} fmt={numFmt(3)} />
              <PropRow label={t('col.sOrder')} values={compareStructures.map((s) => s.sOrder)} fmt={numFmt(3)} />
            </>
          )}

          {extraPropKeys.length > 0 && compareStructures.some((s) => s.extraProps != null) && (
            <>
              <tr><td colSpan={compareStructures.length + 1} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Extra Properties</td></tr>
              {extraPropKeys.map((key) => (
                <PropRow
                  key={key}
                  label={key}
                  values={compareStructures.map((s) => s.extraProps?.[key])}
                  fmt={numFmt(4)}
                />
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
