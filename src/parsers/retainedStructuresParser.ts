/**
 * Read fixed-composition retained IDs from USPEX's goodStructures table.
 *
 * The ID is located by its header rather than guessed from the first column:
 * some versions put a generation or rank column before it. Bracketed values
 * remain a single column, as in the other USPEX table parsers.
 */
import {
  buildNormalizedColumnIndex,
  getTokenByColumnAliases,
  normalizeColumnName,
  tokenizeDataRow,
  tokenizeHeader,
} from './headerUtils.ts';

export function parseRetainedStructureTable(content: string): {
  ids: number[];
  fitness: Map<number, number>;
} {
  let columnMap: Map<string, number> | null = null;
  let columnCount = 0;
  const ids = new Set<number>();
  const fitness = new Map<number, number>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim().replace(/^\uFEFF/, '');
    if (!trimmed) continue;

    const headerTokens = tokenizeHeader(trimmed.replace(/^#\s*/, ''));
    if (headerTokens.some((token) => ['id', 'number'].includes(normalizeColumnName(token)))) {
      // A standalone ID in a prose line does not establish a table schema.
      if (!headerTokens.some((token) => [
        'gen', 'generation', 'rank', 'composition', 'compositions',
        'numatomsall', 'enthalpy', 'enthalpies', 'energy', 'fitness',
      ].includes(normalizeColumnName(token)))) continue;
      columnMap = buildNormalizedColumnIndex(headerTokens);
      columnCount = headerTokens.length;
      continue;
    }
    if (!columnMap || trimmed.startsWith('#')) continue;

    const rowTokens = tokenizeDataRow(trimmed);
    if (rowTokens.length < columnCount) continue;
    const rawId = getTokenByColumnAliases(rowTokens, columnMap, ['ID', 'number']);
    if (!rawId || !/^\d+$/.test(rawId)) continue;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    ids.add(id);
    const rawFitness = getTokenByColumnAliases(rowTokens, columnMap, ['Fitness', 'fitness1']);
    if (rawFitness !== undefined && rawFitness.trim() !== '') {
      const value = Number(rawFitness);
      if (Number.isFinite(value)) fitness.set(id, value);
    }
  }

  return { ids: [...ids], fitness };
}

export function parseRetainedStructureIds(content: string): number[] {
  return parseRetainedStructureTable(content).ids;
}
