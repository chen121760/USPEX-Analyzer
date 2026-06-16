import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useCompareStore } from '@/store/useCompareStore';
import { collectDynamicFieldKeys } from '@/domain/structure/dynamicFields';
import { CompareEmptyState } from './components/CompareEmptyState';
import { ComparePropertyTable } from './components/ComparePropertyTable';
import { CompareStructureCard } from './components/CompareStructureCard';
import type { Structure } from '@/types/structure';

export function ComparePage() {
  const { t } = useTranslation();
  const structures = useProjectStore((s) => s.structures);
  const compareIds = useCompareStore((s) => s.compareIds);
  const toggleCompare = useCompareStore((s) => s.toggleCompare);
  const clearCompare = useCompareStore((s) => s.clearCompare);

  const compareStructures = useMemo(() => {
    return compareIds
      .map((id) => structures.find((s) => s.id === id))
      .filter(Boolean) as Structure[];
  }, [compareIds, structures]);

  // 动态检测：ML 属性与指纹数据是否存在
  const hasML          = structures.some((s) => s.bulkModulus >= 0);
  const hasFingerprint = structures.some((s) => s.qEntropy > 0);

  const extraPropKeys = useMemo(() => collectDynamicFieldKeys(structures), [structures]);

  if (compareStructures.length === 0) {
    return (
      <CompareEmptyState title={t('compare.title')} hint={t('compare.hint')} />
    );
  }

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
          <CompareStructureCard
            key={s.id}
            structure={s}
            onRemove={() => toggleCompare(s.id)}
          />
        ))}
      </div>

      <ComparePropertyTable
        compareStructures={compareStructures}
        hasML={hasML}
        hasFingerprint={hasFingerprint}
        extraPropKeys={extraPropKeys}
        t={t}
      />
    </div>
  );
}
