import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import Plot, { type PlotMouseEvent } from 'react-plotly.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
import type { Structure } from '@/types/structure';

interface FieldOption {
  key: string;
  label: string;
  accessor: (s: Structure) => number | string | undefined;
  type: 'numeric' | 'categorical';
}

function getFieldOptions(t: (k: string) => string, hasML: boolean, hasPareto: boolean, extraPropKeys: string[]): FieldOption[] {
  const opts: FieldOption[] = [
    { key: 'enthalpy', label: t('col.enthalpy'), accessor: (s) => s.enthalpy, type: 'numeric' },
    { key: 'fitness', label: t('col.fitness'), accessor: (s) => s.fitness >= 0 ? s.fitness : undefined, type: 'numeric' },
    { key: 'volume', label: t('col.volume'), accessor: (s) => s.volume, type: 'numeric' },
    { key: 'density', label: t('col.density'), accessor: (s) => s.density > 0 ? s.density : undefined, type: 'numeric' },
    { key: 'spaceGroup', label: t('col.spaceGroup'), accessor: (s) => s.spaceGroup, type: 'numeric' },
    { key: 'generation', label: t('col.generation'), accessor: (s) => s.generation, type: 'numeric' },
    { key: 'qEntropy', label: t('col.qEntropy'), accessor: (s) => s.qEntropy, type: 'numeric' },
    { key: 'aOrder', label: t('col.aOrder'), accessor: (s) => s.aOrder, type: 'numeric' },
    { key: 'sOrder', label: t('col.sOrder'), accessor: (s) => s.sOrder, type: 'numeric' },
    { key: 'origin', label: t('col.origin'), accessor: (s) => s.origin, type: 'categorical' },
    { key: 'formula', label: t('col.formula'), accessor: (s) => s.formula, type: 'categorical' },
  ];

  if (hasML) {
    opts.push(
      { key: 'youngModulus', label: t('col.young'), accessor: (s) => s.youngModulus, type: 'numeric' },
      { key: 'bulkModulus', label: t('col.bulk'), accessor: (s) => s.bulkModulus, type: 'numeric' },
      { key: 'shearModulus', label: t('col.shear'), accessor: (s) => s.shearModulus, type: 'numeric' },
      { key: 'poissonRatio', label: t('col.poisson'), accessor: (s) => s.poissonRatio, type: 'numeric' },
      { key: 'vickersHardness', label: t('col.hardness'), accessor: (s) => s.vickersHardness, type: 'numeric' },
    );
  }

  if (hasPareto) {
    opts.push(
      { key: 'paretoFront', label: t('col.paretoFront'), accessor: (s) => s.paretoFront, type: 'numeric' },
    );
  }

  for (const key of extraPropKeys) {
    opts.push({ key: `extra_${key}`, label: key, accessor: (s) => s.extraProps?.[key], type: 'numeric' });
  }

  return opts;
}

