import type { Structure, TagDefinition } from '@/types/structure';

type TagState = 'include' | 'exclude';
type Translate = (key: string, options?: Record<string, unknown>) => string;

export function UnifiedTagFilter({
  t,
  tags,
  structures,
  tagStates,
  setTagStates,
  compact = false,
  onChanged,
}: {
  t: Translate;
  tags: TagDefinition[];
  structures: Structure[];
  tagStates: Record<string, TagState>;
  setTagStates: (states: Record<string, TagState>) => void;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const cycleTag = (tagId: string) => {
    const current = tagStates[tagId];
    const next = { ...tagStates };
    if (current === undefined) next[tagId] = 'include';
    else if (current === 'include') next[tagId] = 'exclude';
    else delete next[tagId];
    setTagStates(next);
    onChanged?.();
  };

  const clear = () => {
    setTagStates({});
    onChanged?.();
  };

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('table.tagLabel')}</span>
      <button className={`btn btn-sm ${Object.keys(tagStates).length === 0 ? 'btn-primary' : 'btn-outline'}`} onClick={clear} style={{ fontSize: 11, padding: '2px 8px' }}>
        {t('btn.all')}
      </button>
      {tags.map((tag) => {
        const count = structures.filter((structure) => structure.tags.includes(tag.id)).length;
        if (compact && count === 0) return null;
        const state = tagStates[tag.id];
        return (
          <button key={tag.id} className="btn btn-sm" onClick={() => cycleTag(tag.id)} title={t('filter.tagFilterHint')} style={{
            fontSize: 11,
            padding: '2px 8px',
            border: `1px solid ${state === 'exclude' ? '#ef4444' : tag.color}`,
            color: state ? '#fff' : tag.color,
            background: state === 'include' ? tag.color : state === 'exclude' ? '#ef4444' : 'transparent',
            textDecoration: state === 'exclude' ? 'line-through' : 'none',
          }}>
            {state === 'include' ? '✓ ' : state === 'exclude' ? '✗ ' : ''}{t(tag.nameKey)} ({count})
          </button>
        );
      })}
    </div>
  );
}
