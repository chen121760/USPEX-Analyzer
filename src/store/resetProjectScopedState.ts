/**
 * Drops UI selections that only make sense for the project they were made in.
 *
 * Several stores persist to localStorage, i.e. across projects.  Anything that
 * references a structure id, a tag id, a front index or a point in the data's
 * own units belongs to one project only and must not survive a project switch.
 *
 * Generic preferences (theme, language, layout, column widths, field choices
 * that fall back automatically, export naming parts) intentionally stay.
 */

import { useChartSettingsStore } from '@/store/useChartSettingsStore';
import { useCompareStore } from '@/store/useCompareStore';
import { useMarkStore } from '@/store/useMarkStore';

export function resetProjectScopedState(): void {
  // Comparison slots hold EA ids of the previous project's structures.
  useCompareStore.getState().clearCompare();
  // Marking references the previous project's tag ids and EA ids.
  useMarkStore.getState().clearMarks();
  // Pareto front indices and the manual beta reference point are data-space
  // choices of the previous project.
  useChartSettingsStore.getState().resetProjectScopedChartSettings();
}
