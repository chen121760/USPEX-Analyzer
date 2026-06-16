/**
 * Constants for the application.
 */

/** Element colors (Jmol scheme) — subset for common elements */
export const ELEMENT_COLORS: Record<string, string> = {
  H: '#ffffff',
  He: '#d9ffff',
  Li: '#cc80ff',
  Be: '#c2ff00',
  B: '#ffb5b5',
  C: '#909090',
  N: '#3050f8',
  O: '#ff0d0d',
  F: '#90e050',
  Na: '#ab5cf2',
  Mg: '#8aff00',
  Al: '#bfa6a6',
  Si: '#f0c8a0',
  P: '#ff8000',
  S: '#ffff30',
  Cl: '#1ff01f',
  K: '#8f40d4',
  Ca: '#3dff00',
  Ti: '#bfc2c7',
  V: '#a6a6ab',
  Cr: '#8a99c7',
  Mn: '#9c7ac7',
  Fe: '#e06633',
  Co: '#f090a0',
  Ni: '#50d050',
  Cu: '#c88033',
  Zn: '#7d80b0',
  Ga: '#c28f8f',
  Ge: '#668f8f',
  Sr: '#00ff00',
  Y: '#94ffff',
  Zr: '#94e0e0',
  Nb: '#73c2c9',
  Mo: '#54b5b5',
  Pd: '#006985',
  Ag: '#c0c0c0',
  Sn: '#668080',
  Ba: '#00c900',
  La: '#70d4ff',
  Pt: '#d0d0e0',
  Au: '#ffd123',
  Pb: '#575961',
};

/** Origin method → color mapping */
export const ORIGIN_COLORS: Record<string, string> = {
  Seeds: '#6366f1',
  Random: '#6b7280',
  Heredity: '#ec4899',
  LatMutate: '#f97316',
  softmutate: '#14b8a6',
  Permutate: '#8b5cf6',
  Transmutate: '#06b6d4',
  spinMutate: '#a855f7',
  UserAdded: '#eab308',
  Unknown: '#9ca3af',
};

/** System-first sans-serif stack shared by the app shell, SVG logo, and Plotly. */
export const UI_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';

/** Shared Plotly font matching the app UI. */
export const PLOTLY_FONT = {
  family: UI_FONT_FAMILY,
  size: 13,
};

/** Colorscale options for charts */
export const COLORSCALES = [
  'Viridis', 'Plasma', 'Inferno', 'Magma', 'Cividis',
  'Blues', 'Reds', 'YlOrRd', 'RdYlGn', 'Spectral',
];

/** MLProperties field keys in USPEX canonical column order */
export const ML_FIELD_KEYS = [
  'bulkModulus',
  'shearModulus',
  'youngModulus',
  'poissonRatio',
  'pughRatio',
  'vickersHardness',
  'fractureToughness',
] as const;

export type MLFieldKey = typeof ML_FIELD_KEYS[number];

/** Map ML field key → i18n key */
export const ML_FIELD_I18N: Record<MLFieldKey, string> = {
  bulkModulus: 'col.bulk',
  shearModulus: 'col.shear',
  youngModulus: 'col.young',
  poissonRatio: 'col.poisson',
  pughRatio: 'col.pugh',
  vickersHardness: 'col.hardness',
  fractureToughness: 'col.toughness',
};
