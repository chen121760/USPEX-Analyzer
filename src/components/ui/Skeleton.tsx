import type { CSSProperties } from 'react';

/**
 * Content placeholder that reserves the finished layout, so the page does not
 * jump when the real content arrives (CLS < 0.1).
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/** A few stacked bars, e.g. while a list of projects or structures loads. */
export function SkeletonRows({ rows = 3, height = 14 }: { rows?: number; height?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} width={index === rows - 1 ? '62%' : '100%'} height={height} />
      ))}
    </div>
  );
}

/**
 * Placeholder for a whole page (route chunk still loading, or a heavy page that
 * has not run its first data pass yet).
 *
 * It mirrors the real page layout — title, a row of cards, a chart-sized block,
 * then list rows — so the content that replaces it does not move anything
 * (CLS stays ~0). `role="status"` announces the wait; `label` is the translated
 * "loading" string, because a status region with no text announces nothing.
 */
export function PageSkeleton({ label, rows = 6 }: { label?: string; rows?: number }) {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      <Skeleton width={200} height={22} />
      <div className="page-skeleton-cards">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} height={76} radius={10} />
        ))}
      </div>
      <Skeleton height={180} radius={10} />
      <SkeletonRows rows={rows} height={16} />
    </div>
  );
}

/**
 * Placeholder for a chart that has not been built yet. It stands in the same
 * box the chart will occupy (the caller passes the exact height), so the page
 * does not reflow when the traces arrive.
 */
export function ChartSkeleton({ height = 480, label }: { height?: number; label?: string }) {
  const bars = [0.35, 0.6, 0.45, 0.85, 0.55, 0.7, 0.4, 0.75];
  return (
    <div
      className="chart-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      style={{ height }}
    >
      <div className="chart-skeleton-bars" aria-hidden="true">
        {bars.map((fraction, index) => (
          <Skeleton key={index} width="100%" height={`${Math.round(fraction * 100)}%`} radius={4} />
        ))}
      </div>
      <Skeleton width="55%" height={12} />
    </div>
  );
}

/**
 * Rows that stand in for a table body. The real header stays mounted, so only
 * the body area is reserved and the columns keep their widths.
 */
export function TableSkeletonRows({
  rows = 8,
  columns = 6,
  height = 14,
}: {
  rows?: number;
  columns?: number;
  height?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} aria-hidden="true">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <td key={columnIndex} style={{ padding: '8px 10px' }}>
              <Skeleton
                height={height}
                width={columnIndex === 0 ? 36 : columnIndex === 1 ? 60 : '72%'}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
