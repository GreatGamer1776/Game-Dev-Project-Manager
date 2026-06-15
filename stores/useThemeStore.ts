import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ColorScheme =
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'emerald'
  | 'violet'
  | 'indigo'
  | 'rose'
  | 'amber';

/** Schemes offered in Settings. `swatch` is a solid color for the preview chip. */
export const COLOR_SCHEMES: { id: ColorScheme; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Azure', swatch: '#3b82f6' },
  { id: 'cyan', label: 'Cyan', swatch: '#06b6d4' },
  { id: 'teal', label: 'Teal', swatch: '#14b8a6' },
  { id: 'emerald', label: 'Emerald', swatch: '#10b981' },
  { id: 'violet', label: 'Violet', swatch: '#8b5cf6' },
  { id: 'indigo', label: 'Indigo', swatch: '#6366f1' },
  { id: 'rose', label: 'Rose', swatch: '#f43f5e' },
  { id: 'amber', label: 'Amber', swatch: '#f59e0b' },
];

const THEME_KEY = 'devarchitect-theme';
const SCHEME_KEY = 'devarchitect-scheme';
const DEFAULT_SCHEME: ColorScheme = 'indigo';

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const readStoredPreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'dark'; // app has always been dark-first
};

const readStoredScheme = (): ColorScheme => {
  if (typeof window === 'undefined') return DEFAULT_SCHEME;
  const stored = window.localStorage.getItem(SCHEME_KEY) as ColorScheme | null;
  return stored && COLOR_SCHEMES.some((s) => s.id === stored) ? stored : DEFAULT_SCHEME;
};

const resolveIsDark = (preference: ThemePreference): boolean =>
  preference === 'system' ? prefersDark() : preference === 'dark';

const applyTheme = (preference: ThemePreference) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveIsDark(preference));
};

const applyScheme = (scheme: ColorScheme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-scheme', scheme);
};

interface ThemeStoreState {
  preference: ThemePreference;
  /** The actually-applied theme after resolving `system`. */
  isDark: boolean;
  scheme: ColorScheme;
  setPreference: (preference: ThemePreference) => void;
  setScheme: (scheme: ColorScheme) => void;
  toggle: () => void;
  /** Re-evaluate when the OS theme changes (only matters for `system`). */
  syncSystem: () => void;
}

const initialPreference = readStoredPreference();
const initialScheme = readStoredScheme();

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  preference: initialPreference,
  isDark: resolveIsDark(initialPreference),
  scheme: initialScheme,
  setPreference: (preference) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(THEME_KEY, preference);
    applyTheme(preference);
    set({ preference, isDark: resolveIsDark(preference) });
  },
  setScheme: (scheme) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(SCHEME_KEY, scheme);
    applyScheme(scheme);
    set({ scheme });
  },
  toggle: () => {
    const next: ThemePreference = get().isDark ? 'light' : 'dark';
    get().setPreference(next);
  },
  syncSystem: () => {
    if (get().preference !== 'system') return;
    applyTheme('system');
    set({ isDark: prefersDark() });
  },
}));
