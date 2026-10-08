import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useProgressiveData } from '@/hooks/useProgressiveData';
import { BinaryHullPlot } from './BinaryHullPlot';
import { TernaryHullPlot } from './TernaryHullPlot';
import { TernaryHullPlot3D } from './TernaryHullPlot3D';
import { QuaternaryHullPlot3D } from './QuaternaryHullPlot3D';
import { EnergyRankingChart } from './EnergyRankingChart';
import { HullMetricContext } from './HullMetricContext';
import { hullDisplayStructures, type HullDisplayMetric } from '@/domain/hull/displayMetric';

export function ConvexHullPage() {
  const { t } = useTranslation();
  const rawStructures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);
  const projectId = useProjectStore((s) => s.projectId);
  const { data: structures, ready } = useProgressiveData(rawStructures);

  const compositionMode = systemInfo?.compositionMode ?? 'fixed';
  const systemType = systemInfo?.systemType ?? 'binary';
  const isTernaryVarcomp = compositionMode !== 'fixed' && systemType === 'ternary';

  const [viewState, setViewState] = useState<{ projectId: string; mode: '2d' | '3d' }>({ projectId, mode: '2d' });
  const [fitnessState, setFitnessState] = useState<{ projectId: string; value: number | null }>({ projectId, value: null });
  const viewMode = viewState.projectId === projectId ? viewState.mode : '2d';
  const setViewMode = (mode: '2d' | '3d') => setViewState({ projectId, mode });
  const fitnessLimit = fitnessState.projectId === projectId ? fitnessState.value : null;
  const onFitnessLimitChange = (value: number) => setFitnessState({ projectId, value });
  const [metricState, setMetricState] = useState<{ projectId: string; value: HullDisplayMetric }>({ projectId, value: 'fitness' });
  const metric = metricState.projectId === projectId ? metricState.value : 'fitness';
  const chartStructures = useMemo(() => hullDisplayStructures(structures, metric), [structures, metric]);
  const metricInfo = metric === 'fitness' ? { name: 'Fitness', unit: 'eV/block' }
    : { name: 'Ed (Recons)', unit: systemInfo?.referenceInfo?.unit ?? 'eV/atom' };

  // Every hook above is unconditional; the loading and empty states come after.
  if (!ready) {
    return <PageSkeleton label={t('loading')} />;
  }

  if (!structures.length || !systemInfo) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          color: 'var(--color-text-muted)',
        }}
      >
        {t('noData')}
      </div>
    );
  }

  // Determine page title based on mode
  const pageTitle =
    compositionMode === 'fixed'
      ? t('hull.energyRanking', 'Energy Ranking')
      : systemType === 'ternary'
        ? t('hull.ternaryTitle', 'Ternary Phase Diagram')
        : systemType === 'quaternary'
          ? t('hull.quaternaryTitle', 'Quaternary Phase Diagram')
          : t('hull.title', 'Convex Hull');

  return (
    <div className="fade-in">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          {pageTitle}
        </h1>

        {/* 2D/3D toggle for ternary varcomp — top right */}
        {isTernaryVarcomp && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {t('hull.view', 'View')}:
            </span>
            <button
              onClick={() => setViewMode('2d')}
              aria-pressed={viewMode === '2d'}
              style={{
                padding: '4px 14px',
                fontSize: 12,
                fontWeight: viewMode === '2d' ? 600 : 400,
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                background:
                  viewMode === '2d'
                    ? 'var(--color-accent)'
                    : 'var(--color-bg-secondary)',
                color:
                  viewMode === '2d'
                    ? '#fff'
                    : 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              {t('hull.view2D', '2D Projection')}
            </button>
            <button
              onClick={() => setViewMode('3d')}
              aria-pressed={viewMode === '3d'}
              style={{
                padding: '4px 14px',
                fontSize: 12,
                fontWeight: viewMode === '3d' ? 600 : 400,
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                background:
                  viewMode === '3d'
                    ? 'var(--color-accent)'
                    : 'var(--color-bg-secondary)',
                color:
                  viewMode === '3d'
                    ? '#fff'
                    : 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              {t('hull.view3D', '3D View')}
            </button>
          </div>
        )}
      </div>

      {/* Reference-phase warning: without an exact endmember the reconstructed
          E_form / E_hull are undefined for the affected structures — say so
          instead of letting the plots fall back silently. */}
      {compositionMode !== 'fixed' &&
        systemInfo.referenceInfo &&
        !systemInfo.referenceInfo.complete && (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 12px',
              border: '1px solid var(--color-warning, #d97706)',
              borderRadius: 6,
              background: 'var(--color-warning-bg, rgba(217,119,6,0.10))',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--color-text-secondary)',
            }}
          >
            <strong style={{ color: 'var(--color-warning, #d97706)' }}>
              {systemInfo.referenceInfo.reason === 'rank-deficient'
                ? t('hull.referenceRankDeficient', {
                    missing: systemInfo.referenceInfo.missing.join(', '),
                    defaultValue: 'Linearly dependent composition blocks: {{missing}}',
                  })
                : t('hull.referenceMissing', {
                    missing: systemInfo.referenceInfo.missing.join(', '),
                    defaultValue: 'Missing reference phase: {{missing}}',
                  })}
            </strong>
            <div style={{ marginTop: 2 }}>
              {systemInfo.referenceInfo.reason === 'rank-deficient'
                ? t('hull.referenceRankDeficientDetail', {
                    defaultValue:
                      'The numSpecies blocks are linearly dependent, so E_form / E_hull cannot be defined.',
                  })
                : t('hull.referenceMissingDetail', {
                    defaultValue:
                      'This dataset contains no exact endmember for these components, so E_form / E_hull are unavailable for structures containing them.',
                  })}
            </div>
          </div>
        )}

      {compositionMode !== 'fixed' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 13 }}>
          <label>
            {t('hull.distanceSource')}{' '}
            <select value={metric} onChange={event => {
              setMetricState({ projectId, value: event.target.value as HullDisplayMetric });
              setFitnessState({ projectId, value: null });
            }}>
              <option value="fitness">{t(systemInfo.fitnessSemantics === 'uspex-original' ? 'hull.rawFitness' : 'hull.legacyFitness')}</option>
              <option value="reconstructed">{t('hull.reconstructedDistance')}</option>
            </select>
          </label>
          {metric === 'fitness' && structures.some(s => !Number.isFinite(s.fitness)) &&
            <span style={{ color: 'var(--color-text-secondary)' }}>{t('hull.missingFitnessDetail')}</span>}
        </div>
      )}
      {systemInfo.fitnessSemantics !== 'uspex-original' &&
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-warning)' }} role="status">{t('hull.legacyFitnessDetail')}</div>}
      <HullMetricContext.Provider value={metricInfo}>
      {compositionMode === 'fixed' ? (
        <EnergyRankingChart structures={structures} systemInfo={systemInfo} />
      ) : systemType === 'ternary' ? (
        viewMode === '2d' ? (
          <TernaryHullPlot key={`${projectId}-${metric}`} structures={chartStructures} systemInfo={systemInfo} fitnessLimit={fitnessLimit} onFitnessLimitChange={onFitnessLimitChange} />
        ) : (
          <TernaryHullPlot3D key={`${projectId}-${metric}`} structures={chartStructures} systemInfo={systemInfo} fitnessLimit={fitnessLimit} onFitnessLimitChange={onFitnessLimitChange} />
        )
      ) : systemType === 'quaternary' ? (
        <QuaternaryHullPlot3D key={`${projectId}-${metric}`} structures={chartStructures} systemInfo={systemInfo} />
      ) : (
        <BinaryHullPlot key={`${projectId}-${metric}`} structures={chartStructures} systemInfo={systemInfo} />
      )}
      </HullMetricContext.Provider>
    </div>
  );
}
