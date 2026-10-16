import React, { useState } from 'react';
import { Check, RotateCcw, Palette, PenLine, SlidersHorizontal, Keyboard, User, Info, LogOut, ShieldCheck } from 'lucide-react';
import { Modal, Button, cn } from './ui';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUiStore, DocViewMode } from '../stores/useUiStore';
import { useAuthStore } from '../stores/useAuthStore';
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
  LINE_WIDTHS,
  EDITOR_TEXT_SIZES,
} from '../stores/useThemeStore';
import { SHORTCUTS } from './HelpModal';

type SectionId = 'appearance' | 'editor' | 'general' | 'hotkeys' | 'account' | 'about';

const SECTIONS: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'editor', label: 'Editor', icon: PenLine },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
  { id: 'account', label: 'Account', icon: User },
  { id: 'about', label: 'About', icon: Info },
];

/** Obsidian "setting-item": name + description on the left, control on the right. */
const SettingItem: React.FC<{ name: string; description?: React.ReactNode; children: React.ReactNode }> = ({ name, description, children }) => (
  <div className="flex flex-col gap-2 border-t border-border py-3.5 first:border-t-0 sm:flex-row sm:items-center sm:gap-6">
    <div className="min-w-0 flex-1">
      <div className="text-[0.875rem] text-content">{name}</div>
      {description && <div className="mt-0.5 text-xs leading-relaxed text-muted">{description}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-1 mt-7 border-b border-border pb-2 text-[0.9375rem] font-semibold text-content first:mt-0">{children}</h3>
);

/** Obsidian-style dropdown. */
function Dropdown<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className="h-8 min-w-[10rem] cursor-pointer rounded-md border border-border bg-surface-raised px-2 pr-7 text-[0.8125rem] text-content outline-none hover:border-border-strong focus:border-accent"
    >
      {options.map(o => (
        <option key={o.id} value={o.id}>
          {o.hint ? `${o.label} — ${o.hint}` : o.label}
        </option>
      ))}
    </select>
  );
}

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border-strong')}
  >
    <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
  </button>
);

/** Text input that commits on blur/Enter (folder names). */
const TextSetting: React.FC<{ value: string; onCommit: (value: string) => void; label: string }> = ({ value, onCommit, label }) => {
  const [draft, setDraft] = useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return (
    <input
      value={draft}
      aria-label={label}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="h-8 w-44 rounded-md border border-border bg-surface-raised px-2 text-[0.8125rem] text-content outline-none hover:border-border-strong focus:border-accent"
    />
  );
};

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'Adapt to system' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

const DOC_VIEW_OPTIONS: { id: DocViewMode; label: string }[] = [
  { id: 'edit', label: 'Source' },
  { id: 'split', label: 'Split' },
  { id: 'preview', label: 'Reading' },
];

/**
 * Program-wide settings, laid out like Obsidian: section list on the left,
 * setting items on the right. Every control applies instantly.
 */
