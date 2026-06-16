/**
 * Smart file type detection for USPEX output files.
 * Uses filename matching first, then content heuristics as fallback.
 */

import type { USPEXFileType, DetectedFile } from '@/types/structure';

/** Exact filename → type mapping */
const FILENAME_MAP: Record<string, USPEXFileType> = {
  'parameters.txt': 'parameters',
  'parameters': 'parameters',
  'parameter': 'parameters',
  'extended_convex_hull': 'extended_convex_hull',
  'individuals': 'individuals',
  'pareto_ranking': 'pareto_ranking',
  'mlproperties': 'ml_properties',
  'origin': 'origin',
  'gatheredposcars': 'gathered_poscars',
  'gatheredposcars_unrelaxed': 'gathered_poscars_unrelaxed',
  'gatheredposcars_unrelaxed_all': 'gathered_poscars_unrelaxed',
  'convex_hull': 'convex_hull',
};

/** Display information for each file type */
const FILE_INFO: Record<USPEXFileType, { displayKey: string; descKey: string; required: boolean }> = {
  parameters:                  { displayKey: 'files.parameters',        descKey: 'files.parametersDesc',        required: true },
  extended_convex_hull:        { displayKey: 'files.extendedHull',      descKey: 'files.extendedHullDesc',      required: false },
  individuals:                 { displayKey: 'files.individuals',       descKey: 'files.individualsDesc',       required: true },
  pareto_ranking:              { displayKey: 'files.pareto',            descKey: 'files.paretoDesc',            required: false },
  ml_properties:               { displayKey: 'files.mlProperties',      descKey: 'files.mlPropertiesDesc',      required: false },
  origin:                      { displayKey: 'files.origin',            descKey: 'files.originDesc',            required: true },
  gathered_poscars:            { displayKey: 'files.poscars',           descKey: 'files.poscarsDesc',           required: true },
  gathered_poscars_unrelaxed:  { displayKey: 'files.poscarsUnrelaxed',  descKey: 'files.poscarsUnrelaxedDesc',  required: false },
  convex_hull:                 { displayKey: 'files.convexHull',        descKey: 'files.convexHullDesc',        required: false },
  project_json:                { displayKey: 'files.projectJson',       descKey: 'files.projectJsonDesc',       required: false },
  unknown:                     { displayKey: 'files.unknown',           descKey: 'files.unknownDesc',           required: false },
};

/**
 * Detect the type of a single file.
 */
export function detectFileType(file: File, content: string): DetectedFile {
  const base: Omit<DetectedFile, 'type' | 'confidence' | 'displayName' | 'description'> = {
    file,
  };
  const baseName = file.name.split(/[\\/]/).pop() ?? file.name;
  const normalizedName = baseName.toLowerCase();

  // 1. Exact filename match (highest confidence)
  const nameType = FILENAME_MAP[normalizedName];
  if (nameType) {
    const info = FILE_INFO[nameType];
    return { ...base, type: nameType, confidence: 1.0, displayName: info.displayKey, description: info.descKey };
  }

  // 2. JSON project file
  if (normalizedName.endsWith('.json')) {
    try {
      const json = JSON.parse(content);
      if (json.version && json.systemInfo && json.structures) {
        const info = FILE_INFO.project_json;
        return { ...base, type: 'project_json', confidence: 1.0, displayName: info.displayKey, description: info.descKey };
      }
    } catch { /* not valid JSON */ }
  }

  // 3. Content-based heuristics
  const firstKB = content.substring(0, 4096); // check first 4KB

  if (
    (firstKB.includes('atomType') && firstKB.includes('%')) ||
    (/parameters?/.test(normalizedName) && firstKB.includes('calculationType'))
  ) {
    const info = FILE_INFO.parameters;
    return { ...base, type: 'parameters', confidence: 0.9, displayName: info.displayKey, description: info.descKey };
  }

  if (/^\s*generation\s+number\s+num_atoms_all\s+energy/m.test(firstKB)) {
    const isHullLike = /\bformation_energy\b/.test(firstKB) && !/\bquasi_entropy\b/.test(firstKB);
    const ft: USPEXFileType = isHullLike ? 'extended_convex_hull' : 'individuals';
    const info = FILE_INFO[ft];
    return { ...base, type: ft, confidence: 0.75, displayName: info.displayKey, description: info.descKey };
  }

  if (firstKB.includes('Fitness') && firstKB.includes('eV/block')) {
    const info = FILE_INFO.extended_convex_hull;
    return { ...base, type: 'extended_convex_hull', confidence: 0.9, displayName: info.displayKey, description: info.descKey };
  }

  // Individuals: has "Gen" column and generation numbers
  if (/^\s*Gen\s+ID\s+Origin/m.test(firstKB)) {
    const info = FILE_INFO.individuals;
    return { ...base, type: 'individuals', confidence: 0.9, displayName: info.displayKey, description: info.descKey };
  }

  if (firstKB.includes('Pareto') && firstKB.includes('front')) {
    const info = FILE_INFO.pareto_ranking;
    return { ...base, type: 'pareto_ranking', confidence: 0.9, displayName: info.displayKey, description: info.descKey };
  }

  if (firstKB.includes('Bulk') && firstKB.includes('Shear') && firstKB.includes('Youngs')) {
    const info = FILE_INFO.ml_properties;
    return { ...base, type: 'ml_properties', confidence: 0.9, displayName: info.displayKey, description: info.descKey };
  }

  if (firstKB.includes('Origin') && firstKB.includes('Parent-E') && firstKB.includes('Parent-ID')) {
    const info = FILE_INFO.origin;
    return { ...base, type: 'origin', confidence: 0.9, displayName: info.displayKey, description: info.descKey };
  }

  if (/^EA\d+\s+/m.test(firstKB) || /^number=\d+\b/m.test(firstKB)) {
    // Check if unrelaxed by filename hint
    const isUnrelaxed = normalizedName.includes('unrelax');
    const ft: USPEXFileType = isUnrelaxed ? 'gathered_poscars_unrelaxed' : 'gathered_poscars';
    const info = FILE_INFO[ft];
    return { ...base, type: ft, confidence: 0.85, displayName: info.displayKey, description: info.descKey };
  }

  if (/----\s*generation\s+\d+\s*----/i.test(firstKB)) {
    const info = FILE_INFO.convex_hull;
    return { ...base, type: 'convex_hull', confidence: 0.9, displayName: info.displayKey, description: info.descKey };
  }

  const info = FILE_INFO.unknown;
  return { ...base, type: 'unknown', confidence: 0, displayName: info.displayKey, description: info.descKey };
}

/**
 * Detect all uploaded files.
 */
export async function detectFiles(files: File[]): Promise<DetectedFile[]> {
  const results: DetectedFile[] = [];

  for (const file of files) {
    const content = await file.text();
    const detected = detectFileType(file, content);
    results.push(detected);
  }

  return results;
}

/**
 * Get info about which file types are required vs optional.
 */
export function getFileTypeInfo(type: USPEXFileType) {
  return FILE_INFO[type] ?? FILE_INFO.unknown;
}

/**
 * List all expected USPEX file types.
 */
export const ALL_USPEX_FILE_TYPES: USPEXFileType[] = [
  // Core — required for every calculation
  'individuals',
  'origin',
  'parameters',
  'gathered_poscars',
  // Optional — workflow-specific
  'extended_convex_hull',
  'pareto_ranking',
  'ml_properties',
];