export function ExplorerPage() {
  const { t } = useTranslation();
  const openViewer = useUIStore((s) => s.openViewer);
  const structures = useProjectStore((s) => s.structures);
  const systemInfo = useProjectStore((s) => s.systemInfo);

  const hasML = structures.some((s) => s.youngModulus != null && s.youngModulus! > 0);
  const hasPareto = systemInfo?.optimizationType === 'multi';

  const extraPropKeys = useMemo(() => {
    const keys = new Set<string>();
    structures.forEach((s) => { if (s.extraProps) Object.keys(s.extraProps).forEach((k) => keys.add(k)); });
    return Array.from(keys).sort();
  }, [structures]);

  const fields = useMemo(() => getFieldOptions(t, hasML, hasPareto, extraPropKeys), [t, hasML, hasPareto, extraPropKeys]);

  // 从 UIStore 读取轴选择，切换页面后不会丢失
  const xKey      = useUIStore((s) => s.explorerXKey);
  const setXKey   = useUIStore((s) => s.setExplorerXKey);
  const yKey      = useUIStore((s) => s.explorerYKey);
  const setYKey   = useUIStore((s) => s.setExplorerYKey);
  const colorKey  = useUIStore((s) => s.explorerColorKey);
  const setColorKey = useUIStore((s) => s.setExplorerColorKey);

  const xField = fields.find((f) => f.key === xKey) ?? fields[0];
  const yField = fields.find((f) => f.key === yKey) ?? fields[1];
  const colorField = fields.find((f) => f.key === colorKey);

  const filteredData = useMemo(() => {
    return structures.filter((s) => {
      const xv = xField.accessor(s);
      const yv = yField.accessor(s);
      return xv != null && yv != null && s.enthalpy < 900;
    });
  }, [structures, xField, yField]);

  // Build traces
  const traces: PlotlyData[] = useMemo(() => {
    if (!colorField || colorField.type === 'numeric') {
      // Single trace with color mapping
      return [{
        x: filteredData.map((s) => xField.accessor(s) as number),
        y: filteredData.map((s) => yField.accessor(s) as number),
        mode: 'markers' as const,
        type: 'scatter' as const,
        marker: {
          color: colorField ? filteredData.map((s) => (colorField.accessor(s) as number) ?? 0) : '#6366f1',
          colorscale: 'Viridis',
          colorbar: colorField ? { title: colorField.label, thickness: 15 } : undefined,
          size: 6,
          opacity: 0.7,
        },
        text: filteredData.map(
          (s) =>
            `EA${s.id}: ${s.formula}<br>` +
            `${xField.label}: ${xField.accessor(s)}<br>` +
            `${yField.label}: ${yField.accessor(s)}<br>` +
            `SG: ${s.spaceGroup} | Origin: ${s.origin}`,
        ),
        hoverinfo: 'text' as const,
        customdata: filteredData.map((s) => s.id)
      }];
    }

    // Categorical color — one trace per category
    const groups = new Map<string, Structure[]>();
    for (const s of filteredData) {
      const cat = String(colorField.accessor(s) ?? 'Unknown');
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(s);
    }

    const COLORS = ['#6366f1', '#ec4899', '#f97316', '#14b8a6', '#8b5cf6', '#eab308', '#06b6d4', '#6b7280', '#dc2626', '#16a34a'];

    return Array.from(groups.entries()).map(([cat, pts], i) => ({
      x: pts.map((s) => xField.accessor(s) as number),
      y: pts.map((s) => yField.accessor(s) as number),
      mode: 'markers' as const,
      type: 'scatter' as const,
      name: cat,
      marker: { color: COLORS[i % COLORS.length], size: 6, opacity: 0.7 },
      text: pts.map(
        (s) =>
          `EA${s.id}: ${s.formula}<br>` +
          `${xField.label}: ${xField.accessor(s)}<br>` +
          `${yField.label}: ${yField.accessor(s)}<br>` +
          `SG: ${s.spaceGroup} | Origin: ${s.origin}`,
      ),
      hoverinfo: 'text' as const,
      customdata: pts.map((s) => s.id),
    }));
  }, [filteredData, xField, yField, colorField]);

  const axisStyle = {
    tickfont: { size: 11, color: '#64748b' },
    gridcolor: '#e2e8f0',
    zerolinecolor: '#cbd5e1',
    linecolor: '#94a3b8',
  };

  const titleFont = { size: 13, color: '#334155' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layout: any = {
    title: { text: `${xField.label} vs ${yField.label}`, font: { size: 15, color: '#0f172a' } },
    xaxis: { title: { text: xField.label, font: titleFont }, ...axisStyle },
    yaxis: { title: { text: yField.label, font: titleFont }, ...axisStyle },
    hovermode: 'closest' as const,
    showlegend: true,
    legend: { font: { size: 11, color: '#334155' } },
    dragmode: 'lasso' as const,
    margin: { t: 50, l: 60, b: 60 },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
  };

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    fontSize: 12,
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  };

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('explorer.title')}</h2>

      {/* Axis selectors */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.xAxis')}:
          <select value={xKey} onChange={(e) => setXKey(e.target.value)} style={selectStyle}>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.yAxis')}:
          <select value={yKey} onChange={(e) => setYKey(e.target.value)} style={selectStyle}>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('explorer.colorBy')}:
          <select value={colorKey} onChange={(e) => setColorKey(e.target.value)} style={selectStyle}>
            <option value="">{t('explorer.none')}</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>

        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {filteredData.length} pts
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Plot
          data={traces}
          layout={layout}
          config={{ responsive: true, displayModeBar: true }}
          style={{ width: '100%', height: 550 }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0];
            if (point?.customdata) {
              openViewer(Number(point.customdata));
            }
          }}
        />
      </div>
    </div>
  );
}
