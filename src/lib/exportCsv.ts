type Row = Record<string, string | number | null | undefined>;

function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: Row[]): string {
  const lines: string[] = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  }
  return lines.join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: Row[]): void {
  const csv = buildCsv(headers, rows);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface CsvSection {
  title: string;
  headers: string[];
  rows: Row[];
}

export function downloadMultiSectionCsv(filename: string, sections: CsvSection[]): void {
  const parts: string[] = [];
  for (const section of sections) {
    parts.push(`# ${section.title}`);
    parts.push(buildCsv(section.headers, section.rows));
  }
  const csv = parts.join('\r\n\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Wide-format export for multi-series line/scatter data.
 * Each series gets its own pair of columns: [label_X, label_Y, label_EA_ID, label_Formula, ...extraCols].
 * Rows are padded with empty strings so all columns have the same length.
 *
 * series: array of { label, rows: { x, y, meta } }
 * metaKeys: extra per-point columns to include after X/Y (e.g. ['EA_ID', 'Formula', 'SpaceGroup'])
 */
export interface WideSeries {
  label: string;
  points: Record<string, string | number | null | undefined>[];
  xKey: string;
  yKey: string;
  metaKeys: string[];
}

export function downloadWideCsv(filename: string, series: WideSeries[]): void {
  if (series.length === 0) return;

  // Build header row: Front1_X, Front1_Y, Front1_EA_ID, ..., Front2_X, ...
  const headers: string[] = [];
  for (const s of series) {
    headers.push(`${s.label}_${s.xKey}`);
    headers.push(`${s.label}_${s.yKey}`);
    for (const mk of s.metaKeys) {
      headers.push(`${s.label}_${mk}`);
    }
  }

  const maxLen = Math.max(...series.map((s) => s.points.length));
  const lines: string[] = [headers.map(escapeCell).join(',')];

  for (let i = 0; i < maxLen; i++) {
    const cells: string[] = [];
    for (const s of series) {
      const pt = s.points[i];
      if (pt == null) {
        // pad with empty cells for this series
        cells.push('', '', ...s.metaKeys.map(() => ''));
      } else {
        cells.push(escapeCell(pt[s.xKey]));
        cells.push(escapeCell(pt[s.yKey]));
        for (const mk of s.metaKeys) {
          cells.push(escapeCell(pt[mk]));
        }
      }
    }
    lines.push(cells.join(','));
  }

  const csv = lines.join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
