import React from 'react';
import { Sun, Moon, Monitor, Check, Gamepad2, RotateCcw, Plus } from 'lucide-react';
import { Modal, Button, Eyebrow, TickFrame, cn } from './ui';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUiStore, DocViewMode } from '../stores/useUiStore';
import {
  useThemeStore,
  ThemePreference,
  COLOR_SCHEMES,
  SURFACE_TINTS,
  CORNER_STYLES,
  DENSITIES,
  TYPEFACES,
  TEXT_SCALES,
  MOTION_MODES,
  PANEL_WIDTHS,
  EDITOR_TEXT_SIZES,
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

/** Switch row for boolean behavior prefs. */
const ToggleRow: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors"
  >
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-medium text-content">{label}</span>
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </span>
    <span
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-border-strong'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </span>
  </button>
);

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
  const textScale = useThemeStore((s) => s.textScale);
  const setTextScale = useThemeStore((s) => s.setTextScale);
  const motion = useThemeStore((s) => s.motion);
  const setMotion = useThemeStore((s) => s.setMotion);
  const panelWidth = useThemeStore((s) => s.panelWidth);
  const setPanelWidth = useThemeStore((s) => s.setPanelWidth);
  const editorText = useThemeStore((s) => s.editorText);
  const setEditorText = useThemeStore((s) => s.setEditorText);
  const resetAppearance = useThemeStore((s) => s.resetAppearance);

  const prefs = useUiStore((s) => s.prefs);
  const setPref = useUiStore((s) => s.setPref);

  return (
    <Modal
      open={isOpen}
      onClose={closeSettings}
      title="Settings"
      description="Tune how DevArchitect looks and behaves. Every change applies instantly."
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
          <Group label="UI scale">
            <Seg options={TEXT_SCALES} value={textScale} onChange={setTextScale} columns={3} />
          </Group>
          <Group label="Motion">
            <Seg options={MOTION_MODES} value={motion} onChange={setMotion} columns={2} />
          </Group>
          <Group label="File panel width">
            <Seg options={PANEL_WIDTHS} value={panelWidth} onChange={setPanelWidth} columns={3} />
          </Group>
          <Group label="Editor text size">
            <Seg options={EDITOR_TEXT_SIZES} value={editorText} onChange={setEditorText} columns={3} />
          </Group>

          <Group label="Behavior">
            <div className="rounded-lg border border-border bg-surface-raised divide-y divide-border">
              <ToggleRow
                label="Confirm destructive actions"
                hint="Ask before deletes, clears, and replacements"
                checked={prefs.confirmActions}
                onChange={(v) => setPref('confirmActions', v)}
              />
            </div>
            <div className="pt-2">
              <Seg
                options={[
                  { id: 'edit' as DocViewMode, label: 'Edit', hint: 'Source only' },
                  { id: 'split' as DocViewMode, label: 'Split', hint: 'Side-by-side' },
                  { id: 'preview' as DocViewMode, label: 'Preview', hint: 'Rendered' },
                ]}
                value={prefs.docViewMode}
                onChange={(v) => setPref('docViewMode', v)}
                columns={3}
              />
              <p className="text-xs text-faint mt-1.5">Default view when a document opens. The toolbar toggle still updates it.</p>
            </div>
          </Group>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <Preview />
        </div>
      </div>
    </Modal>
  );
};
