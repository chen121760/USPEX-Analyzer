import type { Structure } from '@/types/structure';
import { downloadBlob, ensureFileExtension } from './exportFileNames';

export type CsvPrimitive = string | number | null | undefined;
export interface CsvCell {
  value: CsvPrimitive;
  forceQuote?: boolean;
}
export type CsvCellValue = CsvPrimitive | CsvCell;
export type CsvRow = Record<string, CsvCellValue>;

interface BuildCsvOptions {
  lineEnding?: string;
  bom?: boolean;
}

export function escapeCsvCell(value: CsvCellValue): string {
  const cell = isCsvCell(value) ? value : { value };
  if (cell.value == null) return cell.forceQuote ? '""' : '';
  const str = String(cell.value);
  if (cell.forceQuote || str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvText(headers: string[], rows: CsvRow[], options: BuildCsvOptions = {}): string {
  const lineEnding = options.lineEnding ?? '\r\n';
  const lines: string[] = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
  }
  const csv = lines.join(lineEnding);
  return options.bom ? `\uFEFF${csv}` : csv;
}

export function downloadCsv(filename: string, headers: string[], rows: CsvRow[]): void {
  const csv = buildCsvText(headers, rows, { bom: true });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, ensureFileExtension(filename, '.csv'));
}

export interface CsvSection {
  title: string;
  headers: string[];
  rows: CsvRow[];
}

export function buildMultiSectionCsvText(sections: CsvSection[]): string {
  const parts: string[] = [];
  for (const section of sections) {
    parts.push(`# ${section.title}`);
    parts.push(buildCsvText(section.headers, section.rows));
  }
  return parts.join('\r\n\r\n');
}

