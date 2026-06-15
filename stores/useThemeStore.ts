import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'devarchitect-theme';

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const readStoredPreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'dark'; // app has always been dark-first
};

const resolveIsDark = (preference: ThemePreference): boolean =>
  preference === 'system' ? prefersDark() : preference === 'dark';

const applyTheme = (preference: ThemePreference) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveIsDark(preference));
};

interface ThemeStoreState {
  preference: ThemePreference;
  /** The actually-applied theme after resolving `system`. */
  isDark: boolean;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
  /** Re-evaluate when the OS theme changes (only matters for `system`). */
  syncSystem: () => void;
}

const initialPreference = readStoredPreference();

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  preference: initialPreference,
  isDark: resolveIsDark(initialPreference),
  setPreference: (preference) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, preference);
    }
    applyTheme(preference);
    set({ preference, isDark: resolveIsDark(preference) });
  },
  toggle: () => {
    // From a resolved theme, flip to the explicit opposite.
    const next: ThemePreference = get().isDark ? 'light' : 'dark';
    get().setPreference(next);
  },
  syncSystem: () => {
    if (get().preference !== 'system') return;
    applyTheme('system');
    set({ isDark: prefersDark() });
  },
}));