export const SettingsModal: React.FC = () => {
  const isOpen = useSettingsStore(s => s.isSettingsOpen);
  const closeSettings = useSettingsStore(s => s.closeSettings);
  const [section, setSection] = useState<SectionId>('general');

  const theme = useThemeStore();
  const prefs = useUiStore(s => s.prefs);
  const setPref = useUiStore(s => s.setPref);
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);

  const renderSection = () => {
    switch (section) {
      case 'general':
        return (
          <>
            <Heading>General</Heading>
            <SettingItem name="Confirm destructive actions" description="Ask before deleting files, folders, projects, or clearing content.">
              <Toggle label="Confirm destructive actions" checked={prefs.confirmActions} onChange={v => setPref('confirmActions', v)} />
            </SettingItem>
            <SettingItem name="Reduce motion" description="Turn off panel and menu animations.">
              <Toggle label="Reduce motion" checked={theme.motion === 'reduced'} onChange={v => theme.setMotion(v ? 'reduced' : 'full')} />
            </SettingItem>

            <Heading>Daily notes &amp; templates</Heading>
            <SettingItem name="Daily notes folder" description={<>"Open today's daily note" (Alt+D) creates YYYY-MM-DD documents here. A template whose name contains "daily" is used for new notes.</>}>
              <TextSetting value={prefs.dailyNotesFolder} onCommit={v => setPref('dailyNotesFolder', v)} label="Daily notes folder" />
            </SettingItem>
            <SettingItem name="Templates folder" description={<>Documents in this folder appear in "Insert template" and the editor's / menu. {'{{date}}'}, {'{{time}}'} and {'{{title}}'} are filled in.</>}>
              <TextSetting value={prefs.templatesFolder} onCommit={v => setPref('templatesFolder', v)} label="Templates folder" />
            </SettingItem>
          </>
        );
      case 'editor':
        return (
          <>
            <Heading>Editor</Heading>
            <SettingItem name="Default view for new tabs" description="How documents open. The toolbar toggle still switches per file and updates this.">
              <Dropdown label="Default document view" options={DOC_VIEW_OPTIONS} value={prefs.docViewMode} onChange={v => setPref('docViewMode', v)} />
            </SettingItem>
            <SettingItem name="Live preview" description="Render markdown while you type and show raw markup only on the line you're editing. Off = source mode.">
              <Toggle label="Live preview" checked={prefs.livePreview} onChange={v => setPref('livePreview', v)} />
            </SettingItem>
            <SettingItem name="Spellcheck" description="Underline misspelled words while editing documents.">
              <Toggle label="Spellcheck" checked={prefs.spellcheck} onChange={v => setPref('spellcheck', v)} />
            </SettingItem>
            <SettingItem name="Readable line length" description="Limit the maximum line length of documents so they're easier to read.">
              <Toggle label="Readable line length" checked={theme.lineWidth === 'readable'} onChange={v => theme.setLineWidth(v ? 'readable' : 'full')} />
            </SettingItem>
            <SettingItem name="Editor font size" description="Text size of the document source and reading views.">
              <Dropdown label="Editor font size" options={EDITOR_TEXT_SIZES} value={theme.editorText} onChange={theme.setEditorText} />
            </SettingItem>
          </>
        );
      case 'appearance':
        return (
          <>
            <Heading>Appearance</Heading>
            <SettingItem name="Base color scheme" description="Choose the app's color scheme.">
              <Dropdown label="Base color scheme" options={THEME_OPTIONS} value={theme.preference} onChange={theme.setPreference} />
            </SettingItem>
            <SettingItem name="Accent color" description="Used for links, the active file, and primary buttons.">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Accent color">
                {COLOR_SCHEMES.map(({ id, label, swatch }) => {
                  const active = theme.scheme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={label}
                      title={label}
                      onClick={() => theme.setScheme(id)}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-bg transition-transform hover:scale-110',
                        active && 'ring-2 ring-content/70',
                      )}
                      style={{ backgroundColor: swatch }}
                    >
                      {active && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>
            </SettingItem>
            <SettingItem name="Surface tint" description="Shift the temperature of the grey surfaces.">
              <Dropdown label="Surface tint" options={SURFACE_TINTS} value={theme.tint} onChange={theme.setTint} />
            </SettingItem>

            <Heading>Interface</Heading>
            <SettingItem name="Heading font" description="Typeface for titles and headings. Body text always uses Inter.">
              <Dropdown label="Heading font" options={TYPEFACES} value={theme.typeface} onChange={theme.setTypeface} />
            </SettingItem>
            <SettingItem name="Zoom level" description="Scales the whole interface.">
              <Dropdown label="Zoom level" options={TEXT_SCALES} value={theme.textScale} onChange={theme.setTextScale} />
            </SettingItem>
            <SettingItem name="Density" description="Row heights and spacing in lists, tabs, and controls.">
              <Dropdown label="Density" options={DENSITIES} value={theme.density} onChange={theme.setDensity} />
            </SettingItem>
            <SettingItem name="Corners" description="Corner radius of panels, menus, and controls.">
              <Dropdown label="Corners" options={CORNER_STYLES} value={theme.corners} onChange={theme.setCorners} />
            </SettingItem>
            <SettingItem name="Animations" description="Full or minimal motion.">
              <Dropdown label="Animations" options={MOTION_MODES} value={theme.motion} onChange={theme.setMotion} />
            </SettingItem>
            <SettingItem name="Line width" description="Document column width.">
              <Dropdown label="Line width" options={LINE_WIDTHS} value={theme.lineWidth} onChange={theme.setLineWidth} />
            </SettingItem>
            <SettingItem name="Reset appearance" description="Restore every appearance option above to its default.">
              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={theme.resetAppearance}>Reset</Button>
            </SettingItem>
          </>
        );
      case 'hotkeys':
        return (
          <>
            <Heading>Hotkeys</Heading>
            {SHORTCUTS.map(({ keys, desc }) => (
              <SettingItem key={keys} name={desc}>
                <span className="flex gap-1">
                  {keys.split(' + ').map(k => <kbd key={k} className="kbd px-1.5 py-0.5 text-[11px]">{k}</kbd>)}
                </span>
              </SettingItem>
            ))}
          </>
        );
      case 'account':
        return (
          <>
            <Heading>Account</Heading>
            <SettingItem name="Signed in as" description="Accounts are username + password only — no email or personal data.">
              <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-content">
                {user?.username}
                {user?.isAdmin && (
                  <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                    <ShieldCheck className="h-3 w-3" /> Admin
                  </span>
                )}
              </span>
            </SettingItem>
            <SettingItem name="Password" description="Ask an administrator to reset your password from Manage users.">
              <span className="text-xs text-faint">Managed by admins</span>
            </SettingItem>
            <SettingItem name="Sign out" description="Ends this session on this device. Your projects stay on the server.">
              <Button variant="danger" size="sm" icon={LogOut} onClick={() => { closeSettings(); void logout(); }}>Sign out</Button>
            </SettingItem>
          </>
        );
      case 'about':
        return (
          <>
            <Heading>About</Heading>
            <SettingItem name="DevArchitect" description="Project planning workspace for software, web, and game projects.">
              <span className="text-xs text-faint">v1.0.0</span>
            </SettingItem>
            <SettingItem name="Storage" description="Projects live in your server's PostgreSQL database. The browser only keeps your session token and appearance preferences.">
              <span className="text-xs text-faint">Self-hosted</span>
            </SettingItem>
          </>
        );
    }
  };

  return (
    <Modal open={isOpen} onClose={closeSettings} size="full" bare>
      <nav aria-label="Settings sections" className="hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-chrome p-2 sm:flex">
        <div className="eyebrow px-2 pb-1 pt-2">Options</div>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            aria-current={section === id ? 'page' : undefined}
            className={cn('nav-row px-2', section === id && 'is-active font-medium')}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Section picker for narrow screens. */}
        <div className="shrink-0 border-b border-border p-3 pr-12 sm:hidden">
          <select
            aria-label="Settings section"
            value={section}
            onChange={e => setSection(e.target.value as SectionId)}
            className="h-8 w-full rounded-md border border-border bg-surface-raised px-2 text-[0.8125rem] text-content"
          >
            {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {renderSection()}
        </div>
      </div>
    </Modal>
  );
};
