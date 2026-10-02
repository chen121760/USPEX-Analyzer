import { formationEnergy } from '@/domain/structure/formationEnergy';
import type { Structure, SystemInfo, TagDefinition } from '@/types/structure';
import { componentAmountsFromComposition, ternaryToCartesian } from '@/parsers/compositionUtils';
import { computeTernaryHullEdges, type TernaryHullInput } from '@/lib/ternaryHull';

export interface TernaryPlotEntry {
  key: number;
  structure: Structure;
  composition: number[];
  cartX: number;
  cartY: number;
  eForm: number | null;
}

export function ternaryStructureKey(s: Structure): number {
  return (s as Structure & { _mergeSeq?: number })._mergeSeq ?? s.id;
}

export function clampFitnessLimit(value: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : max;
}

export function ternaryFormationEnergy(s: Structure, info: SystemInfo, _composition: number[]): number | null {
  return formationEnergy(s, info);
}

/** Expensive geometry depends only on the dataset, never on the fitness limit or viewport. */
export function buildTernaryPlotModel(structures: Structure[], info: SystemInfo) {
  const components = info.componentLabels?.length === 3 ? info.componentLabels : info.elements.slice(0, 3);
  const entries: TernaryPlotEntry[] = [];
  for (const s of structures) {
    if (!Number.isFinite(s.enthalpy) || !Number.isFinite(s.enthalpyTotal) || s.enthalpyTotal > 900
      || !Number.isFinite(s.fitness) || s.fitness < 0) continue;
    const amounts = info.compositionBasis?.length
      ? componentAmountsFromComposition(s.composition, info.compositionBasis) : s.composition;
    if (!amounts || amounts.length !== 3 || amounts.some((n) => !Number.isFinite(n) || n < 0)) continue;
    const total = amounts.reduce((sum, n) => sum + n, 0);
    if (total <= 0) continue;
    const composition = amounts.map((n) => n / total);
    const [cartX, cartY] = ternaryToCartesian(composition);
    entries.push({ key: ternaryStructureKey(s), structure: s, composition, cartX, cartY, eForm: ternaryFormationEnergy(s, info, composition) });
  }
  const stableByComposition = new Map<string, TernaryPlotEntry>();
  const hullInputs: TernaryHullInput[] = [];
  for (const entry of entries) {
    if (entry.structure.fitness !== 0) continue;
    if (entry.eForm !== null) hullInputs.push({ id: entry.structure.id, _mergeSeq: entry.key,
      composition: entry.composition, cartX: entry.cartX, cartY: entry.cartY, eForm: entry.eForm });
    if (entry.structure.isUserAdded) continue;
    const key = entry.composition.map((n) => n.toFixed(10)).join(',');
    const existing = stableByComposition.get(key);
    if (!existing || (entry.eForm ?? Infinity) < (existing.eForm ?? Infinity)) stableByComposition.set(key, entry);
  }
  const stable = [...stableByComposition.values()];
  const unstable = entries.filter((e) => !e.structure.isUserAdded && e.structure.fitness > 0);
  const manual = entries.filter((e) => e.structure.isUserAdded);
  const maxFitness = entries.reduce((max, e) => Math.max(max, e.structure.fitness), 0);
  return { components, entries, stable, unstable, manual, maxFitness, edges: computeTernaryHullEdges(hullInputs),
    energyUnit: info.referenceInfo?.unit ?? (info.compositionBasis?.length ? 'eV/block' : 'eV/atom') };
}

/** Each visible structure gets at most one overlay, carrying every matching reason. */
export function ternaryMarkGroups(entries: TernaryPlotEntry[], activeTags: string[], tags: TagDefinition[], eaIds: Set<number>, showTags: boolean) {
  const groups = new Map<string, { entries: TernaryPlotEntry[]; tags: TagDefinition[]; byEa: boolean; color: string; groupName: string }>();
  for (const entry of entries) {
    const s = entry.structure;
    const matched = showTags ? tags.filter((tag) => activeTags.includes(tag.id) && s.tags.includes(tag.id)) : [];
    const byEa = eaIds.has(s.id);
    if (!byEa && matched.length === 0) continue;
    const groupName = s.groupName ?? '';
    const color = byEa ? s.groupColor ?? '#ca8a04' : matched[0].color;
    const key = JSON.stringify([groupName, color, byEa, matched.map((tag) => tag.id)]);
    let group = groups.get(key);
    if (!group) { group = { entries: [], tags: matched, byEa, color, groupName }; groups.set(key, group); }
    group.entries.push(entry);
  }
  return [...groups.values()];
}

/** CSV exports the complete fitness-filtered dataset, independently of view cropping and legend toggles. */
export function ternaryExportData(entries: TernaryPlotEntry[], components: string[], energyUnit: string, hasGroup: boolean) {
  const fractionHeaders = components.map((label) => `x_${label}`);
  const headers = [...(hasGroup ? ['Group'] : []), 'EA_ID', 'Formula', ...fractionHeaders,
    `E_form(${energyUnit})`, 'Fitness(eV/block)', 'SpaceGroup', 'Generation', 'Origin', 'Type'];
  const rows = entries.map(({ structure: s, composition, eForm }) => ({
    ...(hasGroup ? { Group: s.groupName ?? '' } : {}), EA_ID: s.id, Formula: s.formula,
    ...Object.fromEntries(fractionHeaders.map((header, i) => [header, composition[i].toFixed(6)])),
    [`E_form(${energyUnit})`]: eForm ?? '', 'Fitness(eV/block)': s.fitness,
    SpaceGroup: s.spaceGroup, Generation: s.generation, Origin: s.origin,
    Type: s.isUserAdded ? 'Manual' : s.fitness === 0 ? 'Stable' : 'Unstable',
  }));
  return { headers, rows };
}
