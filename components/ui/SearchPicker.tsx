import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { fuzzyMatch } from '../../utils/fileText';
import { cn } from './cn';

export interface PickerItem {
  id: string;
  label: string;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Image/video thumbnail (data URL). */
  thumb?: string;
}

interface SearchPickerProps {
  /** Element the picker opens under; null = closed. */
  anchor: HTMLElement | null;
  items: PickerItem[];
  placeholder?: string;
  emptyText?: string;
  onPick: (item: PickerItem) => void;
  onClose: () => void;
}

/** Fuzzy-searchable dropdown list anchored under a toolbar button. */
const SearchPicker: React.FC<SearchPickerProps> = ({ anchor, items, placeholder = 'Search…', emptyText = 'No matches.', onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery('');
    setSelected(0);
  }, [anchor]);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const rect = anchor.getBoundingClientRect();
    const { width, height } = ref.current.getBoundingClientRect();
    let left = Math.min(rect.left, window.innerWidth - width - 8);
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    left = Math.max(8, left);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchor, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items.map(item => ({ item, indexes: [] as number[] }));
    return items
      .map(item => ({ item, match: fuzzyMatch(`${item.label} ${item.sub || ''}`, q) }))
      .filter((r): r is { item: PickerItem; match: NonNullable<ReturnType<typeof fuzzyMatch>> } => r.match !== null)
      .sort((a, b) => b.match.score - a.match.score)
      .map(r => ({ item: r.item, indexes: r.match.indexes.filter(i => i < r.item.label.length) }));
  }, [items, query]);

  if (!anchor) return null;

  const pick = (item: PickerItem | undefined) => {
    if (!item) return;
    onPick(item);
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[150] flex max-h-80 w-80 flex-col overflow-hidden rounded-lg bg-surface-raised shadow-menu animate-menu-in"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); pick(filtered[selected]?.item); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 flex-1 bg-transparent text-[0.8125rem] text-content outline-none placeholder:text-faint"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-faint">{emptyText}</p>
        ) : filtered.map(({ item, indexes }, i) => {
          const Icon = item.icon;
          const set = new Set(indexes);
          return (
            <button
              key={item.id}
              type="button"
              onMouseMove={() => selected !== i && setSelected(i)}
              onClick={() => pick(item)}
              className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left', selected === i && 'bg-surface-hover')}
            >
              {item.thumb ? (
                item.thumb.startsWith('data:video')
                  ? <video src={item.thumb} muted className="h-9 w-9 shrink-0 rounded object-cover" />
                  : <img src={item.thumb} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
              ) : Icon ? <Icon className="h-4 w-4 shrink-0 text-faint" /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] text-content">
                  {Array.from(item.label).map((ch, idx) => set.has(idx) ? <b key={idx} className="text-accent">{ch}</b> : ch)}
                </span>
                {item.sub && <span className="block truncate text-[11px] text-faint">{item.sub}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};

export default SearchPicker;
