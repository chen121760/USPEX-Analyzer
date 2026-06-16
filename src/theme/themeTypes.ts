export type ThemeName = 'light' | 'dark';
export type ThemePreference = ThemeName | 'system';

export function isThemeName(value: unknown): value is ThemeName {
  return value === 'light' || value === 'dark';
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || isThemeName(value);
}
