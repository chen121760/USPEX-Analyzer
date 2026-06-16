import type {
  ParsedFileStatus,
  Structure,
  SystemInfo,
  USPEXFileType,
} from '@/types/structure';

export const EMPTY_PARSED_FILE_STATUS: ParsedFileStatus = {
  parameters: false,
  extended_convex_hull: false,
  individuals: false,
  pareto_ranking: false,
  ml_properties: false,
  origin: false,
  gathered_poscars: false,
  gathered_poscars_unrelaxed: false,
  convex_hull: false,
};

export function createEmptyParsedFileStatus(): ParsedFileStatus {
  return { ...EMPTY_PARSED_FILE_STATUS };
}

export function markParsedFileStatus(
  fileContents: Iterable<[USPEXFileType, string]>,
): ParsedFileStatus {
  const parsedFiles = createEmptyParsedFileStatus();
  const writable = parsedFiles as Partial<Record<USPEXFileType, boolean>>;

  for (const [type] of fileContents) {
    if (type in writable) {
      writable[type] = true;
    }
  }

  return parsedFiles;
}

/**
 * Infer which source files were parsed from a saved project that predates
 * persisted parsedFiles metadata.
 */
export function inferParsedFiles(
  structures: Structure[],
  sysInfo: SystemInfo | null,
  hullGenCount: number,
): ParsedFileStatus {
  if (!structures.length) return createEmptyParsedFileStatus();

  return {
    parameters: !!sysInfo,
    extended_convex_hull: structures.some((s) => !Number.isNaN(s.fitness)),
    individuals: structures.some((s) => s.generation > 0),
    pareto_ranking: structures.some((s) => s.paretoFront >= 0),
    ml_properties: structures.some((s) => s.bulkModulus >= 0),
    origin: structures.some((s) => s.origin !== 'Unknown'),
    gathered_poscars: structures.some((s) => !!s.poscarData),
    gathered_poscars_unrelaxed: false,
    convex_hull: hullGenCount > 0,
  };
}
