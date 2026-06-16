import { DualRangeSlider } from '@/charts/shared/RangeControls';
import type { Structure } from '@/types/structure';

interface FieldOption {
  key: string;
  label: string;
  accessor: (s: Structure) => number | string | undefined;
  type: 'numeric' | 'categorical';
}

const selectStyle: React.CSSProperties = {
  padding: '5px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: 12,
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
};

const btnStyle = (active: boolean, activeColor = 'var(--color-primary)'): React.CSSProperties => ({
  fontSize: 11,
  padding: '2px 7px',
  borderRadius: 4,
  cursor: 'pointer',
  border: '1px solid var(--color-border)',
  background: active ? activeColor : 'transparent',
  color: active ? 'var(--color-primary-contrast)' : 'var(--color-text-muted)',
});

export function BetaExplorerControls({
  t,
  fields,
  xKey,
  yKey,
  colorKey,
  colorField,
  xMinimize,
  yMinimize,
  showXMarginal,
  showYMarginal,
  xExcludeZero,
  yExcludeZero,
  marginalBins,
  filteredCount,
  colorByFront,
  numFronts,
  refMode,
  autoRef,
  refXStore,
  refYStore,
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
  setXMinimize,
  setYMinimize,
  setShowXMarginal,
  setShowYMarginal,
  setXExcludeZero,
  setYExcludeZero,
  setMarginalBins,
  setColorByFront,
  setNumFronts,
  setRefMode,
  setRefXStore,
  setRefYStore,
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
  colorField?: FieldOption;
  xMinimize: boolean;
  yMinimize: boolean;
  showXMarginal: boolean;
  showYMarginal: boolean;
  xExcludeZero: boolean;
  yExcludeZero: boolean;
  marginalBins: number;
  filteredCount: number;
  colorByFront: boolean;
  numFronts: number;
  refMode: 'auto' | 'manual';
  autoRef: { refX: number; refY: number };
  refXStore: number | null;
  refYStore: number | null;
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
  setXMinimize: (value: boolean) => void;
  setYMinimize: (value: boolean) => void;
  setShowXMarginal: (value: boolean) => void;
  setShowYMarginal: (value: boolean) => void;
  setXExcludeZero: (value: boolean) => void;
  setYExcludeZero: (value: boolean) => void;
  setMarginalBins: (value: number) => void;
  setColorByFront: (value: boolean) => void;
  setNumFronts: (value: number) => void;
  setRefMode: (value: 'auto' | 'manual') => void;
  setRefXStore: (value: number | null) => void;
  setRefYStore: (value: number | null) => void;
  setCMin: (value: number | null) => void;
  setCMax: (value: number | null) => void;
  handlePlay: () => void;
  handleStop: () => void;
  handleExportGif: () => void;
  setPlayStep: (value: number) => void;
  setPlayFps: (value: number) => void;
}) {
  const numericFields = fields.filter((f) => f.type === 'numeric');

  return (
    <>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.xAxis')}:
          <select value={xKey} onChange={(e) => setXKey(e.target.value)} style={selectStyle}>
            {numericFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button onClick={() => setXMinimize(!xMinimize)} style={btnStyle(!xMinimize, 'var(--color-warning)')} title="Toggle X direction">
            {xMinimize ? t('beta.xMinimize') : t('beta.xMaximize')}
          </button>
          <button onClick={() => setShowXMarginal(!showXMarginal)} style={btnStyle(showXMarginal)} title="Toggle X distribution">∫ dist</button>
          {showXMarginal && (
            <button onClick={() => setXExcludeZero(!xExcludeZero)} style={btnStyle(xExcludeZero, 'var(--color-warning)')} title="Exclude zero">≠0</button>
          )}
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.yAxis')}:
          <select value={yKey} onChange={(e) => setYKey(e.target.value)} style={selectStyle}>
            {numericFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button onClick={() => setYMinimize(!yMinimize)} style={btnStyle(!yMinimize, 'var(--color-warning)')} title="Toggle Y direction">
            {yMinimize ? t('beta.xMinimize') : t('beta.xMaximize')}
          </button>
          <button onClick={() => setShowYMarginal(!showYMarginal)} style={btnStyle(showYMarginal)} title="Toggle Y distribution">∫ dist</button>
          {showYMarginal && (
            <button onClick={() => setYExcludeZero(!yExcludeZero)} style={btnStyle(yExcludeZero, 'var(--color-warning)')} title="Exclude zero">≠0</button>
          )}
        </label>

        {!colorByFront && (
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            {t('explorer.colorBy')}:
            <select value={colorKey} onChange={(e) => setColorKey(e.target.value)} style={selectStyle}>
              <option value="">{t('explorer.none')}</option>
              {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
        )}

        {(showXMarginal || showYMarginal) && (
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
            bins
            <input
              type="number"
              min={5}
              max={200}
              step={1}
              value={marginalBins}
              onChange={(e) => setMarginalBins(Math.max(5, Math.min(200, Number(e.target.value))))}
              style={{ width: 48, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </label>
        )}

        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{filteredCount} pts</span>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>Pareto</span>

        <button onClick={() => setColorByFront(!colorByFront)} style={btnStyle(colorByFront)}>
          {t('beta.colorByFront')}
        </button>

        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
          {t('beta.numFronts')}
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={numFronts}
            onChange={(e) => setNumFronts(Math.max(1, Math.min(10, Number(e.target.value))))}
            style={{ width: 40, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </label>

        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t('beta.refPoint')}:</span>
        <button onClick={() => setRefMode(refMode === 'auto' ? 'manual' : 'auto')} style={btnStyle(refMode === 'manual', 'var(--color-warning)')}>
          {refMode === 'auto' ? t('beta.refAuto') : t('beta.refManual')}
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          X: {refMode === 'manual' ? '' : autoRef.refX.toPrecision(4)}
        </span>
        {refMode === 'manual' ? (
          <input
            type="number"
            placeholder="refX"
            value={refXStore ?? ''}
            onChange={(e) => setRefXStore(e.target.value === '' ? null : Number(e.target.value))}
            style={{ width: 80, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        ) : null}
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          Y: {refMode === 'manual' ? '' : autoRef.refY.toPrecision(4)}
        </span>
        {refMode === 'manual' ? (
          <input
            type="number"
            placeholder="refY"
            value={refYStore ?? ''}
            onChange={(e) => setRefYStore(e.target.value === '' ? null : Number(e.target.value))}
            style={{ width: 80, padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        ) : null}
      </div>

      {!colorByFront && colorField && colorField.type === 'numeric' && colorDataRange && (
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
