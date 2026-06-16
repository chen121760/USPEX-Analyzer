import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getLegacyUIValue } from '@/store/uiPersistence';
import { isThemeName, isThemePreference, type ThemeName, type ThemePreference } from './themeTypes';

const LEGACY_LAYOUT_STATE_KEY = 'uspex-layout-state';
const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

interface ThemeState {
  theme: ThemeName;
  themePreference: ThemePreference;
  setTheme: (themePreference: ThemePreference) => void;
  setThemePreference: (themePreference: ThemePreference) => void;
  toggleTheme: () => void;
  cycleThemePreference: () => void;
  syncSystemTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => {
      const initialPreference = readInitialThemePreference();

      return {
        theme: resolveTheme(initialPreference),
        themePreference: initialPreference,
        setTheme: (themePreference) => set({
          themePreference,
          theme: resolveTheme(themePreference),
        }),
        setThemePreference: (themePreference) => set({
          themePreference,
          theme: resolveTheme(themePreference),
        }),
        toggleTheme: () => set((state) => {
          const themePreference: ThemePreference = state.theme === 'light' ? 'dark' : 'light';
          return {
            themePreference,
            theme: resolveTheme(themePreference),
          };
        }),
        cycleThemePreference: () => set((state) => {
          const themePreference = getNextThemePreference(state.themePreference, state.theme);
          return {
            themePreference,
            theme: resolveTheme(themePreference),
          };
        }),
        syncSystemTheme: () => {
          if (get().themePreference !== 'system') return;
          set({ theme: resolveTheme('system') });
        },
      };
    },
    {
      name: 'uspex-theme-state',
      version: 2,
      partialize: (state) => ({
        theme: state.theme,
        themePreference: state.themePreference,
      }),
      migrate: (persistedState): Pick<ThemeState, 'theme' | 'themePreference'> => {
        if (!isRecord(persistedState)) {
          const themePreference = readInitialThemePreference();
          return { themePreference, theme: resolveTheme(themePreference) };
        }

        const storedPreference = persistedState.themePreference;
        const storedTheme = persistedState.theme;
        const themePreference = isThemePreference(storedPreference)
          ? storedPreference
          : isThemeName(storedTheme)
            ? storedTheme
            : readInitialThemePreference();

        return { themePreference, theme: resolveTheme(themePreference) };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        const themePreference = isThemePreference(state.themePreference)
          ? state.themePreference
          : isThemeName(state.theme)
            ? state.theme
            : 'system';

        state.setThemePreference(themePreference);
      },
    },
  ),
);

export function watchSystemThemePreference(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const media = window.matchMedia(THEME_MEDIA_QUERY);
  const handleChange = () => useThemeStore.getState().syncSystemTheme();

  media.addEventListener?.('change', handleChange);
  handleChange();

  return () => {
    media.removeEventListener?.('change', handleChange);
  };
}

function getNextThemePreference(
  currentPreference: ThemePreference,
  currentTheme: ThemeName,
): ThemePreference {
  if (currentPreference === 'system') return currentTheme === 'dark' ? 'light' : 'dark';
  if (currentPreference === 'light') return 'dark';
  return 'system';
}

function resolveTheme(themePreference: ThemePreference): ThemeName {
  if (themePreference !== 'system') return themePreference;
  return getSystemTheme();
}

function getSystemTheme(): ThemeName {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(THEME_MEDIA_QUERY).matches ? 'dark' : 'light';
}

function readInitialThemePreference(): ThemePreference {
  return readPersistedThemePreference()
    ?? readLegacyLayoutTheme()
    ?? getLegacyUIValue('theme', null, isThemeName)
    ?? 'system';
}

function readPersistedThemePreference(): ThemePreference | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem('uspex-theme-state');
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    const state = isRecord(parsed.state) ? parsed.state : parsed;
    const themePreference = state.themePreference;
    if (isThemePreference(themePreference)) return themePreference;

    const theme = state.theme;
    return isThemeName(theme) ? theme : null;
  } catch {
    return null;
  }
}

function readLegacyLayoutTheme(): ThemeName | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LEGACY_LAYOUT_STATE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    const state = isRecord(parsed.state) ? parsed.state : parsed;
    const theme = state.theme;
    return isThemeName(theme) ? theme : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
