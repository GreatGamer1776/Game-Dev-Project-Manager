import React from 'react';
import { Check } from 'lucide-react';
import { showMenu } from '../../stores/useMenuStore';
import { cn } from '../ui';

// Small pieces shared by the timeline and plot board editors.

export const ToolbarButton: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  label?: string;
}> = ({ icon: Icon, title, onClick, active, disabled, label }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={cn(
      'inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md transition-colors disabled:opacity-35',
      label ? 'px-2 text-xs' : 'w-7',
      active ? 'bg-surface-hover text-content' : 'text-faint hover:bg-surface-hover hover:text-content',
    )}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

export const ToolbarDivider = () => <span className="mx-1 h-4 w-px shrink-0 bg-border" />;

/** Segmented control for switching views. */
export const ViewToggle = <T extends string,>({ value, options, onChange }: {
  value: T;
  options: { id: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
  onChange: (value: T) => void;
}) => (
  <div className="flex shrink-0 rounded-md border border-border bg-surface-raised p-0.5" role="radiogroup">
    {options.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={value === id}
        onClick={() => onChange(id)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors',
          value === id ? 'bg-surface-hover text-content' : 'text-faint hover:text-content',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    ))}
  </div>
);

export const colorName = (color: string) => COLOR_NAMES[color.toLowerCase()] || color;

const COLOR_NAMES: Record<string, string> = {
  '#3b82f6': 'Blue', '#22c55e': 'Green', '#eab308': 'Yellow', '#f97316': 'Orange', '#ef4444': 'Red',
  '#a855f7': 'Purple', '#ec4899': 'Pink', '#14b8a6': 'Teal', '#71717a': 'Grey',
};

const swatchIcon =(color: string, selected: boolean): React.ComponentType<{ className?: string }> => {
  const Swatch = ({ className }: { className?: string }) => (
    <span className={cn('inline-flex items-center justify-center rounded-full', className)} style={{ background: color }}>
      {selected && <Check className="h-2.5 w-2.5 text-white" />}
    </span>
  );
  return Swatch;
};

/** Button showing a colour; clicking opens a palette menu. */
export const ColorButton: React.FC<{
  color: string | undefined;
  colors: string[];
  onChange: (color: string | undefined) => void;
  /** Offer "Default" (undefined) as the first choice. */
  allowNone?: boolean;
  title?: string;
}> = ({ color, colors, onChange, allowNone, title = 'Color' }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={e => showMenu(e, [
      ...(allowNone ? [{ label: 'Default', checked: !color, onSelect: () => onChange(undefined) }] : []),
      ...colors.map(c => ({ label: COLOR_NAMES[c.toLowerCase()] || c, icon: swatchIcon(c, c === color), onSelect: () => onChange(c) })),
    ], 'below')}
    className="flex h-[var(--ctl-h)] w-[var(--ctl-h)] shrink-0 items-center justify-center rounded-lg border border-border-strong/80 hover:border-border-strong"
  >
    <span
      className={cn('h-4 w-4 rounded-full', !color && 'border border-dashed border-border-strong')}
      style={color ? { background: color } : undefined}
    />
  </button>
);

/** Inserts text into a textarea at the cursor and returns the new value + caret. */
export const insertAtCursor = (el: HTMLTextAreaElement | null, value: string, text: string): { value: string; caret: number } => {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
};
