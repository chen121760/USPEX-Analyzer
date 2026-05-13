/**
 * Type definitions for the Hull Workshop module.
 */

import type { Structure, SystemInfo, LatticeParams } from '@/types/structure';

export interface WorkshopGroup {
  id: string;          // crypto.randomUUID()
  name: string;        // user-assigned group name
  structures: Structure[];
  systemInfo: SystemInfo;
  visible: boolean;
  color: string;       // from GROUP_COLORS palette
  importSource: 'project' | 'csv' | 'json' | 'manual';
}

/** Metadata parsed from a workshop-exported CSV header comments */
export interface WorkshopCsvMeta {
  elements: string[];
  systemType: 'unary' | 'binary' | 'ternary';
  compositionMode: 'varcomp' | 'fixed';
}

/** One group parsed from a workshop CSV */
export interface ParsedCsvGroup {
  name: string;
  rows: Record<string, string>[]; // raw header→value maps
}

/** Raw parse result before Structure construction */
export interface WorkshopCsvParseResult {
  meta: WorkshopCsvMeta;
  groups: ParsedCsvGroup[];
  warnings: string[];
}

/** Default group name = project name (from buildAutoName). */
export function defaultGroupName(projectName: string, elements: string[]): string {
  return projectName || elements.join('-') || 'Project';
}

/** JSON export format for workshop data sharing */
export interface WorkshopJsonExport {
  type: 'uspex-workshop';
  version: 1;
  exportedAt: string; // ISO 8601
  systemInfo: {
    elements: string[];
    systemType: 'unary' | 'binary' | 'ternary';
    compositionMode: 'varcomp' | 'fixed';
    externalPressure: number | null;
  };
  groups: {
    name: string;
    color: string;
    structures: WorkshopJsonStructure[];
  }[];
}

/** Structure fields included in JSON export */
export interface WorkshopJsonStructure {
  id: number;
  formula: string;
  composition: number[];
  generation: number;
  origin: string;
  spaceGroup: number;
  enthalpy: number;
  enthalpyTotal: number;
  volume: number;
  volumeTotal: number;
  fitness: number;
  hullX: number[];
  hullY: number;
  eForm: number;
  density: number;
  parentIds: number[];
  parentEnthalpy: number;
  paretoFront: number;
  bulkModulus: number;
  shearModulus: number;
  youngModulus: number;
  poissonRatio: number;
  pughRatio: number;
  vickersHardness: number;
  fractureToughness: number;
  qEntropy: number;
  aOrder: number;
  sOrder: number;
  kpoints?: number[];
  latticeParams?: LatticeParams;
  poscarData?: string;
  tags: string[];
  notes: string;
}

/** Color palette for auto-assigning group colors */
export const GROUP_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
  '#84cc16', // lime
];
