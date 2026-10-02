import type { ProjectFile, SystemInfo } from '@/types/structure';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateSystemInfo(value: unknown): asserts value is SystemInfo {
  if (!record(value) || !Array.isArray(value.elements) || !value.elements.length
    || value.elements.some(el => typeof el !== 'string' || !el.trim())
    || new Set(value.elements).size !== value.elements.length
    || !['unary', 'binary', 'ternary', 'quaternary'].includes(String(value.systemType))
    || (value.compositionMode !== undefined && !['fixed', 'varcomp'].includes(String(value.compositionMode)))
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
}

export function validateStructures(value: unknown, elementCount: number): void {
  if (!Array.isArray(value)) throw new Error('Project structures must be an array');
  for (const s of value) {
    if (!record(s) || typeof s.id !== 'number' || !Number.isFinite(s.id)
      || !Array.isArray(s.composition) || s.composition.length !== elementCount
      || s.composition.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)
      || !s.composition.some(n => n > 0)) throw new Error('Invalid structure identity or composition');
    for (const key of ['tags', 'parentIds', 'hullX', 'kpoints']) {
      if (s[key] != null && !Array.isArray(s[key]) && !(key === 'hullX' && typeof s[key] === 'number')) throw new Error(`Invalid structure ${key}`);
    }
    for (const key of ['enthalpy', 'enthalpyTotal', 'fitness', 'eForm', 'eHullRecons']) {
      if (s[key] != null && typeof s[key] !== 'number') throw new Error(`Invalid structure ${key}`);
    }
    for (const key of ['formula', 'origin', 'notes', 'poscarData']) {
      if (s[key] != null && typeof s[key] !== 'string') throw new Error(`Invalid structure ${key}`);
    }
    if (Array.isArray(s.tags) && s.tags.some(tag => typeof tag !== 'string')) throw new Error('Invalid structure tags');
  }
}

export function validateProject(value: unknown): asserts value is ProjectFile {
  if (!record(value) || !value.version) throw new Error('Invalid project file');
  validateSystemInfo(value.systemInfo);
  validateStructures(value.structures, value.systemInfo.elements.length);
  if (value.userAddedStructures != null) validateStructures(value.userAddedStructures, value.systemInfo.elements.length);
  for (const key of ['tags', 'filterPresets', 'hullGenerations']) {
    if (value[key] != null && !Array.isArray(value[key])) throw new Error(`Invalid project ${key}`);
  }
  if (Array.isArray(value.tags) && value.tags.some(tag => !record(tag) || ['id', 'nameKey', 'color'].some(key => typeof tag[key] !== 'string'))) {
    throw new Error('Invalid tag definitions');
  }
  if (value.explorerAxisLabels != null && (!record(value.explorerAxisLabels) || Object.values(value.explorerAxisLabels).some(label => typeof label !== 'string'))) {
    throw new Error('Invalid axis labels');
  }
}
