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
export type SurfaceTint = 'neutral' | 'warm' | 'cool';
export type CornerStyle = 'sharp' | 'precise' | 'rounded';
export type Density = 'comfortable' | 'compact';
export type Typeface = 'technical' | 'editorial' | 'mono';
export type TextScale = 'small' | 'default' | 'large';
export type Motion = 'full' | 'reduced';
export type PanelWidth = 'narrow' | 'default' | 'wide';
export type EditorText = 'small' | 'default' | 'large';

/** Accent schemes offered in Settings. `swatch` is a solid color for the chip. */
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

export const SURFACE_TINTS: { id: SurfaceTint; label: string; hint: string }[] = [
  { id: 'neutral', label: 'Neutral', hint: 'True grey' },
  { id: 'warm', label: 'Warm', hint: 'Paper' },
  { id: 'cool', label: 'Cool', hint: 'Slate' },
];

export const CORNER_STYLES: { id: CornerStyle; label: string; hint: string }[] = [
  { id: 'sharp', label: 'Sharp', hint: 'Hard edges' },
  { id: 'precise', label: 'Precise', hint: 'Drafting crisp' },
  { id: 'rounded', label: 'Rounded', hint: 'Soft' },
];

export const DENSITIES: { id: Density; label: string; hint: string }[] = [
  { id: 'comfortable', label: 'Comfortable', hint: 'More breathing room' },
  { id: 'compact', label: 'Compact', hint: 'More on screen' },
];

export const TYPEFACES: { id: Typeface; label: string; hint: string }[] = [
  { id: 'technical', label: 'Technical', hint: 'Archivo' },
  { id: 'editorial', label: 'Editorial', hint: 'Fraunces' },
  { id: 'mono', label: 'Mono', hint: 'JetBrains' },
];

export const TEXT_SCALES: { id: TextScale; label: string; hint: string }[] = [
  { id: 'small', label: 'Small', hint: '15px base' },
  { id: 'default', label: 'Default', hint: '16px base' },
  { id: 'large', label: 'Large', hint: '17.5px base' },
];

export const MOTION_MODES: { id: Motion; label: string; hint: string }[] = [
  { id: 'full', label: 'Full', hint: 'All animations' },
  { id: 'reduced', label: 'Reduced', hint: 'Minimal motion' },
];

export const PANEL_WIDTHS: { id: PanelWidth; label: string; hint: string }[] = [
  { id: 'narrow', label: 'Narrow', hint: '256px' },
  { id: 'default', label: 'Default', hint: '320px' },
  { id: 'wide', label: 'Wide', hint: '384px' },
];

export const EDITOR_TEXT_SIZES: { id: EditorText; label: string; hint: string }[] = [
  { id: 'small', label: 'Small', hint: '13px' },
  { id: 'default', label: 'Default', hint: '14px' },
  { id: 'large', label: 'Large', hint: '16px' },
];

const KEYS = {
  theme: 'devarchitect-theme',
  scheme: 'devarchitect-scheme',
  tint: 'devarchitect-tint',
  corners: 'devarchitect-corners',
  density: 'devarchitect-density',
  typeface: 'devarchitect-typeface',
  scale: 'devarchitect-scale',
  motion: 'devarchitect-motion',
  panel: 'devarchitect-panel',
  editorText: 'devarchitect-editor-text',
} as const;

const DEFAULTS = {
  scheme: 'indigo' as ColorScheme,
  tint: 'neutral' as SurfaceTint,
  corners: 'precise' as CornerStyle,
  density: 'comfortable' as Density,
  typeface: 'technical' as Typeface,
  scale: 'default' as TextScale,
  motion: 'full' as Motion,
  panel: 'default' as PanelWidth,
  editorText: 'default' as EditorText,
};

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key) as T | null;
  return stored && allowed.includes(stored) ? stored : fallback;
};

const readStoredPreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(KEYS.theme);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'dark'; // app has always been dark-first
};

const resolveIsDark = (preference: ThemePreference): boolean =>
  preference === 'system' ? prefersDark() : preference === 'dark';

const setAttr = (name: string, value: string) => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute(name, value);
};

const applyTheme = (preference: ThemePreference) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveIsDark(preference));
};

