/**
 * Test double for the browser storage the persisted Zustand stores rely on.
 *
 * Imported by `persistenceChecks.ts` as its first import so the shim is
 * installed before any store module is evaluated: zustand's persist middleware
 * captures `window.localStorage` when the store is created, and falls back to
 * "storage unavailable" if `window` does not exist.
 *
 * The seeded payload simulates a previous session, which lets the checks cover
 * rehydration and the chart-settings v1 → v2 migration.
 */

const backing = new Map<string, string>();

const storage = {
  getItem: (key: string) => backing.get(key) ?? null,
  setItem: (key: string, value: string) => { backing.set(key, String(value)); },
  removeItem: (key: string) => { backing.delete(key); },
  clear: () => { backing.clear(); },
  key: (index: number) => Array.from(backing.keys())[index] ?? null,
  get length() { return backing.size; },
} as Storage;

const globals = globalThis as unknown as {
  localStorage: Storage;
  window: { localStorage: Storage };
};
globals.localStorage = storage;
globals.window = { localStorage: storage };

// A v1 chart-settings payload still contains the axis title/range maps that
// used to leak from one project onto the next.
backing.set('uspex-chart-settings-state', JSON.stringify({
  version: 1,
  state: {
    explorerDimension: '3d',
    explorerXKey: 'enthalpy',
    explorerAxisRanges: { enthalpy: { min: '1', max: '9' } },
    explorerAxisLabels: { enthalpy: 'Leaked title' },
    paretoSelectedFronts: [4, 5],
    betaRefX: 123,
    betaRefY: 456,
    betaRefMode: 'manual',
  },
}));

backing.set('uspex-compare-state', JSON.stringify({
  version: 1,
  state: { compareIds: [11, 12] },
}));

backing.set('uspex-mark-state', JSON.stringify({
  version: 1,
  state: { markActiveTags: ['candidate'], markEaInput: 'EA11,EA12' },
}));
