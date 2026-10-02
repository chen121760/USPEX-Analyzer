/** Only project data changes schedule a save; progress and error status do not. */
export const PERSISTED_PROJECT_KEYS = ['systemInfo', 'structures', 'userStructures', 'hullGenerations', 'tags',
  'filterPresets', 'parsedFiles', 'projectId', 'projectName', 'explorerAxisLabels', 'explorerAxisRanges', 'isDataLoaded'] as const;

export function projectDataChanged(state: Record<string, unknown>, previous: Record<string, unknown>): boolean {
  return PERSISTED_PROJECT_KEYS.some(key => state[key] !== previous[key]);
}

/** Serialize asynchronous writes so an older snapshot can never overwrite a newer one. */
export function createSaveQueue<T>(write: (snapshot: T) => Promise<void>, onError: (error: unknown) => void,
  onSaved: (snapshot: T) => void = () => {}) {
  let pending = Promise.resolve();
  return (snapshot: T): Promise<void> => {
    pending = pending.then(() => write(snapshot)).then(() => onSaved(snapshot)).catch(onError);
    return pending;
  };
}
