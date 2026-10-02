import type { ProjectFile, Structure } from '@/types/structure';

/** Filter export carries precisely the selected rows, including manual rows. */
export function filteredProject(project: ProjectFile, selected: Structure[]): ProjectFile {
  const structures = selected.filter(s => !s.isUserAdded);
  const userAddedStructures = selected.filter(s => s.isUserAdded);
  return { ...project, projectId: `${project.projectId ?? 'project'}_selection_${crypto.randomUUID()}`,
    projectName: `${project.projectName || project.systemInfo.elements.join('-')} (selection)`,
    structures, userAddedStructures, hullGenerations: [],
    systemInfo: { ...project.systemInfo, totalStructures: selected.length,
      stableCount: selected.filter(s => s.fitness === 0).length,
      totalGenerations: Math.max(0, ...selected.map(s => s.generation)) } };
}
