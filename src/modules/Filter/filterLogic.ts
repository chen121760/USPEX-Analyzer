import { getStructureFieldValue } from '@/domain/structure/dynamicFields';
import type {
  CompOperator,
  NumericOperator,
  Structure,
  UnifiedCondition,
  UnifiedConditionGroup,
} from '@/types/structure';

export const NUMERIC_OPS: NumericOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
export const COMP_OPS: CompOperator[] = ['>', '>=', '<', '<=', '='];

export function toSortableNumber(value: unknown): number {
  if (value == null) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function applyCondition(s: Structure, cond: UnifiedCondition, elements: string[]): boolean {
  if (cond.kind === 'numeric') {
    const val = getStructureFieldValue(s, cond.field);
    if (val == null) return false;
    const num = Number(val);
    // -1 is still the "absent" sentinel for these fields. MLProperties fields
    // are excluded: their sentinel is NaN, and a negative prediction (e.g. a
    // negative bulk modulus) is real data that must stay filterable.
    if (num === -1 && new Set(['paretoFront', 'eForm', 'eHullRecons', 'aOrder', 'sOrder']).has(cond.field)) return false;
    if (!Number.isFinite(num)) return false;
    const target = cond.value;
    switch (cond.operator) {
      case 'eq': return num === target;
      case 'neq': return num !== target;
      case 'gt': return num > target;
      case 'gte': return num >= target;
      case 'lt': return num < target;
      case 'lte': return num <= target;
    }
  }
  if (cond.kind === 'text') {
    const value = String(getStructureFieldValue(s, cond.field) ?? '').toLowerCase();
    const matches = cond.values.some((entry) => {
      const target = entry.toLowerCase();
      return cond.operator === 'contains' || cond.operator === 'notContains'
        ? value.includes(target)
        : value === target;
    });
    return cond.operator === 'contains' || cond.operator === 'equals' ? matches : !matches;
  }
  if (cond.kind === 'nComponents') {
    return s.composition.filter((c) => c > 0).length === cond.value;
  }
  if (cond.kind === 'elementFraction') {
    const elIdx = elements.indexOf(cond.element);
    if (elIdx === -1) return false;
    const total = s.composition.reduce((a, b) => a + b, 0);
    if (total === 0) return false;
    const frac = s.composition[elIdx] / total;
    switch (cond.operator) {
      case '>': return frac > cond.value;
      case '<': return frac < cond.value;
      case '>=': return frac >= cond.value;
      case '<=': return frac <= cond.value;
      case '=': return Math.abs(frac - cond.value) < 0.001;
    }
  }
  return true;
}

/** Apply the persisted Filter-page state to one structure.
 * Tag includes/excludes are ANDed; condition groups are ORed, with AND inside
 * each group. This is shared by Explorer so both pages select the same rows.
 */
export function matchesActiveFilter(
  structure: Structure,
  elements: string[],
  groups: UnifiedConditionGroup[],
  tagStates: Record<string, 'include' | 'exclude'>,
): boolean {
  for (const [tagId, state] of Object.entries(tagStates)) {
    const hasTag = structure.tags.includes(tagId);
    if (state === 'include' && !hasTag) return false;
    if (state === 'exclude' && hasTag) return false;
  }
  const nonEmptyGroups = groups.filter((group) => group.conditions.length > 0);
  if (nonEmptyGroups.length === 0) return true;
  return nonEmptyGroups.some((group) =>
    group.conditions.every((condition) => applyCondition(structure, condition, elements)),
  );
}

export function conditionLabel(cond: UnifiedCondition, t: (k: string) => string): string {
  if (cond.kind === 'numeric') {
    const opLabel: Record<NumericOperator, string> = {
      gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠',
    };
    return `${t(`col.${cond.field}`) || cond.field} ${opLabel[cond.operator]} ${cond.value}`;
  }
  if (cond.kind === 'nComponents') {
    return ({ 1: t('table.filterUnary'), 2: t('table.filterBinary'), 3: t('table.filterTernary'), 4: t('table.filterQuaternary') })[cond.value];
  }
  if (cond.kind === 'text') {
    const operator = {
      contains: t('table.filterContains'),
      notContains: t('table.filterNotContains'),
      equals: t('table.filterEquals'),
      notEquals: t('table.filterNotEquals'),
    }[cond.operator];
    return `${t(`col.${cond.field}`)} ${operator} [${cond.values.join(', ')}]`;
  }
  return `x(${cond.element}) ${cond.operator} ${cond.value}`;
}
