import type { ProjectFile, SystemInfo } from '@/types/structure';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function numericFields(value: Record<string, unknown>, keys: readonly string[], context: string): void {
  for (const key of keys) {
    // JSON encodes NaN as null. Older projects can omit scientific fields.
    if (value[key] != null && typeof value[key] !== 'number') throw new Error(`Invalid ${context} ${key}`);
  }
}

function numericArray(value: unknown, context: string): void {
  if (!Array.isArray(value) || value.some(n => n != null && typeof n !== 'number')) throw new Error(`Invalid ${context}`);
}

export function validateSystemInfo(value: unknown): asserts value is SystemInfo {
  if (!record(value) || !Array.isArray(value.elements) || !value.elements.length
    || value.elements.some(el => typeof el !== 'string' || !el.trim())
    || new Set(value.elements).size !== value.elements.length
    || typeof value.systemType !== 'string' || !['unary', 'binary', 'ternary', 'quaternary'].includes(value.systemType)
    || (value.compositionMode !== undefined && (typeof value.compositionMode !== 'string' || !['fixed', 'varcomp'].includes(value.compositionMode)))
    || (value.externalPressure != null && (typeof value.externalPressure !== 'number' || !Number.isFinite(value.externalPressure)))) {
    throw new Error('Invalid project system information');
  }
  if (value.compositionBasis != null && (!Array.isArray(value.compositionBasis)
    || value.compositionBasis.some(row => !Array.isArray(row) || row.length !== (value.elements as unknown[]).length
      || row.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)))) {
    throw new Error('Invalid composition basis');
  }
  if (value.componentLabels != null && (!Array.isArray(value.componentLabels) || value.componentLabels.some(label => typeof label !== 'string'))) {
    throw new Error('Invalid composition labels');
  }
  if (value.referenceInfo != null) {
    const ref = value.referenceInfo;
    if (!record(ref) || typeof ref.complete !== 'boolean' || !Array.isArray(ref.labels) || !Array.isArray(ref.missing)
      || [...ref.labels, ...ref.missing].some(label => typeof label !== 'string')) throw new Error('Invalid formation energy references');
  }
  numericFields(value, ['totalStructures', 'totalGenerations', 'stableCount', 'unconvergedCount',
    'minEnthalpy', 'maxFitness', 'calculationType', 'pickUpGen', 'pickUpFolder'], 'system information');
  if (value.fitnessSemantics != null && value.fitnessSemantics !== 'uspex-original') throw new Error('Invalid fitness semantics');
  for (const key of ['secondObjectiveName', 'totalStructuresSource']) {
    if (value[key] != null && typeof value[key] !== 'string') throw new Error(`Invalid system information ${key}`);
  }
  if (value.optimizationType != null && (typeof value.optimizationType !== 'string' || !['single', 'multi'].includes(value.optimizationType))) throw new Error('Invalid optimization type');
  if (value.isPickup != null && typeof value.isPickup !== 'boolean') throw new Error('Invalid pickup status');
}

