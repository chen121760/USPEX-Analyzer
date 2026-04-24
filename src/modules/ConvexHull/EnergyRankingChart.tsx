/**
 * Energy ranking chart for fixed-composition calculations.
 *
 * Since all structures have the same composition, there is no convex hull to plot.
 * Instead, we show a horizontal bar chart sorted by enthalpy (per-atom).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyLayout = any;

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Plot, { type PlotMouseEvent } from 'react-plotly.js';
import type { Structure, SystemInfo } from '@/types/structure';
import { useUIStore } from '@/store/useUIStore';
import { useProjectStore } from '@/store/useProjectStore';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';


/** Palette for auto-assigning colors to any origin method */
const COLOR_PALETTE = [
  '#6366f1', '#16a34a', '#f59e0b', '#ec4899', '#06b6d4',
  '#8b5cf6', '#dc2626', '#0ea5e9', '#64748b', '#f97316',
  '#14b8a6', '#a855f7', '#84cc16', '#e11d48', '#0284c7',
];

const originColorCache = new Map<string, string>();

function getOriginColor(origin: string): string {
  if (!originColorCache.has(origin)) {
    originColorCache.set(origin, COLOR_PALETTE[originColorCache.size % COLOR_PALETTE.length]);
  }
  return originColorCache.get(origin)!;
}

interface Props {
  structures: Structure[];
  systemInfo: SystemInfo;
}

export function EnergyRankingChart({ structures, systemInfo }: Props) {
  const { t } = useTranslation();
  const openViewer      = useUIStore((s) => s.openViewer);
  const markActiveTags  = useUIStore((s) => s.markActiveTags);
  const markEaInput     = useUIStore((s) => s.markEaInput);
  const allTags         = useProjectStore((s) => s.tags);

  const allSorted = useMemo(() =>
    structures
      .filter((s) => !isNaN(s.enthalpy) && s.enthalpy < 900)
      .sort((a, b) => a.enthalpy - b.enthalpy),
  [structures]);

  const [displayCount, setDisplayCount] = useState(() => Math.min(100, allSorted.length));

  const plotData = useMemo(() => {
    const top = allSorted.slice(0, displayCount);
    return {
      ranks: top.map((_, i) => i + 1),
      fitness: top.map((s) => s.fitness ?? 0),
      colors: top.map((s) => getOriginColor(s.origin)),
      hoverTexts: top.map((s) =>
        `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
        `ΔH: ${(s.fitness ?? 0).toFixed(4)} eV/atom<br>` +
        `Enthalpy: ${s.enthalpy.toFixed(4)} eV/atom<br>` +
        `SG: ${s.spaceGroup}<br>` +
        `Origin: ${s.origin}<br>` +
        `Gen: ${s.generation}`,
      ),
      ids: top.map((s) => s.id),
    };
  }, [allSorted, displayCount]);


  const trace: PlotlyData = {
    x: plotData.ranks,
    y: plotData.fitness,
    mode: 'markers' as const,
    type: 'scatter' as const,
    marker: {
      color: plotData.colors,
      size: 8,
      opacity: 0.85,
      line: { width: 0.5, color: '#ffffff' },
    },
    text: plotData.hoverTexts,
    hoverinfo: 'text' as const,
    customdata: plotData.ids,
  };

  // Build rank lookup map for overlay traces
  const rankMap = useMemo(() => {
    const map = new Map<number, { rank: number; fitness: number }>();
    allSorted.slice(0, displayCount).forEach((s, i) => {
      map.set(s.id, { rank: i + 1, fitness: s.fitness ?? 0 });
    });
    return map;
  }, [allSorted, displayCount]);

  // --- Mark overlay traces ---
  const overlayTraces = useMemo(() => {
    const result: PlotlyData[] = [];
    const visible = allSorted.slice(0, displayCount);

    for (const tagId of markActiveTags) {
      const tagDef = allTags.find((tg) => tg.id === tagId);
      if (!tagDef) continue;
      const tagged = visible.filter((s) => s.tags.includes(tagId));
      if (tagged.length === 0) continue;
      result.push({
        x: tagged.map((s) => rankMap.get(s.id)!.rank),
        y: tagged.map((s) => rankMap.get(s.id)!.fitness),
        mode: 'markers', type: 'scatter',
        name: `★ ${t(tagDef.nameKey)}`,
        marker: { symbol: 'star', size: 14, color: tagDef.color, line: { width: 1, color: 'white' } },
        hoverinfo: 'skip',
        customdata: tagged.map((s) => s.id),
        showlegend: true,
      });
    }

    const eaIds = parseEaIds(markEaInput);
    if (eaIds.size > 0) {
      const eaMarked = visible.filter((s) => eaIds.has(s.id));
      if (eaMarked.length > 0) {
        result.push({
          x: eaMarked.map((s) => rankMap.get(s.id)!.rank),
          y: eaMarked.map((s) => rankMap.get(s.id)!.fitness),
          mode: 'markers', type: 'scatter',
          name: t('mark.eaSearchName'),
          marker: { symbol: 'star', size: 14, color: '#FFD700', line: { width: 1, color: 'white' } },
          hoverinfo: 'skip',
          customdata: eaMarked.map((s) => s.id),
          showlegend: true,
        });
      }
    }
    return result;
  }, [allSorted, displayCount, rankMap, markActiveTags, markEaInput, allTags, t]);


  const layout: PlotlyLayout = {
    title: {
      text: `${systemInfo.elements.join('-')} ${t('hull.energyRanking', 'Energy Ranking')}`,
      font: { size: 15, color: '#0f172a' },
    },
    xaxis: {
      title: { text: 'Rank', font: { size: 13, color: '#334155' } },
      tickfont: { size: 11, color: '#64748b' },
      gridcolor: '#e2e8f0',
    },
    yaxis: {
      title: { text: 'ΔH (eV/atom above ground state)', font: { size: 13, color: '#334155' } },
      tickfont: { size: 11, color: '#64748b' },
      gridcolor: '#e2e8f0',
      range: [-0.001, undefined],
      zerolinecolor: '#cbd5e1',
      automargin: true,
    },
    margin: { t: 50, r: 40, l: 80, b: 60 },
    height: 500,  // 散点图固定高度就够了
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    showlegend: false,
  };


  return (
    <>
      {/* Slider to control how many structures to display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          {t('hull.showTop', 'Show top')}
        </span>
        <input
          type="range"
          min={1}
          max={allSorted.length}
          value={displayCount}
          onChange={(e) => setDisplayCount(Number(e.target.value))}
          style={{ flex: 1, maxWidth: 300 }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 60 }}>
          {displayCount} / {allSorted.length}
        </span>
      </div>

      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        {t('hull.energyRankingDesc', 'Fixed composition — showing enthalpy ranking')}
      </p>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Plot
          data={[trace, ...overlayTraces]}
          layout={layout}
          config={{ responsive: true, displayModeBar: true }}
          style={{ width: '100%', height: layout.height }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0];
            if (point?.customdata) {
              openViewer(Number(point.customdata));
            }
          }}
        />
      </div>

      <MarkPanel />

      {/* Legend for origin colors */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-secondary)' }}>
          Origin methods
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Array.from(new Set(structures.map((s) => s.origin))).map((origin) => {
            const color = getOriginColor(origin);
            const count = structures.filter((s) => s.origin === origin).length;
            return (
              <span key={origin} className="tag-badge" style={{ background: `${color}20`, color: color as string, fontSize: 12, padding: '3px 10px' }}>
                {origin} ({count})
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}
