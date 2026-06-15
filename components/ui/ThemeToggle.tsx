import React, { useEffect } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useThemeStore, ThemePreference } from '../../stores/useThemeStore';
import { cn } from './cn';

const OPTIONS: { value: ThemePreference; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
];

/** Segmented light / dark / system switcher. */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const syncSystem = useThemeStore((s) => s.syncSystem);

  // Track OS theme changes while in `system` mode.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => syncSystem();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [syncSystem]);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-raised p-0.5',
        className
      )}
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              active
                ? 'bg-accent text-accent-content shadow-soft'
                : 'text-faint hover:text-content hover:bg-surface-hover'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
};
