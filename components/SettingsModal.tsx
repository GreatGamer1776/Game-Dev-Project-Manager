import React from 'react';
import { Sun, Moon, Monitor, Check, Gamepad2, HardDrive, RotateCcw, Plus } from 'lucide-react';
import { Modal, Button, Eyebrow, TickFrame, cn } from './ui';
import { useSettingsStore } from '../stores/useSettingsStore';
import {
  useThemeStore,
  ThemePreference,
  COLOR_SCHEMES,
  SURFACE_TINTS,
  CORNER_STYLES,
  DENSITIES,
  TYPEFACES,
} from '../stores/useThemeStore';

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: 'light', label: 'Light', hint: 'Bright', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Dim', icon: Moon },
  { value: 'system', label: 'System', hint: 'Auto', icon: Monitor },
];

/** A labelled control group with a mono eyebrow header. */
const Group: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <section className="space-y-2">
    <Eyebrow>{label}</Eyebrow>
    {children}
  </section>
);

/**
 * Generic segmented selector. Each option shows a label and a quiet hint.
 * The active option uses the accent so it tracks the chosen scheme live.
 */
function Seg<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (id: T) => void;
  columns?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map(({ id, label, hint }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={cn(
              'rounded-lg border px-3 py-2 text-left transition-all',
              active
                ? 'border-accent bg-accent/10 shadow-soft'
                : 'border-border bg-surface-raised hover:border-border-strong hover:bg-surface-hover'
            )}
          >
            <span className={cn('block text-sm font-medium', active ? 'text-content' : 'text-content')}>{label}</span>
            {hint && <span className="block text-xs text-faint">{hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

const ThemeChooser: React.FC = () => {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  return (
    <div className="grid grid-cols-3 gap-2">
      {THEME_OPTIONS.map(({ value, label, hint, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={active}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3 text-left transition-all',
              active
                ? 'border-accent bg-accent/10 shadow-soft'
                : 'border-border bg-surface-raised hover:border-border-strong hover:bg-surface-hover'
            )}
          >
            <Icon className={cn('h-5 w-5', active ? 'text-accent' : 'text-muted')} />
            <span>
              <span className="block text-sm font-medium text-content">{label}</span>
              <span className="block text-xs text-faint">{hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

const SchemeChooser: React.FC = () => {
  const scheme = useThemeStore((s) => s.scheme);
  const setScheme = useThemeStore((s) => s.setScheme);
  return (
    <div className="grid grid-cols-8 gap-2">
      {COLOR_SCHEMES.map(({ id, label, swatch }) => {
        const active = scheme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setScheme(id)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className="group flex items-center justify-center"
          >
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-transform',
                active ? 'ring-2 ring-offset-2 ring-offset-surface scale-110' : 'group-hover:scale-110'
              )}
              style={{ backgroundColor: swatch, boxShadow: active ? `0 0 0 2px ${swatch}` : undefined }}
            >
              {active && <Check className="h-4 w-4 text-white drop-shadow" />}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/** Live, self-contained scene that re-renders against the global tokens. */
const Preview: React.FC = () => (
  <div className="bg-blueprint rounded-xl border border-border p-4">
    <div className="mb-3 flex items-center justify-between">
      <Eyebrow>Preview</Eyebrow>
      <span className="font-mono text-[10px] text-faint">⌘K</span>
    </div>

    <TickFrame className="rounded-xl border border-border bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-raised">
          <Gamepad2 className="h-5 w-5 text-accent" />
        </span>
        <span className="flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
          <HardDrive className="h-3 w-3" /> Local
        </span>
      </div>
      <Eyebrow className="mb-1 block">Game</Eyebrow>
      <h4 className="font-display text-lg font-semibold leading-tight text-content">Cosmic Invaders</h4>
      <p className="mt-1 text-sm text-muted">A retro-style space shooter.</p>
      <div className="mt-3 border-t border-border pt-2 font-mono text-[11px] tracking-wide text-faint">
        04 FILES · 16 JUN 26
      </div>
    </TickFrame>

    <div className="mt-4 flex items-center gap-2">
      <Button size="sm" icon={Plus}>New</Button>
      <Button size="sm" variant="secondary">Import</Button>
    </div>
  </div>
);

/**
 * Program-wide Appearance studio. Opened from anywhere via useSettingsStore.
 * Two panes: every theme axis on the left, a live preview on the right. Each
 * control writes straight to useThemeStore, so the whole app and the preview
 * update instantly.
 */
export const SettingsModal: React.FC = () => {
  const isOpen = useSettingsStore((s) => s.isSettingsOpen);
  const closeSettings = useSettingsStore((s) => s.closeSettings);

  const tint = useThemeStore((s) => s.tint);
  const setTint = useThemeStore((s) => s.setTint);
  const corners = useThemeStore((s) => s.corners);
  const setCorners = useThemeStore((s) => s.setCorners);
  const density = useThemeStore((s) => s.density);
  const setDensity = useThemeStore((s) => s.setDensity);
  const typeface = useThemeStore((s) => s.typeface);
  const setTypeface = useThemeStore((s) => s.setTypeface);
  const resetAppearance = useThemeStore((s) => s.resetAppearance);

  return (
    <Modal
      open={isOpen}
      onClose={closeSettings}
      title="Appearance"
      description="Tune how DevArchitect looks. Every change applies instantly."
      size="xl"
      footer={
        <>
          <Button variant="ghost" icon={RotateCcw} onClick={resetAppearance}>Reset to defaults</Button>
          <Button variant="secondary" onClick={closeSettings}>Done</Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Group label="Theme">
            <ThemeChooser />
          </Group>
          <Group label="Accent">
            <SchemeChooser />
          </Group>
          <Group label="Surface tint">
            <Seg options={SURFACE_TINTS} value={tint} onChange={setTint} columns={3} />
          </Group>
          <Group label="Corners">
            <Seg options={CORNER_STYLES} value={corners} onChange={setCorners} columns={3} />
          </Group>
          <Group label="Density">
            <Seg options={DENSITIES} value={density} onChange={setDensity} columns={2} />
          </Group>
          <Group label="Typeface">
            <Seg options={TYPEFACES} value={typeface} onChange={setTypeface} columns={3} />
          </Group>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <Preview />
        </div>
      </div>
    </Modal>
  );
};
