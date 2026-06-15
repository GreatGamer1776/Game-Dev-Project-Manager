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

/** Schemes offered in Settings. `swatch` is a CSS gradient for the preview chip. */
export const COLOR_SCHEMES: { id: ColorScheme; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Azure', swatch: 'linear-gradient(135deg, #3b82f6, #38bdf8)' },
  { id: 'cyan', label: 'Cyan', swatch: 'linear-gradient(135deg, #06b6d4, #14b8a6)' },
  { id: 'teal', label: 'Teal', swatch: 'linear-gradient(135deg, #14b8a6, #34d399)' },
  { id: 'emerald', label: 'Emerald', swatch: 'linear-gradient(135deg, #10b981, #4ade80)' },
  { id: 'violet', label: 'Violet', swatch: 'linear-gradient(135deg, #8b5cf6, #e879f9)' },
  { id: 'indigo', label: 'Indigo', swatch: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
  { id: 'rose', label: 'Rose', swatch: 'linear-gradient(135deg, #f43f5e, #f472b6)' },
  { id: 'amber', label: 'Amber', swatch: 'linear-gradient(135deg, #f59e0b, #fb923c)' },
];

const THEME_KEY = 'devarchitect-theme';
const SCHEME_KEY = 'devarchitect-scheme';
const DEFAULT_SCHEME: ColorScheme = 'blue';

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
