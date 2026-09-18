/**
 * Symmetry reference panel for the structure detail view.
 *
 * Shows how the space group of one structure compares between USPEX's own
 * `Sym.group` value (`symm-USPEX`) and `@spglib/moyo-wasm` run at several
 * distance tolerances. Values are read from the precomputed analysis cached on
 * the structure; if that is missing (for example a structure added inside the
 * Hull Workshop), the analysis is requested on the spot from the interactive
 * symmetry worker.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Structure, SymmetryAnalysis, SymmetryPoint } from '@/types/structure';
import {
  MOYO_SYMMETRY_LABEL,
  SYMMETRY_CUSTOM_PLACEHOLDER,
  SYMMETRY_SYMPRECS,
  USPEX_SYMMETRY_LABEL,
  crystalSystemKey,
  formatSymprec,
  isSymmetryAnalysisCurrent,
} from '@/domain/symmetry/symmetryConstants';
import { symmetryService } from '@/domain/symmetry/symmetryService';

interface SymmetryPanelProps {
  structure: Structure;
  /** True for 2D (surface) searches, where the slab is analysed as a 3D cell. */
  isSlab?: boolean;
}

type RowKey = 'uspex' | number;

export function SymmetryPanel({ structure, isSlab = false }: SymmetryPanelProps) {
  const { t } = useTranslation();

  const cached = isSymmetryAnalysisCurrent(structure.symmetry) ? structure.symmetry : null;
  const [local, setLocal] = useState<SymmetryAnalysis | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [selected, setSelected] = useState<RowKey>('uspex');
  const [customValue, setCustomValue] = useState('');
  const [customPoint, setCustomPoint] = useState<SymmetryPoint | null>(null);
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const analysis = cached ?? local;
  const poscar = structure.poscarData;

  // Reset per-structure state and fetch the analysis on demand when it is not cached.
  useEffect(() => {
    setLocal(null);
    setLoadFailed(false);
    setCustomPoint(null);
    setCustomError(null);
    setSelected('uspex');

    if (cached || !poscar) return;
    let cancelled = false;
    symmetryService
      .analyzeOne({ id: structure.id, poscar })
      .then((result) => {
        if (!cancelled) setLocal(result);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // `cached` identity changes whenever the store merges a new analysis in.
  }, [structure.id, poscar, cached]);

  const uspexNumber = structure.spaceGroup > 0 ? structure.spaceGroup : 0;
  const points = analysis?.points ?? [];

  const customSymprec = useMemo(() => {
    const parsed = Number(customValue.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [customValue]);

  const runCustom = async () => {
    if (customSymprec === null || !poscar || customBusy) return;
    setCustomBusy(true);
    setCustomError(null);
    try {
      const point = await symmetryService.analyzeSinglePoint(
        { id: structure.id, poscar },
        customSymprec,
      );
      setCustomPoint(point);
    } catch (error) {
      setCustomPoint(null);
      setCustomError(error instanceof Error ? error.message : String(error));
    } finally {
      setCustomBusy(false);
    }
  };

  const rows: { id: string; key: RowKey; label: string; number: number; symbol: string; source: string }[] = [
    {
      id: 'uspex',
      key: 'uspex',
      label: USPEX_SYMMETRY_LABEL,
      number: uspexNumber,
      symbol: '',
      source: 'uspex',
    },
    ...points.map((point) => ({
      id: `moyo-${point.symprec}`,
      key: point.symprec as RowKey,
      label: `${MOYO_SYMMETRY_LABEL} ${formatSymprec(point.symprec)} Å`,
      number: point.number,
      symbol: point.symbol,
      source: 'moyo',
    })),
    ...(customPoint
      ? [
          {
            id: `custom-${customPoint.symprec}`,
            key: customPoint.symprec as RowKey,
            label: `${MOYO_SYMMETRY_LABEL} ${formatSymprec(customPoint.symprec)} Å`,
            number: customPoint.number,
            symbol: customPoint.symbol,
            source: 'moyo',
          },
        ]
      : []),
  ];

  const selectedPoint =
    typeof selected === 'number'
      ? points.find((point) => point.symprec === selected) ??
        (customPoint && customPoint.symprec === selected ? customPoint : null)
      : null;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-text, #333)' }}>
          {t('symmetry.title')}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted, #94a3b8)' }}>
          moyo · spglib
        </span>
      </div>

      {!poscar && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted, #94a3b8)' }}>
          {t('symmetry.noPoscar')}
        </div>
      )}

      {poscar && !analysis && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted, #94a3b8)' }}>
          {loadFailed ? t('symmetry.failed') : t('symmetry.computing')}
        </div>
      )}

      {poscar && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 30px 76px',
              gap: 4,
              padding: '0 6px',
              fontSize: 9,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-text-muted, #94a3b8)',
            }}
          >
            <span>{t('symmetry.method')}</span>
            <span style={{ textAlign: 'right' }}>{t('symmetry.sgShort')}</span>
            <span>{t('symmetry.symbolShort')}</span>
          </div>

          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row.key)}
              style={rowStyle(selected === row.key)}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: row.source === 'uspex' ? 'var(--color-text, #111)' : 'var(--color-text-secondary, #64748b)',
                }}
              >
                {row.label}
              </span>
              <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {row.number > 0 ? row.number : '—'}
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--color-text-secondary, #64748b)',
                }}
              >
                {row.symbol || '—'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Detail card for the selected row */}
      {poscar && selected === 'uspex' && (
        <div style={detailStyle}>
          <DetailLine label={t('symmetry.method')} value="USPEX Sym.group" />
          <DetailLine label={t('symmetry.tolerance')} value={t('symmetry.uspexTolerance')} />
          <DetailLine
            label={t('symmetry.crystalSystemLabel')}
            value={uspexNumber > 0 ? t(`symmetry.crystalSystem.${crystalSystemKey(uspexNumber)}`) : '—'}
          />
        </div>
      )}

      {poscar && selectedPoint && (
        <div style={detailStyle}>
          <DetailLine label={t('symmetry.tolerance')} value={`${formatSymprec(selectedPoint.symprec)} Å`} />
          <DetailLine
            label={t('symmetry.crystalSystemLabel')}
            value={t(`symmetry.crystalSystem.${crystalSystemKey(selectedPoint.number)}`)}
          />
          <DetailLine label={t('symmetry.pearson')} value={selectedPoint.pearson || '—'} />
          <DetailLine label={t('symmetry.operations')} value={String(selectedPoint.operations)} />
          <DetailLine label={t('symmetry.hallNumber')} value={String(selectedPoint.hallNumber)} />
        </div>
      )}

      {analysis?.error && (
        <div style={{ fontSize: 10, color: 'var(--color-danger, #dc2626)', marginTop: 4 }}>
          {analysis.error}
        </div>
      )}

      {/* Custom tolerance probe */}
      {poscar && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted, #94a3b8)', marginBottom: 3 }}>
            {t('symmetry.customLabel')}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              value={customValue}
              placeholder={SYMMETRY_CUSTOM_PLACEHOLDER}
              onChange={(event) => setCustomValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runCustom();
              }}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '2px 6px',
                fontSize: 11,
                borderRadius: 4,
                border: '1px solid var(--color-border, #d1d5db)',
                background: 'var(--color-surface, #fff)',
                color: 'var(--color-text, #111)',
              }}
            />
            <button
              type="button"
              onClick={() => void runCustom()}
              disabled={customSymprec === null || customBusy}
              style={{
                padding: '2px 10px',
                fontSize: 11,
                borderRadius: 4,
                border: '1px solid var(--color-primary, #3b82f6)',
                background: customSymprec === null || customBusy ? 'transparent' : 'var(--color-primary, #3b82f6)',
                color: customSymprec === null || customBusy ? 'var(--color-text-muted, #94a3b8)' : '#fff',
                cursor: customSymprec === null || customBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {customBusy ? '…' : t('symmetry.customRun')}
            </button>
          </div>
          {customError && (
            <div style={{ fontSize: 10, color: 'var(--color-danger, #dc2626)', marginTop: 3 }}>
              {customError}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--color-text-muted, #94a3b8)', marginTop: 6, lineHeight: 1.5 }}>
        {t('symmetry.hint', {
          tolerances: SYMMETRY_SYMPRECS.map(formatSymprec).join(' / '),
        })}
      </div>

      {isSlab && (
        <div style={{ fontSize: 10, color: 'var(--color-text-muted, #94a3b8)', marginTop: 4, lineHeight: 1.5 }}>
          {t('symmetry.slabCaveat')}
        </div>
      )}
    </div>
  );
}

function rowStyle(active: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: '1fr 30px 76px',
    gap: 4,
    alignItems: 'center',
    padding: '3px 6px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    textAlign: 'left',
    width: '100%',
    border: `1px solid ${active ? 'var(--color-primary, #3b82f6)' : 'transparent'}`,
    background: active ? 'var(--color-surface-hover, rgba(99,102,241,0.08))' : 'transparent',
    color: 'var(--color-text, #111)',
  };
}

const detailStyle: CSSProperties = {
  marginTop: 6,
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--color-border, #e5e7eb)',
  background: 'var(--color-bg-secondary, #f8fafc)',
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: 8,
  rowGap: 3,
  fontSize: 10,
};

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: 'var(--color-text-muted, #94a3b8)' }}>{label}</span>
      <span
        style={{
          color: 'var(--color-text, #111)',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={value}
      >
        {value}
      </span>
    </>
  );
}
