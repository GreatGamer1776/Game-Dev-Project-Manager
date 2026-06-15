import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Modal, Button, cn } from './ui';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useThemeStore, ThemePreference } from '../stores/useThemeStore';

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: 'light', label: 'Light', description: 'Bright surfaces', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Easy on the eyes', icon: Moon },
  { value: 'system', label: 'System', description: 'Match your OS', icon: Monitor },
];

/** A labelled group within the settings dialog. */
const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <section className="space-y-3">
    <div>
      <h3 className="text-sm font-semibold text-content">{title}</h3>
      {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
    </div>
    {children}
  </section>
);

const ThemeChooser: React.FC = () => {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <div className="grid grid-cols-3 gap-2">
      {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={active}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all',
              active
                ? 'border-accent bg-accent/10 shadow-soft'
                : 'border-border bg-surface-raised hover:border-border-strong hover:bg-surface-hover'
            )}
          >
            <Icon className={cn('h-5 w-5', active ? 'text-accent' : 'text-muted')} />
            <div>
              <p className={cn('text-sm font-medium', active ? 'text-content' : 'text-content')}>{label}</p>
              <p className="text-xs text-faint">{description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};

/**
 * Program-wide settings dialog. Opened from anywhere via useSettingsStore.
 * Add new program-wide settings as additional <Section> blocks.
 */
export const SettingsModal: React.FC = () => {
  const isOpen = useSettingsStore((s) => s.isSettingsOpen);
  const closeSettings = useSettingsStore((s) => s.closeSettings);

  return (
    <Modal
      open={isOpen}
      onClose={closeSettings}
      title="Settings"
      description="Preferences that apply across the whole app."
      size="lg"
      footer={<Button variant="secondary" onClick={closeSettings}>Done</Button>}
    >
      <div className="space-y-6 py-1">
        <Section title="Appearance" description="Choose how DevArchitect looks.">
          <ThemeChooser />
        </Section>
      </div>
    </Modal>
  );
};
