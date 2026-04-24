import { useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/useProjectStore';
import Plot, { type PlotMouseEvent } from 'react-plotly.js';
import { useUIStore } from '@/store/useUIStore';
import { formulaToHtml } from '@/parsers/compositionUtils';
import { parseEaIds } from '@/lib/parseEaIds';
import { MarkPanel } from '@/components/MarkPanel/MarkPanel';
import { PLOTLY_FONT } from '@/lib/constants';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlotlyData = any;

const FRONT_COLORS = ['#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#8b5cf6', '#ec4899', '#06b6d4', '#6b7280'];

export function ParetoPage() {
  const { t } = useTranslation();
  const openViewer      = useUIStore((s) => s.openViewer);
  const markActiveTags  = useUIStore((s) => s.markActiveTags);
  const markEaInput     = useUIStore((s) => s.markEaInput);
  const allTags         = useProjectStore((s) => s.tags);
  const structures      = useProjectStore((s) => s.structures);
  const systemInfo      = useProjectStore((s) => s.systemInfo);

  const isMulti = systemInfo?.optimizationType === 'multi';
  const objName = systemInfo?.secondObjectiveName || 'Second Objective';
  const paretoKey = objName !== 'Second Objective' ? `${objName}-Pareto_ranking` : null;

  // Get available front numbers
  const frontNumbers = useMemo(() => {
    const fronts = new Set<number>();
    structures.forEach((s) => {
      if (s.paretoFront != null) fronts.add(s.paretoFront);
    });
    return Array.from(fronts).sort((a, b) => a - b);
  }, [structures]);

  // 从 UIStore 读取 Pareto 页面状态，切换页面后不会丢失
  const selectedFrontsArr    = useUIStore((s) => s.paretoSelectedFronts);
  const setSelectedFrontsArr = useUIStore((s) => s.setParetoSelectedFronts);
  const showLines            = useUIStore((s) => s.paretoShowLines);
  const setShowLines         = useUIStore((s) => s.setParetoShowLines);

  // UIStore 里存的是普通数组（因为 Set 无法被 JSON 序列化存到 localStorage）
  // 这里把数组转回 Set，方便后面用 .has() 判断
  const selectedFronts = new Set(selectedFrontsArr);

  // 把 Set 转回数组再存进 UIStore 的辅助函数
  const setSelectedFronts = (next: Set<number>) => {
    setSelectedFrontsArr(Array.from(next));
  };

  // 数据加载后，如果还没有选中任何前沿，默认选前 3 个
  useEffect(() => {
    if (selectedFrontsArr.length === 0 && frontNumbers.length > 0) {
      setSelectedFrontsArr(frontNumbers.slice(0, 3));
    }
  }, [frontNumbers]);

  const toggleFront = (n: number) => {
    const next = new Set(selectedFronts);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setSelectedFronts(next);
  };

  if (!isMulti) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
        {t('pareto.singleObjectiveHint')}
      </div>
    );
  }

  const traces: PlotlyData[] = [];

  for (const front of frontNumbers) {
    if (!selectedFronts.has(front)) continue;

    const pts = structures
      .filter((s) => s.paretoFront === front && paretoKey != null && s.extraProps?.[paretoKey] != null)
      .sort((a, b) => (a.fitness ?? 0) - (b.fitness ?? 0));

    const color = FRONT_COLORS[(front - 1) % FRONT_COLORS.length];

    traces.push({
      x: pts.map((s) => s.fitness),
      y: pts.map((s) => s.extraProps![paretoKey!]),
      mode: showLines ? ('markers+lines' as const) : ('markers' as const),
      type: 'scatter' as const,
      name: `Front ${front}`,
      marker: { color, size: 8 },
      line: showLines ? { color, width: 1.5, dash: 'dot' } : undefined,
      text: pts.map(
        (s) =>
          `EA${s.id}: ${formulaToHtml(s.formula)}<br>` +
          `Fitness: ${s.fitness.toFixed(4)}<br>` +
          `${objName}: ${s.extraProps![paretoKey!].toFixed(3)}<br>` +
          `SG: ${s.spaceGroup} | Origin: ${s.origin}`,
      ),
      hoverinfo: 'text' as const,
      customdata: pts.map((s) => s.id),
    });
  }

  // --- Mark overlay traces ---
  if (paretoKey != null) {
    const allParetoVisible = structures.filter(
      (s) => s.paretoFront != null && s.extraProps?.[paretoKey] != null,
    );

    for (const tagId of markActiveTags) {
      const tagDef = allTags.find((tg) => tg.id === tagId);
      if (!tagDef) continue;
      const tagged = allParetoVisible.filter((s) => s.tags.includes(tagId));
      if (tagged.length === 0) continue;
      traces.push({
        x: tagged.map((s) => s.fitness),
        y: tagged.map((s) => s.extraProps![paretoKey]),
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
      const eaMarked = allParetoVisible.filter((s) => eaIds.has(s.id));
      if (eaMarked.length > 0) {
        traces.push({
          x: eaMarked.map((s) => s.fitness),
          y: eaMarked.map((s) => s.extraProps![paretoKey]),
          mode: 'markers', type: 'scatter',
          name: t('mark.eaSearchName'),
          marker: { symbol: 'star', size: 14, color: '#FFD700', line: { width: 1, color: 'white' } },
          hoverinfo: 'skip',
          customdata: eaMarked.map((s) => s.id),
          showlegend: true,
        });
      }
    }
  }

  const axisStyle = {
    tickfont: { size: 11, color: '#64748b' },
    gridcolor: '#e2e8f0',
    zerolinecolor: '#cbd5e1',
    linecolor: '#94a3b8',
  };

  const titleFont = { size: 13, color: '#334155' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layout: any = {
    font: PLOTLY_FONT,
    title: { text: `${systemInfo?.elements.join('-')} ${t('pareto.title')}`, font: { size: 15, color: '#0f172a' } },
    xaxis: { title: { text: t('pareto.xAxis'), font: titleFont }, ...axisStyle },
    yaxis: { title: { text: objName, font: titleFont }, ...axisStyle },
    hovermode: 'closest' as const,
    showlegend: true,
    legend: { font: { size: 11, color: '#334155' } },
    margin: { t: 50, l: 60, b: 60 },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
  };

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{t('pareto.title')}</h2>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <Plot
          data={traces}
          layout={layout}
          config={{ responsive: true }}
          style={{ width: '100%', height: 550 }}
          onClick={(event: PlotMouseEvent) => {
            const point = event.points?.[0];
            if (point?.customdata) {
              openViewer(Number(point.customdata));
            }
          }}
        />
      </div>

      <MarkPanel />

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {t('pareto.selectFronts')}:
          </span>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {frontNumbers.map((n) => (
              <button
                key={n}
                className={`btn btn-sm ${selectedFronts.has(n) ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => toggleFront(n)}
                style={selectedFronts.has(n) ? { background: FRONT_COLORS[(n - 1) % FRONT_COLORS.length] } : {}}
              >
                Front {n}
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} />
            {t('pareto.connectLine')}
          </label>
        </div>
      </div>
    </div>
  );
}
