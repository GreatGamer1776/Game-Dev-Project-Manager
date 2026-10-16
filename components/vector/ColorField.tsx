import React, { useRef, useState } from 'react';
import Popover from '../ui/Popover';
import { cn } from '../ui';
import { VECTOR_SWATCHES, colorAlphaParts, withAlpha } from '../../utils/vectorModel';

const hexToHsv = (hex6: string) => {
  const n = parseInt(hex6.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
};

const hsvToHex = ({ h, s, v }: { h: number; s: number; v: number }) => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
};

/** Pointer-drag over a box, reporting 0..1 coordinates. */
const useDrag = (onMove: (x: number, y: number) => void) => {
  const ref = useRef<HTMLDivElement>(null);
  const handle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onMove(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
  };
  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); handle(e); },
    onPointerMove: (e: React.PointerEvent) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) handle(e); },
  };
};

const CHECKER = 'repeating-conic-gradient(#999 0 25%, #ddd 0 50%) 0 0 / 8px 8px';
const Thumb: React.FC<{ left: string; top: string }> = ({ left, top }) => (
  <span className="pointer-events-none absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left, top }} />
);

const ColorPicker: React.FC<{ color: string; onChange: (c: string) => void; allowNone?: boolean }> = ({ color, onChange, allowNone }) => {
  const init = colorAlphaParts(color);
  const [hsv, setHsv] = useState(() => hexToHsv(init.hex6));
  const [alpha, setAlpha] = useState(color === 'none' || color === 'transparent' ? 100 : init.alphaPct);
  const [hexText, setHexText] = useState<string | null>(null);

  const commit = (next: typeof hsv, nextAlpha: number) => {
    setHsv(next);
    setAlpha(nextAlpha);
    onChange(withAlpha(hsvToHex(next), nextAlpha));
  };
  const sv = useDrag((x, y) => commit({ ...hsv, s: x, v: 1 - y }, alpha));
  const hue = useDrag(x => commit({ ...hsv, h: x * 360 }, alpha));
  const op = useDrag(x => commit(hsv, Math.round(x * 100)));
  const hex6 = hsvToHex(hsv);

  return (
    <div className="flex w-52 flex-col gap-2">
      <div
        ref={sv.ref}
        onPointerDown={sv.onPointerDown}
        onPointerMove={sv.onPointerMove}
        className="relative h-28 cursor-crosshair touch-none rounded"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
      >
        <Thumb left={`${hsv.s * 100}%`} top={`${(1 - hsv.v) * 100}%`} />
      </div>
      <div
        ref={hue.ref}
        onPointerDown={hue.onPointerDown}
        onPointerMove={hue.onPointerMove}
        title="Hue"
        className="relative h-3 cursor-pointer touch-none rounded-full"
        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      >
        <Thumb left={`${(hsv.h / 360) * 100}%`} top="50%" />
      </div>
      <div ref={op.ref} onPointerDown={op.onPointerDown} onPointerMove={op.onPointerMove} title="Opacity" className="relative h-3 cursor-pointer touch-none rounded-full" style={{ background: CHECKER }}>
        <span className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(to right, transparent, ${hex6})` }} />
        <Thumb left={`${alpha}%`} top="50%" />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={hexText ?? hex6}
          spellCheck={false}
          aria-label="Hex color"
          onChange={e => {
            setHexText(e.target.value);
            const v = e.target.value.trim();
            if (/^#?[0-9a-f]{6}$/i.test(v)) commit(hexToHsv(v.startsWith('#') ? v : `#${v}`), alpha);
          }}
          onBlur={() => setHexText(null)}
          className="h-7 min-w-0 flex-1 rounded border border-border bg-bg px-2 font-mono text-[12px] text-content outline-none focus:border-accent"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={alpha}
          aria-label="Opacity percent"
          onChange={e => commit(hsv, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          className="h-7 w-14 rounded border border-border bg-bg px-1.5 text-[12px] text-content outline-none focus:border-accent"
        />
        <span className="text-[12px] text-muted">%</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        {allowNone && (
          <button
            type="button"
            title="None"
            aria-label="No color"
            onClick={() => onChange('none')}
            className={cn('relative h-5 w-5 overflow-hidden rounded-full ring-1 ring-border-strong', color === 'none' && 'ring-2 ring-accent')}
          >
            <span className="absolute left-1/2 top-[-2px] h-6 w-0.5 -translate-x-1/2 rotate-45 bg-danger" />
          </button>
        )}
        {VECTOR_SWATCHES.map(c => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Use ${c}`}
            onClick={() => commit(hexToHsv(c), 100)}
            className={cn('h-5 w-5 rounded-full ring-1 ring-border-strong', color.toLowerCase() === c && 'ring-2 ring-accent')}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
};

/** A round color well that opens a full color + opacity picker. */
export const ColorField: React.FC<{
  color: string;
  onChange: (c: string) => void;
  label?: string;
  title: string;
  allowNone?: boolean;
  disabled?: boolean;
}> = ({ color, onChange, label, title, allowNone, disabled }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const isNone = color === 'none' || color === 'transparent';
  return (
    <>
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={disabled}
        onClick={e => setAnchor(anchor ? null : e.currentTarget)}
        className={cn('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-muted hover:bg-surface-hover hover:text-content disabled:opacity-40', anchor && 'bg-surface-hover text-content')}
      >
        <span className="relative h-4 w-4 overflow-hidden rounded-full ring-1 ring-border-strong" style={{ background: CHECKER }}>
          <span className="absolute inset-0" style={{ background: isNone ? 'transparent' : color }} />
          {color === 'none' && <span className="absolute left-1/2 top-[-2px] h-5 w-0.5 -translate-x-1/2 rotate-45 bg-danger" />}
        </span>
        {label}
      </button>
      <Popover anchor={anchor} onClose={() => setAnchor(null)} className="p-2.5">
        <ColorPicker color={color} onChange={onChange} allowNone={allowNone} />
      </Popover>
    </>
  );
};

/** Range slider plus an editable number, for stroke width / radius / font size. */
export const SliderField: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  title: string;
  label?: string;
  unit?: string;
}> = ({ value, onChange, min, max, title, label, unit }) => (
  <label className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1 text-[12px] text-muted" title={title}>
    {label && <span>{label}</span>}
    <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="w-14 accent-[rgb(var(--color-accent))]" />
    <input
      type="number"
      min={min}
      max={max}
      value={Math.round(value * 10) / 10}
      onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      className="h-6 w-11 rounded border border-border bg-bg px-1 text-[12px] text-content outline-none focus:border-accent"
    />
    {unit && <span className="text-faint">{unit}</span>}
  </label>
);
