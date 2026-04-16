// ============================================================
//  Core data types for USPEX Analyzer
// ============================================================

/** Origin method for structure generation */
export type OriginMethod = string;

/** System dimensionality */
export type SystemType = 'unary' | 'binary' | 'ternary';

/** Optimization type */
export type OptimizationType = 'single' | 'multi';

/** Whether composition is variable or fixed */
export type CompositionMode = 'varcomp' | 'fixed';

/** Complete structure record — merges all file sources */
export interface Structure {
  // --- Identity ---
  id: number;
  formula: string;
  composition: number[];
  generation: number;

  // --- Thermodynamic (extended_convex_hull) ---
  enthalpy: number;            // eV/atom
  enthalpyTotal: number;       // eV (total, from Individuals)
  volume: number;              // Å³/atom
  volumeTotal: number;         // Å³ (total, from Individuals)
  fitness: number;             // eV/block — distance to convex hull
  spaceGroup: number;
  hullX: number[];             // composition coordinate(s): [x] for binary, [x1,x2] for ternary
  hullY: number;               // formation energy (eV/atom)

  // --- Origin / Genealogy ---
  origin: OriginMethod;
  parentIds: number[];
  parentEnthalpy: number;

  // --- Density (from Individuals / Pareto) ---
  density: number;             // g/cm³

  // --- Pareto (optional — multi-objective only) ---
  paretoFront?: number;

  // --- Dynamic extra properties (second objective, etc.) ---
  // Keys: "{name}-Individuals" and "{name}-Pareto_ranking"
  extraProps?: Record<string, number>;

  // --- ML Elastic Properties (optional) ---
  bulkModulus?: number;        // GPa
  shearModulus?: number;       // GPa
  youngModulus?: number;       // GPa
  poissonRatio?: number;
  pughRatio?: number;
  vickersHardness?: number;    // GPa
  fractureToughness?: number;  // MPa·m^½

  // --- Fingerprint (from Individuals) ---
  qEntropy?: number;           // Q_entr
  aOrder?: number;             // A_order
  sOrder?: number;             // S_order

  // --- KPOINTS ---
  kpoints?: number[];

  // --- POSCAR data ---
  poscarData?: string;
  latticeParams?: LatticeParams;

  // --- User annotations ---
  tags: string[];
  isUserAdded: boolean;
  notes: string;
}

export interface LatticeParams {
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
}

/** Global system information derived from parsed files */
export interface SystemInfo {
  elements: string[];
  systemType: SystemType;
  optimizationType: OptimizationType;
  compositionMode: CompositionMode;
  secondObjectiveName: string;
  totalStructures: number;
  totalGenerations: number;
  stableCount: number;
  minEnthalpy: number;
  maxFitness: number;
  /** Which file was used as the primary data source for totalStructures */
  totalStructuresSource: string;
  calculationType: number;         // 3-digit code from Parameters.txt
  externalPressure: number | null; // GPa, null if not specified
}

/** Tag definition */
export interface TagDefinition {
  id: string;
  nameKey: string;
  color: string;
}

// ── DataTable 筛选条件类型 ────────────────────────────────────
export type NumericFilterColumn = 'enthalpy' | 'fitness' | 'volume' | 'density' | 'spaceGroup' | 'generation'
  | 'paretoFront' | 'bulkModulus' | 'shearModulus' | 'youngModulus' | 'poissonRatio'
  | 'pughRatio' | 'vickersHardness' | 'fractureToughness' | 'qEntropy' | 'aOrder' | 'sOrder';

export type TextFilterColumn = 'formula' | 'origin';

export interface NumericFilterCondition {
  kind: 'numeric';
  column: NumericFilterColumn;
  label: string;
  operator: '>' | '<' | '>=' | '<=' | '=';
  value: number;
}

export interface TextFilterCondition {
  kind: 'text';
  column: TextFilterColumn;
  label: string;
  operator: 'contains' | 'notContains' | 'equals' | 'notEquals';
  values: string[];
}

export interface NComponentsFilterCondition {
  kind: 'nComponents';
  label: string;
  value: 1 | 2 | 3;
}

export interface ElementFractionFilterCondition {
  kind: 'elementFraction';
  label: string;
  element: string;
  operator: '>' | '<' | '>=' | '<=' | '=';
  value: number;
}

export type TableFilterCondition =
  | NumericFilterCondition
  | TextFilterCondition
  | NComponentsFilterCondition
  | ElementFractionFilterCondition;

// ── Filter 统一条件类型（FilterPage 使用，持久化到 UIStore）──
export type NumericOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
export type CompOperator = '>' | '<' | '>=' | '<=' | '=';

