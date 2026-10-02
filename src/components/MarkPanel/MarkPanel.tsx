import { useTranslation } from 'react-i18next';
import { useMarkStore } from '@/store/useMarkStore';
import { useProjectStore } from '@/store/useProjectStore';
import { parseEaIds } from '@/lib/parseEaIds';
import type { Structure } from '@/types/structure';
import { useId } from 'react';

/**
 * MarkPanel — shared overlay-mark control panel for all chart pages.
 *
 * Reads/writes mark state from MarkStore directly (no props needed).
 * Renders tag toggle buttons and an EA ID search input.
 * Active tags/IDs cause star markers to be overlaid on chart points.
 */
export function MarkPanel({ showTags = true, visibleStructures }: { showTags?: boolean; visibleStructures?: Structure[] }) {
  const { t } = useTranslation();
  const inputId = useId();

  const markActiveTags  = useMarkStore((s) => s.markActiveTags);
  const markEaInput     = useMarkStore((s) => s.markEaInput);
  const setMarkActiveTags = useMarkStore((s) => s.setMarkActiveTags);
  const setMarkEaInput  = useMarkStore((s) => s.setMarkEaInput);
  const clearMarks      = useMarkStore((s) => s.clearMarks);

  const allTags    = useProjectStore((s) => s.tags);
  const structures = useProjectStore((s) => s.structures);

  function toggleTag(tagId: string) {
    if (markActiveTags.includes(tagId)) {
      setMarkActiveTags(markActiveTags.filter((id) => id !== tagId));
    } else {
      setMarkActiveTags([...markActiveTags, tagId]);
    }
  }

  // Count how many visible structures match the EA input
  const eaIds = parseEaIds(markEaInput);
  const eaMatchCount = eaIds.size > 0
    ? (visibleStructures ?? structures).filter((s) => eaIds.has(s.id)).length
    : -1;

  const hasAnyMark = markActiveTags.length > 0 || markEaInput.trim() !== '';

  return (
    <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          {t('mark.title')}
        </span>
        {hasAnyMark && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={clearMarks}
            style={{ fontSize: 12, padding: '2px 10px' }}
          >
            {t('mark.clearAll')}
          </button>
        )}
      </div>

      {/* Tag section */}
      {showTags && <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginRight: 8 }}>
          {t('mark.byTag')}:
        </span>
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
          {allTags.map((tag) => {
            const active = markActiveTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTag(tag.id)}
                style={{
                  fontSize: 12,
                  padding: '2px 10px',
                  borderRadius: 12,
                  border: `1.5px solid ${tag.color}`,
                  background: active ? tag.color : 'transparent',
                  color: active ? '#ffffff' : tag.color,
                  cursor: 'pointer',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {active ? '★ ' : '☆ '}{t(tag.nameKey)}
              </button>
            );
          })}
        </span>
      </div>}

      {/* EA ID section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label htmlFor={inputId} style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          {t('mark.byEaId')}:
        </label>
        <input
          id={inputId}
          type="text"
          value={markEaInput}
          onChange={(e) => setMarkEaInput(e.target.value)}
          placeholder={t('mark.eaPlaceholder')}
          style={{
            fontSize: 12,
            padding: '3px 8px',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            width: 240,
          }}
        />
        {eaIds.size > 0 && (
          <span style={{ fontSize: 12, color: eaMatchCount > 0 ? '#f59e0b' : 'var(--color-text-secondary)' }}>
            {eaMatchCount > 0
              ? t('mark.matched', { count: eaMatchCount })
              : t('mark.noMatch')}
          </span>
        )}
      </div>
    </div>
  );
}