export function downloadMultiSectionCsv(filename: string, sections: CsvSection[]): void {
  const csv = `\uFEFF${buildMultiSectionCsvText(sections)}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, ensureFileExtension(filename, '.csv'));
}

/**
 * Wide-format export for multi-series line/scatter data.
 * Each series gets its own pair of columns: [label_X, label_Y, label_EA_ID, label_Formula, ...extraCols].
 * Rows are padded with empty strings so all columns have the same length.
 */
export interface WideSeries {
  label: string;
  points: CsvRow[];
  xKey: string;
  yKey: string;
  metaKeys: string[];
}

export function buildWideCsvText(series: WideSeries[]): string {
  if (series.length === 0) return '';

  const headers: string[] = [];
  for (const s of series) {
    headers.push(`${s.label}_${s.xKey}`);
    headers.push(`${s.label}_${s.yKey}`);
    for (const metaKey of s.metaKeys) {
      headers.push(`${s.label}_${metaKey}`);
    }
  }

  const maxLen = Math.max(...series.map((s) => s.points.length));
  const lines: string[] = [headers.map(escapeCsvCell).join(',')];

  for (let index = 0; index < maxLen; index++) {
    const cells: string[] = [];
    for (const s of series) {
      const point = s.points[index];
      if (point == null) {
        cells.push('', '', ...s.metaKeys.map(() => ''));
      } else {
        cells.push(escapeCsvCell(point[s.xKey]));
        cells.push(escapeCsvCell(point[s.yKey]));
        for (const metaKey of s.metaKeys) {
          cells.push(escapeCsvCell(point[metaKey]));
        }
      }
    }
    lines.push(cells.join(','));
  }

  return lines.join('\r\n');
}

export function downloadWideCsv(filename: string, series: WideSeries[]): void {
  const csv = buildWideCsvText(series);
  if (!csv) return;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, ensureFileExtension(filename, '.csv'));
}

export interface StructureCsvOptions {
  hasPareto?: boolean;
  hasML?: boolean;
  hasFingerprint?: boolean;
  extraPropKeys?: string[];
  includeDynamicExtraProps?: boolean;
}

export function collectExtraPropKeys(structures: Structure[]): string[] {
  const keys = new Set<string>();
  for (const structure of structures) {
    for (const key of Object.keys(structure.extraProps ?? {})) {
      keys.add(key);
    }
  }
  return Array.from(keys).sort();
}

export function buildStructureCsvHeaders(
  structures: Structure[],
  opts: StructureCsvOptions = {},
): string[] {
  const { hasPareto = false, hasML = false, hasFingerprint = false, includeDynamicExtraProps = true } = opts;
  const extraPropKeys = includeDynamicExtraProps ? (opts.extraPropKeys ?? collectExtraPropKeys(structures)) : [];

  return [
    'ID', 'Formula', 'Composition', 'SpaceGroup', 'Generation',
    'Enthalpy_eV_atom', 'Volume_A3_atom', 'Fitness_eV_block',
    'Density_g_cm3', 'Origin', 'ParentIDs',
    ...(hasPareto ? ['ParetoFront', 'ExtraProps'] : []),
    ...extraPropKeys,
    ...(hasML ? ['BulkModulus_GPa', 'ShearModulus_GPa', 'YoungModulus_GPa', 'PoissonRatio', 'PughRatio', 'VickersHardness_GPa', 'FractureToughness'] : []),
    ...(hasFingerprint ? ['Q_Entropy', 'A_Order', 'S_Order'] : []),
    'Tags', 'Notes',
  ];
}

export function buildStructureCsvRows(
  structures: Structure[],
  opts: StructureCsvOptions = {},
): CsvRow[] {
  const { hasPareto = false, hasML = false, hasFingerprint = false, includeDynamicExtraProps = true } = opts;
  const extraPropKeys = includeDynamicExtraProps ? (opts.extraPropKeys ?? collectExtraPropKeys(structures)) : [];

  return structures.map((s) => ({
    'ID': s.id,
    'Formula': s.formula,
    'Composition': quoted(s.composition.join(' ')),
    'SpaceGroup': s.spaceGroup,
    'Generation': s.generation,
    'Enthalpy_eV_atom': s.enthalpy,
    'Volume_A3_atom': s.volume,
    'Fitness_eV_block': s.fitness,
    'Density_g_cm3': s.density,
    'Origin': s.origin,
    'ParentIDs': quoted(s.parentIds.join(' ')),
    ...(hasPareto ? {
      'ParetoFront': s.paretoFront >= 0 ? s.paretoFront : '',
      'ExtraProps': serializeExtraProps(s),
    } : {}),
    ...Object.fromEntries(extraPropKeys.map((key) => [key, s.extraProps?.[key] ?? ''])),
    ...(hasML ? {
      'BulkModulus_GPa': nonNegativeOrBlank(s.bulkModulus),
      'ShearModulus_GPa': nonNegativeOrBlank(s.shearModulus),
      'YoungModulus_GPa': nonNegativeOrBlank(s.youngModulus),
      'PoissonRatio': nonNegativeOrBlank(s.poissonRatio),
      'PughRatio': nonNegativeOrBlank(s.pughRatio),
      'VickersHardness_GPa': nonNegativeOrBlank(s.vickersHardness),
      'FractureToughness': nonNegativeOrBlank(s.fractureToughness),
    } : {}),
    ...(hasFingerprint ? {
      'Q_Entropy': s.qEntropy > 0 ? s.qEntropy : '',
      'A_Order': s.qEntropy > 0 ? s.aOrder : '',
      'S_Order': s.qEntropy > 0 ? s.sOrder : '',
    } : {}),
    'Tags': quoted(s.tags.join(', ')),
    'Notes': quoted(s.notes),
  }));
}

export function structuresToCSV(structures: Structure[], opts: StructureCsvOptions = {}): string {
  const headers = buildStructureCsvHeaders(structures, opts);
  const rows = buildStructureCsvRows(structures, opts);
  return buildCsvText(headers, rows, { lineEnding: '\n' });
}

function isCsvCell(value: CsvCellValue): value is CsvCell {
  return typeof value === 'object' && value !== null && 'value' in value;
}

function quoted(value: CsvPrimitive): CsvCell {
  return { value, forceQuote: true };
}

function nonNegativeOrBlank(value: number): number | '' {
  return value >= 0 ? value : '';
}

function serializeExtraProps(structure: Structure): string {
  return Object.entries(structure.extraProps ?? {})
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}