export type UnifiedCondition =
  | { kind: 'numeric'; field: string; operator: NumericOperator; value: number }
  | { kind: 'nComponents'; value: 1 | 2 | 3 }
  | { kind: 'elementFraction'; element: string; operator: CompOperator; value: number };

/** Filter condition for advanced querying */
export interface FilterCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: number | string | number[] | string[];
}

/** Saved filter preset */
export interface FilterPreset {
  id: string;
  name: string;
  conditions: FilterCondition[];
}

/** Convex hull generation snapshot */
export interface HullGeneration {
  generation: number;
  entries: HullGenerationEntry[];
}

export interface HullGenerationEntry {
  composition: number[];
  enthalpy: number;
}

// ============================================================
//  File-specific parsed data types (intermediate)
// ============================================================

export interface ParsedParameters {
  elements: string[];
  calculationType: number;       // 3-digit: hundreds=dimension, tens=molecule, ones=varcomp
  optType: number[];             // [1]=single-obj enthalpy, [1,1201]=multi-obj
  isVarcomp: boolean;            // derived: calculationType % 10 === 1
  numComponents: number;         // from atomType count: 2=binary, 3=ternary
  externalPressure: number | null; // GPa, from "100 : ExternalPressure"
}

export interface ParsedExtendedHull {
  id: number;
  composition: number[];
  enthalpy: number;
  volume: number;
  fitness: number;
  symm: number;
  x: number[];              // [x] for binary, [x1, x2] for ternary
  y: number;
}

export interface ParsedIndividual {
  generation: number;
  id: number;
  origin: OriginMethod;
  composition: number[];
  enthalpy: number;       // total eV
  volume: number;         // total Å³
  density: number;        // g/cm³
  secondObjectiveValue: number;
  kpoints: number[];
  symm: number;
  qEntropy: number;
  aOrder: number;
  sOrder: number;
}

export interface ParsedPareto {
  paretoFront: number;
  id: number;
  origin: string;
  composition: number[];
  enthalpy: number;
  volume: number;
  density: number;
  secondObjectiveValue: number;
  convexHull: number;
  symm: number;
}

export interface ParsedMLProperties {
  id: number;
  bulkModulus: number;
  shearModulus: number;
  youngModulus: number;
  poissonRatio: number;
  pughRatio: number;
  vickersHardness: number;
  fractureToughness: number;
}

export interface ParsedOrigin {
  id: number;
  origin: OriginMethod;
  enthalpy: number;
  parentEnthalpy: number;
  parentIds: number[];
}

export interface ParsedPoscar {
  id: number;
  header: string;
  poscarText: string;
  symm: number;
  formula: string;
  latticeParams?: LatticeParams;
  elements: string[];
  atomCounts: number[];
}

// ============================================================
//  Project file format (for save/load)
// ============================================================

export interface ProjectFile {
  version: string;
  created: string;
  projectName?: string;
  lastModified: string;
  systemInfo: SystemInfo;
  structures: Structure[];
  userAddedStructures: Structure[];
  tags: TagDefinition[];
  filterPresets: FilterPreset[];
  hullGenerations?: HullGeneration[];
}

// ============================================================
//  File detection
// ============================================================

export type USPEXFileType =
  | 'parameters'
  | 'extended_convex_hull'
  | 'individuals'
  | 'pareto_ranking'
  | 'ml_properties'
  | 'origin'
  | 'gathered_poscars'
  | 'gathered_poscars_unrelaxed'
  | 'convex_hull'
  | 'project_json'
  | 'unknown';

export interface DetectedFile {
  file: File;
  type: USPEXFileType;
  confidence: number;
  displayName: string;
  description: string;
  recordCount?: number;
}

// ============================================================
//  Export options
// ============================================================

export interface ExportOptions {
  format: 'zip' | 'seeds' | 'csv' | 'json';
  nameParts: number[];          // 1=index, 2=ID, 3=SG, 4=fitness, 5=2nd obj, 6=formula
  sortKey?: string;
  sortReverse?: boolean;
  secondObjPrefix: string;
  includeUserAdded: boolean;
}

// ============================================================
//  Chart / visualization helpers
// ============================================================

export interface HullEdge {
  p1: [number, number];
  p2: [number, number];
  comp1: number[];
  comp2: number[];
}

export interface HullFace {
  vertices: [number, number, number];  // indices into point array
  normal: [number, number, number];
}

/** Explorer axis option */
export interface AxisOption {
  key: string;
  labelKey: string;          // i18n key
  unit?: string;
  type: 'numeric' | 'categorical';
  accessor: (s: Structure) => number | string | undefined;
}
