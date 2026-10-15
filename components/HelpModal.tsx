import React from 'react';
import { Modal } from './ui';
import { FILE_TYPES } from './fileTypes';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Every global shortcut, shared by this modal and Settings → Hotkeys. */
export const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: 'Ctrl + O', desc: 'Quick switcher — open a file or project (Ctrl + K also works)' },
  { keys: 'Ctrl + P', desc: 'Command palette' },
  { keys: 'Alt + N', desc: 'New document (Ctrl + N where the browser allows it)' },
  { keys: 'F2', desc: 'Rename the current file' },
  { keys: 'Ctrl + Shift + F', desc: 'Search in all files' },
  { keys: 'Ctrl + \\', desc: 'Toggle left sidebar' },
  { keys: 'Ctrl + Shift + \\', desc: 'Toggle right sidebar (outline, links, file info)' },
  { keys: 'Ctrl + Alt + ←', desc: 'Navigate back in the current tab' },
  { keys: 'Ctrl + Alt + →', desc: 'Navigate forward in the current tab' },
  { keys: 'Ctrl + G', desc: 'Open graph view' },
  { keys: 'Alt + D', desc: "Open today's daily note" },
  { keys: 'Ctrl + ,', desc: 'Open settings' },
  { keys: 'Ctrl + B', desc: 'Bold (inside documents)' },
  { keys: 'Ctrl + I', desc: 'Italic (inside documents)' },
  { keys: 'Ctrl + K', desc: 'Insert link (inside documents)' },
  { keys: 'Ctrl + L', desc: 'Toggle task checkbox (inside documents)' },
  { keys: 'Ctrl + Shift + H', desc: 'Highlight (inside documents)' },
  { keys: 'Ctrl + F', desc: 'Find and replace in the document (inside documents)' },
  { keys: 'Ctrl + S', desc: 'Save now (inside editors)' },
  { keys: 'Ctrl + Z', desc: 'Undo (inside editors)' },
  { keys: 'Ctrl + Y', desc: 'Redo (inside editors)' },
];

const TIPS = [
  'In documents: type [[ to link a file, # for tags, and / at the start of a line for blocks (callouts, tables, diagrams, templates).',
  'Paste or drop images straight into a document to add them to the asset library.',
  "Clicking a [[link]] to a note that doesn't exist yet creates it. Renaming a file updates every [[link]] to it.",
  'Right-click files, folders, and tabs for more actions.',
  'Drag a file from the sidebar into a document to insert a link to it.',
  'Clicking a file opens it in the current tab; pinned tabs are never replaced.',
  'Type ">" in the quick switcher to run a command instead.',
  'Middle-click a tab to close it. Drag tabs to reorder them.',
];

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => (
  <Modal open={isOpen} onClose={onClose} title="Help" description="Keyboard shortcuts, file types, and tips." size="lg">
    <div className="space-y-6">
      <section>
        <h3 className="eyebrow mb-2">Keyboard shortcuts</h3>
        <div className="divide-y divide-border rounded-lg border border-border">
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={keys} className="flex items-center gap-4 px-3 py-2">
              <span className="flex w-40 shrink-0 gap-1">
                {keys.split(' + ').map(k => <kbd key={k} className="kbd px-1.5 py-0.5 text-[11px]">{k}</kbd>)}
              </span>
              <span className="text-[0.8125rem] text-muted">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="eyebrow mb-2">File types</h3>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {FILE_TYPES.map(({ type, label, blurb, icon: Icon }) => (
            <div key={type} className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0 text-faint" />
              <span className="text-[0.8125rem] text-content">{label}</span>
              <span className="truncate text-xs text-faint">{blurb}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="eyebrow mb-2">Tips</h3>
        <ul className="list-disc space-y-1 pl-5 text-[0.8125rem] text-muted marker:text-faint">
          {TIPS.map(tip => <li key={tip}>{tip}</li>)}
        </ul>
      </section>
    </div>
  </Modal>
);

export default HelpModal;
