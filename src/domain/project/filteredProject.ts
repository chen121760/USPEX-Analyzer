import type { ProjectFile, Structure } from '@/types/structure';

/** Filter export carries precisely the selected rows, including manual rows. */
export function filteredProject(project: ProjectFile, selected: Structure[]): ProjectFile {
  const structures = selected.filter(s => !s.isUserAdded);
  const userAddedStructures = selected.filter(s => s.isUserAdded);
  const enthalpies = selected.filter(s => s.enthalpyTotal <= 900 && Number.isFinite(s.enthalpy)).map(s => s.enthalpy);
  const fitnesses = selected.filter(s => Number.isFinite(s.fitness)
    && (s.fitnessKind === 'objective' || s.fitness >= 0)).map(s => s.fitness);
  return { ...project, projectId: `${project.projectId ?? 'project'}_selection_${crypto.randomUUID()}`,
    projectName: `${project.projectName || project.systemInfo.elements.join('-')} (selection)`,
    structures, userAddedStructures, hullGenerations: [],
    systemInfo: { ...project.systemInfo, totalStructures: selected.length,
      stableCount: selected.filter(s => project.systemInfo.compositionMode === 'fixed'
        ? s.eHullRecons === 0 && Number.isFinite(s.enthalpyTotal) && s.enthalpyTotal <= 900 : s.fitness === 0).length,
      totalGenerations: selected.reduce((max, s) => Number.isFinite(s.generation) ? Math.max(max, s.generation) : max, 0),
      unconvergedCount: selected.filter(s => s.enthalpyTotal > 900).length,
      minEnthalpy: enthalpies.length ? enthalpies.reduce((min, value) => Math.min(min, value), Infinity) : 0,
      maxFitness: fitnesses.length ? Math.max(...fitnesses) : 0,
      totalStructuresSource: 'Filtered selection' } };
}
