import { DualRangeSlider } from '@/charts/shared/RangeControls';
import type { Structure } from '@/types/structure';

interface FieldOption {
  key: string;
  label: string;
  accessor: (s: Structure) => number | string | undefined;
  type: 'numeric' | 'categorical';
}

export function ExplorerControls({
  t,
  fields,
  xKey,
  yKey,
  colorKey,
  xField,
  yField,
  colorField,
  showXMarginal,
  showYMarginal,
  xExcludeZero,
  yExcludeZero,
  marginalBins,
  filteredData,
  xMin,
  xMax,
  yMin,
  yMax,
  filteredCount,
  colorDataRange,
  cMin,
  cMax,
  isPlaying,
  isExporting,
  playStep,
  playFps,
  setXKey,
  setYKey,
  setColorKey,
  setShowXMarginal,
  setShowYMarginal,
  setXExcludeZero,
  setYExcludeZero,
  setMarginalBins,
  setCMin,
  setCMax,
  handlePlay,
  handleStop,
  handleExportGif,
  setPlayStep,
  setPlayFps,
}: {
  t: (k: string) => string;
  fields: FieldOption[];
  xKey: string;
  yKey: string;
  colorKey: string;
  xField: FieldOption;
  yField: FieldOption;
  colorField?: FieldOption;
  showXMarginal: boolean;
  showYMarginal: boolean;
  xExcludeZero: boolean;
  yExcludeZero: boolean;
  marginalBins: number;
  filteredData: Structure[];
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  filteredCount: number;
  colorDataRange: { min: number; max: number } | null;
  cMin: number | null;
  cMax: number | null;
  isPlaying: boolean;
  isExporting: boolean;
  playStep: number;
  playFps: number;
  setXKey: (value: string) => void;
  setYKey: (value: string) => void;
  setColorKey: (value: string) => void;
  setShowXMarginal: (value: boolean) => void;
  setShowYMarginal: (value: boolean) => void;
  setXExcludeZero: (value: boolean) => void;
  setYExcludeZero: (value: boolean) => void;
  setMarginalBins: (value: number) => void;
  setCMin: (value: number | null) => void;
  setCMax: (value: number | null) => void;
  handlePlay: () => void;
  handleStop: () => void;
  handleExportGif: () => void;
  setPlayStep: (value: number) => void;
  setPlayFps: (value: number) => void;
}) {
  const selectStyle: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    fontSize: 12,
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  };

  const xRangeMin = xMin !== '' ? parseFloat(xMin) : null;
  const xRangeMax = xMax !== '' ? parseFloat(xMax) : null;
  const yRangeMin = yMin !== '' ? parseFloat(yMin) : null;
  const yRangeMax = yMax !== '' ? parseFloat(yMax) : null;
  const xDistributionCount = filteredData.map((s) => xField.accessor(s) as number).filter((v) => {
    if (v == null || !isFinite(v)) return false;
    if (xExcludeZero && v === 0) return false;
    if (xRangeMin !== null && v < xRangeMin) return false;
    if (xRangeMax !== null && v > xRangeMax) return false;
    return true;
  }).length;
  const yDistributionCount = filteredData.map((s) => yField.accessor(s) as number).filter((v) => {
    if (v == null || !isFinite(v)) return false;
    if (yExcludeZero && v === 0) return false;
    if (yRangeMin !== null && v < yRangeMin) return false;
    if (yRangeMax !== null && v > yRangeMax) return false;
    return true;
  }).length;

  return (
    <>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.xAxis')}:
          <select value={xKey} onChange={(e) => setXKey(e.target.value)} style={selectStyle}>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button
            onClick={() => setShowXMarginal(!showXMarginal)}
            title="Toggle X distribution"
            style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
              border: '1px solid var(--color-border)',
              background: showXMarginal ? 'var(--color-primary)' : 'transparent',
              color: showXMarginal ? 'var(--color-primary-contrast)' : 'var(--color-text-muted)',
            }}
          >
            ∫ dist
          </button>
          {showXMarginal && (
            <button
              onClick={() => setXExcludeZero(!xExcludeZero)}
              title="Exclude zero values from X distribution"
              style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--color-border)',
                background: xExcludeZero ? 'var(--color-warning)' : 'transparent',
                color: xExcludeZero ? 'var(--color-warning-contrast)' : 'var(--color-text-muted)',
              }}
            >
              ≠0
            </button>
          )}
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.yAxis')}:
          <select value={yKey} onChange={(e) => setYKey(e.target.value)} style={selectStyle}>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button
            onClick={() => setShowYMarginal(!showYMarginal)}
            title="Toggle Y distribution"
            style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
              border: '1px solid var(--color-border)',
              background: showYMarginal ? 'var(--color-primary)' : 'transparent',
              color: showYMarginal ? 'var(--color-primary-contrast)' : 'var(--color-text-muted)',
            }}
          >
            ∫ dist
          </button>
          {showYMarginal && (
            <button
              onClick={() => setYExcludeZero(!yExcludeZero)}
              title="Exclude zero values from Y distribution"
              style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--color-border)',
                background: yExcludeZero ? 'var(--color-warning)' : 'transparent',
                color: yExcludeZero ? 'var(--color-warning-contrast)' : 'var(--color-text-muted)',
              }}
            >
              ≠0
            </button>
          )}
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.colorBy')}:
          <select value={colorKey} onChange={(e) => setColorKey(e.target.value)} style={selectStyle}>
            <option value="">{t('explorer.none')}</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>

        {(showXMarginal || showYMarginal) && (
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
            bins
            <input
              type="number" min={5} max={200} step={1} value={marginalBins}
              onChange={(e) => setMarginalBins(Math.max(5, Math.min(200, Number(e.target.value))))}
              style={{ width: 48, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
            {showXMarginal && <span style={{ color: 'var(--color-text-muted)' }}>X: n={xDistributionCount}</span>}
            {showYMarginal && <span style={{ color: 'var(--color-text-muted)' }}>Y: n={yDistributionCount}</span>}
          </label>
        )}

        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {filteredCount} pts
        </span>
      </div>

      {colorField && colorField.type === 'numeric' && colorDataRange && (
        <div style={{ marginBottom: 12 }}>
          <DualRangeSlider
            label={`Color: ${colorField.label}`}
            dataMin={colorDataRange.min}
            dataMax={colorDataRange.max}
            low={cMin ?? colorDataRange.min}
            high={cMax ?? colorDataRange.max}
            onChange={(lo, hi) => { setCMin(lo); setCMax(hi); }}
            isPlaying={isPlaying}
            isExporting={isExporting}
            onPlay={handlePlay}
            onStop={handleStop}
            onExportGif={handleExportGif}
            playStep={playStep}
            playFps={playFps}
            onPlayStepChange={setPlayStep}
            onPlayFpsChange={setPlayFps}
          />
        </div>
      )}
    </>
  );
}
