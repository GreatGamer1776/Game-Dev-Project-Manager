import React from 'react';
import { Modal } from './ui';

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
  { keys: 'Ctrl + Alt + \\', desc: 'Split the current pane to the right' },
  { keys: 'Ctrl + Alt + ↓', desc: 'Focus the next pane (↑ for the previous one)' },
  { keys: 'Ctrl + Alt + click', desc: 'Open a file to the right (from the sidebar)' },
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

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => (
  <Modal open={isOpen} onClose={onClose} title="Keyboard shortcuts" size="lg">
    <div className="divide-y divide-border rounded-lg border border-border">
      {SHORTCUTS.map(({ keys, desc }) => (
        <div key={keys} className="flex items-center gap-4 px-3 py-2">
          <span className="flex w-40 shrink-0 gap-1">
            {keys.split(' + ').map(k => <kbd key={k} className="kbd h-5 px-1.5">{k}</kbd>)}
          </span>
          <span className="text-[0.8125rem] text-muted">{desc}</span>
        </div>
      ))}
    </div>
  </Modal>
);

export default HelpModal;
