import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { BinaryHullPlot } from './BinaryHullPlot';
import { TernaryHullPlot } from './TernaryHullPlot';
import { EnergyRankingChart } from './EnergyRankingChart';

export function ConvexHullPage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);

  if (!structures.length || !systemInfo) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('noData')}</div>;
  }

  const { compositionMode, systemType } = systemInfo;

  // Determine page title based on mode
  const pageTitle =
    compositionMode === 'fixed'
      ? t('hull.energyRanking', 'Energy Ranking')
      : systemType === 'ternary'
        ? t('hull.ternaryTitle', 'Ternary Phase Diagram')
        : t('hull.title', 'Convex Hull');

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{pageTitle}</h2>

      {compositionMode === 'fixed' ? (
        <EnergyRankingChart structures={structures} systemInfo={systemInfo} />
      ) : systemType === 'ternary' ? (
        <TernaryHullPlot structures={structures} systemInfo={systemInfo} />
      ) : (
        <BinaryHullPlot structures={structures} systemInfo={systemInfo} />
      )}
    </div>
  );
}