interface ThemeStoreState {
  preference: ThemePreference;
  /** The actually-applied theme after resolving `system`. */
  isDark: boolean;
  scheme: ColorScheme;
  tint: SurfaceTint;
  corners: CornerStyle;
  density: Density;
  typeface: Typeface;
  textScale: TextScale;
  motion: Motion;
  panelWidth: PanelWidth;
  editorText: EditorText;
  setPreference: (preference: ThemePreference) => void;
  setScheme: (scheme: ColorScheme) => void;
  setTint: (tint: SurfaceTint) => void;
  setCorners: (corners: CornerStyle) => void;
  setDensity: (density: Density) => void;
  setTypeface: (typeface: Typeface) => void;
  setTextScale: (scale: TextScale) => void;
  setMotion: (motion: Motion) => void;
  setPanelWidth: (width: PanelWidth) => void;
  setEditorText: (size: EditorText) => void;
  toggle: () => void;
  /** Reset every appearance axis to its default. */
  resetAppearance: () => void;
  /** Re-evaluate when the OS theme changes (only matters for `system`). */
  syncSystem: () => void;
}

const initialPreference = readStoredPreference();

const persist = (key: string, value: string) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
};

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  preference: initialPreference,
  isDark: resolveIsDark(initialPreference),
  scheme: read(KEYS.scheme, COLOR_SCHEMES.map((s) => s.id), DEFAULTS.scheme),
  tint: read(KEYS.tint, SURFACE_TINTS.map((s) => s.id), DEFAULTS.tint),
  corners: read(KEYS.corners, CORNER_STYLES.map((s) => s.id), DEFAULTS.corners),
  density: read(KEYS.density, DENSITIES.map((s) => s.id), DEFAULTS.density),
  typeface: read(KEYS.typeface, TYPEFACES.map((s) => s.id), DEFAULTS.typeface),
  textScale: read(KEYS.scale, TEXT_SCALES.map((s) => s.id), DEFAULTS.scale),
  motion: read(KEYS.motion, MOTION_MODES.map((s) => s.id), DEFAULTS.motion),
  panelWidth: read(KEYS.panel, PANEL_WIDTHS.map((s) => s.id), DEFAULTS.panel),
  editorText: read(KEYS.editorText, EDITOR_TEXT_SIZES.map((s) => s.id), DEFAULTS.editorText),

  setPreference: (preference) => {
    persist(KEYS.theme, preference);
    applyTheme(preference);
    set({ preference, isDark: resolveIsDark(preference) });
  },
  setScheme: (scheme) => {
    persist(KEYS.scheme, scheme);
    setAttr('data-scheme', scheme);
    set({ scheme });
  },
  setTint: (tint) => {
    persist(KEYS.tint, tint);
    setAttr('data-tint', tint);
    set({ tint });
  },
  setCorners: (corners) => {
    persist(KEYS.corners, corners);
    setAttr('data-corners', corners);
    set({ corners });
  },
  setDensity: (density) => {
    persist(KEYS.density, density);
    setAttr('data-density', density);
    set({ density });
  },
  setTypeface: (typeface) => {
    persist(KEYS.typeface, typeface);
    setAttr('data-type', typeface);
    set({ typeface });
  },
  setTextScale: (scale) => {
    persist(KEYS.scale, scale);
    setAttr('data-scale', scale);
    set({ textScale: scale });
  },
  setMotion: (motion) => {
    persist(KEYS.motion, motion);
    setAttr('data-motion', motion);
    set({ motion });
  },
  setPanelWidth: (width) => {
    persist(KEYS.panel, width);
    setAttr('data-panel', width);
    set({ panelWidth: width });
  },
  setEditorText: (size) => {
    persist(KEYS.editorText, size);
    setAttr('data-editortext', size);
    set({ editorText: size });
  },
  toggle: () => {
    const next: ThemePreference = get().isDark ? 'light' : 'dark';
    get().setPreference(next);
  },
  resetAppearance: () => {
    const { setScheme, setTint, setCorners, setDensity, setTypeface, setTextScale, setMotion, setPanelWidth, setEditorText } = get();
    setScheme(DEFAULTS.scheme);
    setTint(DEFAULTS.tint);
    setCorners(DEFAULTS.corners);
    setDensity(DEFAULTS.density);
    setTypeface(DEFAULTS.typeface);
    setTextScale(DEFAULTS.scale);
    setMotion(DEFAULTS.motion);
    setPanelWidth(DEFAULTS.panel);
    setEditorText(DEFAULTS.editorText);
  },
  syncSystem: () => {
    if (get().preference !== 'system') return;
    applyTheme('system');
    set({ isDark: prefersDark() });
  },
}));
