import React, { useRef } from 'react';
import { cn } from '../ui';

interface ResizeHandleProps {
  /** Which edge of the panel this handle sits on. */
  side: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  onReset: () => void;
}

/** Thin drag handle for the side docks. Double-click restores the default width. */
const ResizeHandle: React.FC<ResizeHandleProps> = ({ side, width, min, max, onResize, onReset }) => {
  const startRef = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startRef.current = { x: e.clientX, width };
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const delta = e.clientX - startRef.current.x;
    // A handle on the dock's right edge grows with +x; on its left edge, with -x.
    const next = startRef.current.width + (side === 'right' ? delta : -delta);
    onResize(Math.round(Math.min(max, Math.max(min, next))));
  };

  const end = () => {
    if (!startRef.current) return;
    startRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      className={cn(
        'absolute top-0 z-20 h-full w-1.5 cursor-col-resize transition-colors hover:bg-accent/40 active:bg-accent/60',
        side === 'right' ? '-right-[3px]' : '-left-[3px]',
      )}
    />
  );
};

export default ResizeHandle;
