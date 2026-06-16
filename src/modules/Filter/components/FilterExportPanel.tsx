import { Download, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectControl, TextInput } from '@/components/ui/FormControls';
import type { CustomNamePart } from '@/types/structure';

export function FilterExportPanel({
  t,
  exportFormat,
  setExportFormat,
  nameParts,
  customNameParts,
  setCustomNameParts,
  numericFields,
  sortKey,
  sortReverse,
  previewName,
  filteredCount,
  toggleNamePart,
  setSortKey,
  setSortReverse,
  handleExport,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  exportFormat: 'zip' | 'seeds' | 'csv' | 'json';
  setExportFormat: (format: 'zip' | 'seeds' | 'csv' | 'json') => void;
  nameParts: number[];
  customNameParts: CustomNamePart[];
  setCustomNameParts: (parts: CustomNamePart[]) => void;
  numericFields: string[];
  sortKey: string;
  sortReverse: boolean;
  previewName: string;
  filteredCount: number;
  toggleNamePart: (part: number) => void;
  setSortKey: (key: string) => void;
  setSortReverse: (reverse: boolean) => void;
  handleExport: () => void;
}) {
  return (
    <Card>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t('export.title')}</h3>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{t('export.format')}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['zip', 'seeds', 'csv', 'json'] as const).map((fmt) => (
            <Button
              key={fmt}
              size="sm"
              variant={exportFormat === fmt ? 'primary' : 'outline'}
              onClick={() => setExportFormat(fmt)}
            >
              {t(`export.format${fmt.charAt(0).toUpperCase() + fmt.slice(1)}`)}
            </Button>
          ))}
        </div>
      </div>

      {exportFormat === 'zip' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{t('export.naming')}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              [1, t('export.nameParts.index')], [2, t('export.nameParts.id')],
              [3, t('export.nameParts.sg')], [4, t('export.nameParts.fitness')],
              [5, t('export.nameParts.secondObj')], [6, t('export.nameParts.formula')],
            ] as [number, string][]).map(([n, label]) => (
              <Button
                key={n}
                size="sm"
                variant={nameParts.includes(n) ? 'primary' : 'outline'}
                onClick={() => toggleNamePart(n)}
              >
                [{n}] {label}
              </Button>
            ))}
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {t('export.customNameParts')}
            </div>
            {customNameParts.map((cp) => (
              <div key={cp.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <TextInput
                  type="text"
                  value={cp.label}
                  placeholder={t('export.customLabel')}
                  style={{ width: 70 }}
                  onChange={(e) => setCustomNameParts(
                    customNameParts.map((p) => p.id === cp.id ? { ...p, label: e.target.value } : p),
                  )}
                />
                <SelectControl
                  value={cp.field}
                  onChange={(e) => setCustomNameParts(
                    customNameParts.map((p) => p.id === cp.id ? { ...p, field: e.target.value } : p),
                  )}
                >
                  {numericFields.map((f) => (
                    <option key={f} value={f}>{t(`col.${f}`) || f}</option>
                  ))}
                </SelectControl>
                <Button
                  size="sm"
                  variant="outline"
                  style={{ padding: '3px 7px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                  onClick={() => setCustomNameParts(customNameParts.filter((p) => p.id !== cp.id))}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setCustomNameParts([
                ...customNameParts,
                { id: crypto.randomUUID(), label: '', field: numericFields[0] ?? 'generation' },
              ])}
            >
              <Plus size={12} /> {t('export.addCustomPart')}
            </Button>
          </div>

          <div style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-muted)' }}>
            {t('export.preview')}: <code style={{ background: 'var(--color-bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>{previewName}</code>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t('export.sortBy')}:</span>
        <SelectControl value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          {numericFields.map((f) => <option key={f} value={f}>{t(`col.${f}`) || f}</option>)}
        </SelectControl>
        <Button size="sm" variant="outline" onClick={() => setSortReverse(!sortReverse)}>
          {sortReverse ? t('export.descending') : t('export.ascending')}
        </Button>
      </div>

      <Button variant="primary" onClick={handleExport} disabled={filteredCount === 0}
        style={{ width: '100%', padding: '10px 20px', fontSize: 14, opacity: filteredCount > 0 ? 1 : 0.4 }}>
        <Download size={16} />
        {t('export.exportCount', { count: filteredCount })}
      </Button>
    </Card>
  );
}
