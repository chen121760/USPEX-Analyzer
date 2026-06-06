import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { X, Eye, ArrowLeftRight } from 'lucide-react';
import { FormulaDisplay } from '@/components/FormulaDisplay';
import type { Structure } from '@/types/structure';

/** Property row for the comparison table */
function PropRow({ label, values, fmt }: { label: string; values: (string | number | undefined)[]; fmt?: (v: unknown) => string }) {
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

function StructureCard({ structure, onRemove }: { structure: Structure; onRemove: () => void }) {
  const openViewer = useUIStore((s) => s.openViewer);

  return (
    <div className="card" style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="btn btn-ghost btn-sm"
        style={{ position: 'absolute', top: 6, right: 6, padding: 2 }}
        title="Remove"
      >
        <X size={14} />
      </button>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>EA{structure.id}</div>
        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          <FormulaDisplay formula={structure.formula} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          SG {structure.spaceGroup}
        </div>
      </div>

      {/* 3D view button */}
      {structure.poscarData && (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => openViewer(structure.id)}
          >
            <Eye size={14} />
            3D
          </button>
        </div>
      )}
    </div>
  );
}

export function ComparePage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const compareIds = useUIStore((s) => s.compareIds);
  const toggleCompare = useUIStore((s) => s.toggleCompare);
  const clearCompare = useUIStore((s) => s.clearCompare);

  const compareStructures = useMemo(() => {
    return compareIds
      .map((id) => structures.find((s) => s.id === id))
      .filter(Boolean) as Structure[];
  }, [compareIds, structures]);

  // 动态检测：ML 属性与指纹数据是否存在
  const hasML          = structures.some((s) => s.bulkModulus >= 0);
  const hasFingerprint = structures.some((s) => s.qEntropy > 0);

  // 收集所有 extraProps 的 key，使 Compare 能自适应未知字段
  const extraPropKeys = useMemo(() => {
    const keys = new Set<string>();
    structures.forEach((s) => {
      if (s.extraProps) Object.keys(s.extraProps).forEach((k) => keys.add(k));
    });
    return Array.from(keys).sort();
  }, [structures]);

  if (compareStructures.length === 0) {
    return (
      <div className="fade-in" style={{ padding: 60, textAlign: 'center' }}>
        <ArrowLeftRight size={48} color="var(--color-text-muted)" style={{ marginBottom: 16 }} />
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {t('compare.title')}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, maxWidth: 400, margin: '8px auto' }}>
          {t('compare.hint')}
        </p>
      </div>
    );
  }

  const numFmt = (decimals: number) => (v: unknown) => {
    if (v == null) return '—';
    const n = Number(v);
    return isNaN(n) || n > 900 ? '—' : n.toFixed(decimals);
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          {t('compare.title')} ({compareStructures.length})
        </h1>
        <button className="btn btn-ghost btn-sm" onClick={clearCompare}>
          {t('compare.clearAll')}
        </button>
      </div>

      {/* Structure header cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {compareStructures.map((s) => (
          <StructureCard
            key={s.id}
            structure={s}
            onRemove={() => toggleCompare(s.id)}
          />
        ))}
      </div>

      {/* Comparison property table */}
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
            {/* Thermodynamic */}
            <tr><td colSpan={compareStructures.length + 1} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Thermodynamic</td></tr>
            <PropRow label={t('col.enthalpy')} values={compareStructures.map((s) => s.enthalpy)} fmt={numFmt(4)} />
            <PropRow label={t('col.volume')} values={compareStructures.map((s) => s.volume)} fmt={numFmt(3)} />
            <PropRow label={t('col.fitness')} values={compareStructures.map((s) => s.fitness)} fmt={numFmt(4)} />
            <PropRow label={t('col.density')} values={compareStructures.map((s) => s.density)} fmt={numFmt(3)} />

            {/* Symmetry & Origin */}
            <tr><td colSpan={compareStructures.length + 1} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Symmetry & Origin</td></tr>
            <PropRow label={t('col.spaceGroup')} values={compareStructures.map((s) => s.spaceGroup)} />
            <PropRow label={t('col.generation')} values={compareStructures.map((s) => s.generation)} />
            <PropRow label={t('col.origin')} values={compareStructures.map((s) => s.origin)} />

            {/* Lattice */}
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

            {/* ML Properties */}
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

            {/* Fingerprint */}
            {hasFingerprint && compareStructures.some((s) => s.qEntropy > 0) && (
              <>
                <tr><td colSpan={compareStructures.length + 1} style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Fingerprint</td></tr>
                <PropRow label={t('col.qEntropy')} values={compareStructures.map((s) => s.qEntropy)} fmt={numFmt(3)} />
                <PropRow label={t('col.aOrder')} values={compareStructures.map((s) => s.aOrder)} fmt={numFmt(3)} />
                <PropRow label={t('col.sOrder')} values={compareStructures.map((s) => s.sOrder)} fmt={numFmt(3)} />
              </>
            )}

            {/* Dynamic extraProps — 自适应所有未知字段 */}
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
    </div>
  );
}
