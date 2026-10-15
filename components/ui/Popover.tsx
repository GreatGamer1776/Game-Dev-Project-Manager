import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

interface PopoverProps {
  /** Element the popover opens under; null = closed. */
  anchor: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

/** Small anchored panel (filters, sorts, view options). Closes on outside click / Escape. */
const Popover: React.FC<PopoverProps> = ({ anchor, onClose, children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const rect = anchor.getBoundingClientRect();
    const { width, height } = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    // Re-measured every render (content height changes); only update on movement.
    setPos(prev => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
  });

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      // Menus opened from inside the popover live in their own portal.
      if ((target as Element).closest?.('[role="menu"]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return createPortal(
    <div
      ref={ref}
      className={cn('fixed z-[140] rounded-lg bg-surface-raised p-2 shadow-menu animate-menu-in', className)}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {children}
    </div>,
    document.body,
  );
};

export default Popover;
