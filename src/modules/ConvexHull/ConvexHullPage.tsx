import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { BinaryHullPlot } from './BinaryHullPlot';
import { TernaryHullPlot } from './TernaryHullPlot';
import { TernaryHullPlot3D } from './TernaryHullPlot3D';
import { QuaternaryHullPlot3D } from './QuaternaryHullPlot3D';
import { EnergyRankingChart } from './EnergyRankingChart';

export function ConvexHullPage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);

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

  const { compositionMode, systemType } = systemInfo;
  const isTernaryVarcomp = compositionMode !== 'fixed' && systemType === 'ternary';

  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

  // Reset to 2D when switching project / system type
  const prevIsTernaryVarcomp = useRef(isTernaryVarcomp);
  useEffect(() => {
    if (prevIsTernaryVarcomp.current !== isTernaryVarcomp) {
      setViewMode('2d');
      prevIsTernaryVarcomp.current = isTernaryVarcomp;
    }
  }, [isTernaryVarcomp]);

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

      {compositionMode === 'fixed' ? (
        <EnergyRankingChart structures={structures} systemInfo={systemInfo} />
      ) : systemType === 'ternary' ? (
        viewMode === '2d' ? (
          <TernaryHullPlot structures={structures} systemInfo={systemInfo} />
        ) : (
          <TernaryHullPlot3D structures={structures} systemInfo={systemInfo} />
        )
      ) : systemType === 'quaternary' ? (
        <QuaternaryHullPlot3D structures={structures} systemInfo={systemInfo} />
      ) : (
        <BinaryHullPlot structures={structures} systemInfo={systemInfo} />
      )}
    </div>
  );
}
