const LEGACY_UI_STATE_KEY = 'uspex-ui-state';

type PersistedRecord = Record<string, unknown>;

function isRecord(value: unknown): value is PersistedRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPersistedState(storageKey: string): PersistedRecord {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const state = parsed.state;
    return isRecord(state) ? state : parsed;
  } catch {
    return {};
  }
}

const legacyUIState = readPersistedState(LEGACY_UI_STATE_KEY);

export function getLegacyUIValue<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): T {
  const value = legacyUIState[key];
  return isValid(value) ? value : fallback;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isNumber);
}

export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isIncludeExcludeRecord(value: unknown): value is Record<string, 'include' | 'exclude'> {
  return isRecord(value) && Object.values(value).every((entry) => entry === 'include' || entry === 'exclude');
}

export function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every(isBoolean);
}
