import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { useMenuStore, MenuEntry } from '../../stores/useMenuStore';
import { cn } from './cn';

type ItemEntry = Extract<MenuEntry, { label: string; onSelect: () => void }>;

const isItem = (entry: MenuEntry): entry is ItemEntry =>
  (entry.kind === undefined || entry.kind === 'item') && !(entry as ItemEntry).disabled;

const VIEWPORT_PAD = 8;

/** Renders the menu opened via showMenu(). Mount once at the app root. */
export const MenuHost: React.FC = () => {
  const entries = useMenuStore(s => s.entries);
  const position = useMenuStore(s => s.position);
  const close = useMenuStore(s => s.close);
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Mirrors activeIndex for the document-level key handler (no stale closure,
  // and no side effects inside state updaters).
  const activeIndexRef = useRef(-1);
  activeIndexRef.current = activeIndex;

  // Measure, then clamp into the viewport (flip above the anchor if needed).
  useLayoutEffect(() => {
    if (!entries || !position || !ref.current) {
      setCoords(null);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    let left = position.x;
    let top = position.y;
    if (left + width > window.innerWidth - VIEWPORT_PAD) left = Math.max(VIEWPORT_PAD, window.innerWidth - width - VIEWPORT_PAD);
    if (top + height > window.innerHeight - VIEWPORT_PAD) {
      top = position.anchorTop !== undefined
        ? Math.max(VIEWPORT_PAD, position.anchorTop - height)
        : Math.max(VIEWPORT_PAD, window.innerHeight - height - VIEWPORT_PAD);
    }
    setCoords({ left, top });
    setActiveIndex(-1);
  }, [entries, position]);

  useEffect(() => {
    if (!entries) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      const items = entries.map((entry, i) => (isItem(entry) ? i : -1)).filter(i => i >= 0);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length === 0) return;
        setActiveIndex(prev => {
          const pos = items.indexOf(prev);
          if (e.key === 'ArrowDown') return items[(pos + 1) % items.length];
          return items[(pos - 1 + items.length) % items.length];
        });
      } else if (e.key === 'Enter') {
        const entry = entries[activeIndexRef.current];
        if (entry && isItem(entry)) {
          e.preventDefault();
          close();
          entry.onSelect();
        }
      }
    };
    const onDismiss = () => close();
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('blur', onDismiss);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('blur', onDismiss);
    };
  }, [entries, close]);

  if (!entries || !position) return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onContextMenu={e => e.preventDefault()}
      className="fixed z-[200] min-w-[200px] max-w-[320px] rounded-lg bg-surface-raised p-1 shadow-menu animate-menu-in"
      style={{
        left: coords?.left ?? position.x,
        top: coords?.top ?? position.y,
        visibility: coords ? 'visible' : 'hidden',
      }}
    >
      {entries.map((entry, i) => {
        if (entry.kind === 'separator') {
          return <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-border" />;
        }
        if (entry.kind === 'heading') {
          return (
            <div key={`h-${i}`} className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
              {entry.label}
            </div>
          );
        }
        const Icon = entry.icon;
        return (
          <button
            key={`${entry.label}-${i}`}
            role="menuitem"
            type="button"
            disabled={entry.disabled}
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => {
              close();
              entry.onSelect();
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.8125rem] transition-colors disabled:opacity-40',
              entry.danger ? 'text-danger' : 'text-content',
              activeIndex === i && (entry.danger ? 'bg-danger/15' : 'bg-surface-hover'),
            )}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {entry.checked ? (
                <Check className="h-3.5 w-3.5 text-accent" />
              ) : Icon ? (
                <Icon className={cn('h-3.5 w-3.5', entry.danger ? 'text-danger' : 'text-muted')} />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.hint && <span className="shrink-0 pl-3 text-[11px] text-faint">{entry.hint}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
};
