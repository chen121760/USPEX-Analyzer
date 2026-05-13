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

import { useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Plot, { type PlotMouseEvent } from 'react-plotly.js';
import type { Structure, SystemInfo } from '@/types/structure';
import { useUIStore } from '@/store/useUIStore';
import { useProjectStore } from '@/store/useProjectStore';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { PLOTLY_FONT, getPlotlyTheme } from '@/lib/constants';
import { ExportDataButton } from '@/components/ExportDataButton';


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
  /** Structure ID → group name (for workshop multi-group display) */
  groupMap?: Map<number, string>;
  /** Show the export button (default true, set false in HullWorkshop) */
  showExport?: boolean;
  /** Show tag buttons in MarkPanel (default true) */
  showTags?: boolean;
}

export function EnergyRankingChart({ structures, systemInfo, groupMap, showExport = true, showTags = true }: Props) {
  const { t } = useTranslation();
  const openViewer      = useUIStore((s) => s.openViewer);
  const markActiveTags  = useUIStore((s) => s.markActiveTags);
  const markEaInput     = useUIStore((s) => s.markEaInput);
  const allTags         = useProjectStore((s) => s.tags);
  const theme           = useUIStore((s) => s.theme);

  const allSorted = useMemo(() =>
    structures
      .filter((s) => !s.isUserAdded && !isNaN(s.enthalpy) && s.enthalpyTotal <= 900)
      .sort((a, b) => a.enthalpy - b.enthalpy),
  [structures]);

  const userAdded = useMemo(() =>
    structures
      .filter((s) => s.isUserAdded && !isNaN(s.enthalpy) && s.enthalpyTotal <= 900),
  [structures]);

  const [displayCount, setDisplayCount] = useState(() => Math.min(100, allSorted.length));

  const plotData = useMemo(() => {
    const top = allSorted.slice(0, displayCount);
    return {
      ranks: top.map((_, i) => i + 1),
      fitness: top.map((s) => s.fitness ?? 0),
      colors: top.map((s) => getOriginColor(s.origin)),
      hoverTexts: top.map((s) =>
        (s.groupName || groupMap ? `Group: ${s.groupName ?? groupMap?.get(s.id) ?? '—'}<br>` : '') +
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

  // Build rank lookup map for overlay traces (includes user-added)
  const rankMap = useMemo(() => {
    const map = new Map<number, { rank: number; fitness: number }>();
    allSorted.slice(0, displayCount).forEach((s, i) => {
      map.set(s.id, { rank: i + 1, fitness: s.fitness ?? 0 });
    });
    // User-added — compute rank by insertion into sorted list
    const topN = allSorted.slice(0, displayCount);
    for (const ua of userAdded) {
      let rank = topN.length + 1;
      for (let i = 0; i < topN.length; i++) {
        if (ua.enthalpy < topN[i].enthalpy) { rank = i + 1; break; }
      }
      map.set(ua.id, { rank, fitness: ua.fitness ?? 0 });
    }
    return map;
  }, [allSorted, displayCount, userAdded]);

  const userAddedTrace: PlotlyData = {
    x: userAdded.map((s) => rankMap.get(s.id)?.rank ?? 0),
    y: userAdded.map((s) => rankMap.get(s.id)?.fitness ?? 0),
    mode: 'markers' as const,
    type: 'scatter' as const,
    name: 'Manual',
    marker: {
      color: '#ffffff',
      size: 10,
      symbol: 'circle' as const,
      line: { width: 1.5, color: '#1e293b' },
    },
    text: userAdded.map((s) =>
      `[Manual]<br>` +
      (s.groupName ? `Group: ${s.groupName}<br>` : '') +
      `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
      `ΔH: ${(s.fitness ?? 0).toFixed(4)} eV/atom<br>` +
      `Enthalpy: ${s.enthalpy.toFixed(4)} eV/atom`
    ),
    hoverinfo: 'text' as const,
    customdata: userAdded.map((s) => s.id),
    showlegend: true,
  };

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
        const byGroup = new Map<string, typeof eaMarked>();
        for (const s of eaMarked) {
          const key = s.groupName || '';
          if (!byGroup.has(key)) byGroup.set(key, []);
          byGroup.get(key)!.push(s);
        }
        for (const [gn, structs] of byGroup) {
          const color = structs[0].groupColor ?? '#FFD700';
          const name = gn
            ? `★ ${t('mark.eaSearchName')} · ${gn}`
            : `★ ${t('mark.eaSearchName')}`;
          result.push({
            x: structs.map((s) => rankMap.get(s.id)!.rank),
            y: structs.map((s) => rankMap.get(s.id)!.fitness),
            mode: 'markers', type: 'scatter',
            name,
            marker: { symbol: 'star', size: 14, color, line: { width: 1, color: 'white' } },
            hoverinfo: 'skip',
            customdata: structs.map((s) => s.id),
            showlegend: true,
          });
        }
      }
    }
    return result;
  }, [allSorted, displayCount, rankMap, markActiveTags, markEaInput, allTags, t]);


  const pt = getPlotlyTheme(theme);

  // Persist viewport across re-renders (zoom/pan)
  const viewRef = useRef<Partial<PlotlyLayout>>({});
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const layout: PlotlyLayout = {
    font: PLOTLY_FONT,
    title: {
      text: `${systemInfo.elements.join('-')} ${t('hull.energyRanking', 'Energy Ranking')}`,
      font: { size: 15, color: pt.titleColor },
    },
    xaxis: {
      title: { text: 'Rank', font: { size: 13, color: pt.axisTitleColor } },
      tickfont: { size: 11, color: pt.tickColor },
      gridcolor: pt.gridColor,
    },
    yaxis: {
      title: { text: 'ΔH (eV/atom above ground state)', font: { size: 13, color: pt.axisTitleColor } },
      tickfont: { size: 11, color: pt.tickColor },
      gridcolor: pt.gridColor,
      range: [-0.001, undefined],
      zerolinecolor: pt.zerolineColor,
      automargin: true,
    },
    margin: { t: 50, r: 40, l: 80, b: 60 },
    height: 500,
    plot_bgcolor: pt.plotBg,
    paper_bgcolor: pt.paperBg,
    showlegend: false,
    ...viewRef.current,
  };


  function handleExport() {
    const top = allSorted.slice(0, displayCount);
    const elements = systemInfo.elements;
    const systemType = systemInfo.systemType;
    const hasGroup = groupMap != null || structures.some((s) => s.groupName != null);
    const groupCol = hasGroup ? ['Group'] : [];

    // Build x-fraction columns for workshop varcomp compatibility
    let xHeaders: string[] = [];
    if (systemType === 'binary') {
      const elB = elements[1] || 'B';
      xHeaders = [`x(${elB})`];
    } else if (systemType === 'ternary') {
      xHeaders = elements.map((el) => `x_${el}`);
    }

    const headers = [...groupCol, 'Rank', 'EA_ID', 'Formula', ...xHeaders, 'SpaceGroup', 'Generation', 'Origin', 'Enthalpy(eV/atom)', 'Fitness(eV/atom)'];
    const groupField = (s: Structure) => hasGroup ? { 'Group': s.groupName ?? '' } : {};

    function xFraction(s: Structure): Record<string, number> {
      const total = s.composition.reduce((a, b) => a + b, 0) || 1;
      if (systemType === 'binary') {
        const elB = elements[1] || 'B';
        return { [`x(${elB})`]: (s.composition[1] / total) };
      }
      if (systemType === 'ternary') {
        const frac: Record<string, number> = {};
        for (let i = 0; i < elements.length; i++) {
          frac[`x_${elements[i]}`] = s.composition[i] / total;
        }
        return frac;
      }
      return {};
    }

    const rows = top.map((s, i) => ({
      ...groupField(s),
      'Rank': i + 1,
      'EA_ID': s.id,
      'Formula': s.formula,
      ...xFraction(s),
      'SpaceGroup': s.spaceGroup,
      'Generation': s.generation,
      'Origin': s.origin,
      'Enthalpy(eV/atom)': s.enthalpy,
      'Fitness(eV/atom)': s.fitness ?? 0,
    }));

    // Build metadata comment lines — export as varcomp for workshop compatibility
    const metaHeaders = [
      `# elements: ${elements.join(',')}`,
      `# systemType: ${systemType}`,
      `# compositionMode: varcomp`,
    ];

    function csvCell(v: unknown): string {
      if (v === undefined || v === null) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }
    const csvLine = (h: string[], r: Record<string, unknown>) =>
      h.map((k) => csvCell(r[k])).join(',');
    const body = [headers.join(','), ...rows.map((r) => csvLine(headers, r))].join('\r\n');

    const fullCsv = '\uFEFF' + [...metaHeaders, '', body].join('\r\n');
    const blob = new Blob([fullCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${elements.join('-')}_energy_ranking_top${displayCount}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
        {showExport && <ExportDataButton onClick={handleExport} style={{ marginLeft: 'auto' }} />}
      </div>

      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        {t('hull.energyRankingDesc', 'Fixed composition — showing enthalpy ranking')}
      </p>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Plot
          data={[trace, userAddedTrace, ...overlayTraces]}
          layout={layout}
          config={{ responsive: true, displayModeBar: true }}
          style={{ width: '100%', height: layout.height }}
          onClick={(event: PlotMouseEvent) => {
            if (clickTimerRef.current) {
              clearTimeout(clickTimerRef.current);
              clickTimerRef.current = null;
              return;
            }
            clickTimerRef.current = setTimeout(() => {
              clickTimerRef.current = null;
              const point = event.points?.[0];
              if (point?.customdata) {
                openViewer(Number(point.customdata));
              }
            }, 300);
          }}
          onRelayout={(e) => {
            const v: Record<string, unknown> = {};
            if (e['xaxis.range[0]'] !== undefined) {
              v.xaxis = { range: [e['xaxis.range[0]'], e['xaxis.range[1]']] };
            }
            if (e['yaxis.range[0]'] !== undefined) {
              v.yaxis = { range: [e['yaxis.range[0]'], e['yaxis.range[1]']] };
            }
            if (Object.keys(v).length > 0) viewRef.current = v;
          }}
        />
      </div>

      <MarkPanel showTags={showTags} />

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
