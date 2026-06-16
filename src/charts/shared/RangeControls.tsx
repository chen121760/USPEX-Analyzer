export function RangeInputs({ label, min, max, onMin, onMax, inputStyle }: {
  label: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  inputStyle: React.CSSProperties;
}) {
  return (
    <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
      {label}:
      <input type="number" placeholder="min" value={min} onChange={(e) => onMin(e.target.value)} style={inputStyle} />
      –
      <input type="number" placeholder="max" value={max} onChange={(e) => onMax(e.target.value)} style={inputStyle} />
    </span>
  );
}

export function DualRangeSlider({
  label,
  dataMin,
  dataMax,
  low,
  high,
  onChange,
  isPlaying,
  isExporting,
  onPlay,
  onStop,
  onExportGif,
  playStep,
  playFps,
  onPlayStepChange,
  onPlayFpsChange,
}: {
  label: string;
  dataMin: number;
  dataMax: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  isPlaying?: boolean;
  isExporting?: boolean;
  onPlay?: () => void;
  onStop?: () => void;
  onExportGif?: () => void;
  playStep?: number;
  playFps?: number;
  onPlayStepChange?: (v: number) => void;
  onPlayFpsChange?: (v: number) => void;
}) {
  const step = (dataMax - dataMin) / 200 || 1;
  const fmt = (v: number) => v.toPrecision(4);
  const numInputStyle: React.CSSProperties = {
    width: 48, padding: '1px 4px', border: '1px solid var(--color-border)',
    borderRadius: 4, fontSize: 10, background: 'var(--color-bg)', color: 'var(--color-text)',
  };

  return (
    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{label}:</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, textAlign: 'right' }}>▼</span>
          <input type="range" min={dataMin} max={dataMax} step={step} value={low}
            onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
            style={{ width: 200 }}
          />
          <span style={{ minWidth: 60, color: 'var(--color-text)' }}>{fmt(low)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, textAlign: 'right' }}>▲</span>
          <input type="range" min={dataMin} max={dataMax} step={step} value={high}
            onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
            style={{ width: 200 }}
          />
          <span style={{ minWidth: 60, color: 'var(--color-text)' }}>{fmt(high)}</span>
        </div>
      </div>
      <button onClick={() => onChange(dataMin, dataMax)} style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
        reset
      </button>
      {onPlayStepChange && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          step
          <input
            type="number"
            min={0.001}
            step={0.1}
            value={playStep}
            onChange={(e) => onPlayStepChange(Number(e.target.value))}
            style={numInputStyle}
          />
        </label>
      )}
      {onPlayFpsChange && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          fps
          <input
            type="number"
            min={1}
            max={60}
            step={1}
            value={playFps}
            onChange={(e) => onPlayFpsChange(Number(e.target.value))}
            style={numInputStyle}
          />
        </label>
      )}
      {onPlay && onStop && (
        <button
          onClick={isPlaying ? onStop : onPlay}
          disabled={isExporting}
          style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)' }}
        >
          {isPlaying ? '⏹ stop' : '▶ play'}
        </button>
      )}
      {onExportGif && (
        <button
          onClick={onExportGif}
          disabled={isPlaying || isExporting}
          style={{ fontSize: 10, padding: '1px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: isPlaying || isExporting ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)' }}
        >
          {isExporting ? '⏳ exporting…' : '🎞 export GIF'}
        </button>
      )}
    </div>
  );
}