export function validateStructures(value: unknown, elementCount: number, ids = new Set<number>()): void {
  if (!Array.isArray(value)) throw new Error('Project structures must be an array');
  for (const s of value) {
    if (!record(s) || typeof s.id !== 'number' || !Number.isFinite(s.id)
      || !Array.isArray(s.composition) || s.composition.length !== elementCount
      || s.composition.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)
      || !s.composition.some(n => n > 0)) throw new Error('Invalid structure identity or composition');
    if (ids.has(s.id)) throw new Error(`Duplicate structure ID: ${s.id}`);
    ids.add(s.id);
    for (const key of ['tags', 'parentIds', 'hullX', 'kpoints']) {
      if (s[key] != null && !Array.isArray(s[key]) && !(key === 'hullX' && typeof s[key] === 'number')) throw new Error(`Invalid structure ${key}`);
      if (key !== 'tags' && Array.isArray(s[key])) numericArray(s[key], `structure ${key}`);
    }
    numericFields(s, ['enthalpy', 'enthalpyTotal', 'fitness', 'eForm', 'eHullRecons', 'volume', 'volumeTotal',
      'density', 'generation', 'spaceGroup', 'hullY', 'parentEnthalpy', 'paretoFront', 'bulkModulus',
      'shearModulus', 'youngModulus', 'poissonRatio', 'pughRatio', 'vickersHardness', 'fractureToughness',
      'qEntropy', 'aOrder', 'sOrder'], 'structure');
    for (const key of ['formula', 'origin', 'notes', 'poscarData', 'groupName', 'groupColor']) {
      if (s[key] != null && typeof s[key] !== 'string') throw new Error(`Invalid structure ${key}`);
    }
    if (Array.isArray(s.tags) && s.tags.some(tag => typeof tag !== 'string')) throw new Error('Invalid structure tags');
    if (s.isUserAdded != null && typeof s.isUserAdded !== 'boolean') throw new Error('Invalid manual structure flag');
    if (s.extraProps != null) {
      if (!record(s.extraProps)) throw new Error('Invalid structure extra properties');
      numericFields(s.extraProps, Object.keys(s.extraProps), 'extra property');
    }
    if (s.latticeParams != null) {
      if (!record(s.latticeParams)) throw new Error('Invalid lattice parameters');
      numericFields(s.latticeParams, ['a', 'b', 'c', 'alpha', 'beta', 'gamma'], 'lattice parameter');
    }
    if (s.symmetry != null) {
      if (!record(s.symmetry) || !Array.isArray(s.symmetry.points)) throw new Error('Invalid symmetry analysis');
      numericFields(s.symmetry, ['version'], 'symmetry analysis');
      if (s.symmetry.symprecs != null) numericArray(s.symmetry.symprecs, 'symmetry tolerances');
      if (s.symmetry.error != null && typeof s.symmetry.error !== 'string') throw new Error('Invalid symmetry error');
      for (const point of s.symmetry.points) {
        if (!record(point)) throw new Error('Invalid symmetry point');
        numericFields(point, ['symprec', 'number', 'operations', 'hallNumber'], 'symmetry point');
        for (const key of ['symbol', 'pearson']) {
          if (point[key] != null && typeof point[key] !== 'string') throw new Error(`Invalid symmetry ${key}`);
        }
      }
    }
  }
}

export function validateProject(value: unknown): asserts value is ProjectFile {
  if (!record(value) || typeof value.version !== 'string' || !value.version) throw new Error('Invalid project file');
  for (const key of ['projectId', 'projectName', 'created', 'lastModified']) {
    if (value[key] != null && typeof value[key] !== 'string') throw new Error(`Invalid project ${key}`);
  }
  validateSystemInfo(value.systemInfo);
  const ids = new Set<number>();
  validateStructures(value.structures, value.systemInfo.elements.length, ids);
  if (value.userAddedStructures != null) validateStructures(value.userAddedStructures, value.systemInfo.elements.length, ids);
  for (const key of ['tags', 'filterPresets', 'hullGenerations']) {
    if (value[key] != null && !Array.isArray(value[key])) throw new Error(`Invalid project ${key}`);
  }
  if (Array.isArray(value.tags) && value.tags.some(tag => !record(tag) || ['id', 'nameKey', 'color'].some(key => typeof tag[key] !== 'string'))) {
    throw new Error('Invalid tag definitions');
  }
  if (value.explorerAxisLabels != null && (!record(value.explorerAxisLabels) || Object.values(value.explorerAxisLabels).some(label => typeof label !== 'string'))) {
    throw new Error('Invalid axis labels');
  }
  if (value.explorerAxisRanges != null && (!record(value.explorerAxisRanges)
    || Object.values(value.explorerAxisRanges).some(range => !record(range) || typeof range.min !== 'string' || typeof range.max !== 'string'))) {
    throw new Error('Invalid axis ranges');
  }
  if (value.parsedFiles != null && (!record(value.parsedFiles) || Object.values(value.parsedFiles).some(flag => typeof flag !== 'boolean'))) {
    throw new Error('Invalid parsed file status');
  }
  if (Array.isArray(value.hullGenerations)) {
    for (const generation of value.hullGenerations) {
      if (!record(generation) || !Array.isArray(generation.entries)) throw new Error('Invalid hull generation');
      numericFields(generation, ['generation'], 'hull generation');
      for (const entry of generation.entries) {
        if (!record(entry)) throw new Error('Invalid hull generation entry');
        numericArray(entry.composition, 'hull generation composition');
        numericFields(entry, ['enthalpy'], 'hull generation entry');
      }
    }
  }
  if (Array.isArray(value.filterPresets)) {
    for (const preset of value.filterPresets) {
      if (!record(preset) || typeof preset.id !== 'string' || typeof preset.name !== 'string' || !Array.isArray(preset.conditions)) throw new Error('Invalid filter preset');
      for (const condition of preset.conditions) {
        if (!record(condition) || typeof condition.field !== 'string' || typeof condition.operator !== 'string'
          || !(typeof condition.value === 'number' || typeof condition.value === 'string'
            || (Array.isArray(condition.value) && condition.value.every(n => typeof n === 'number' || typeof n === 'string')))) throw new Error('Invalid filter condition');
      }
    }
  }
}
