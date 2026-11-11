import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TipState {
  text: string;
  kbd?: string;
  rect: DOMRect;
  side: Side;
}

const SHOW_DELAY = 400;
/** Moving between buttons soon after a tooltip closed shows the next one at once. */
const WARM_WINDOW = 600;
const GAP = 8;
const PAD = 6;

const tipTarget = (node: EventTarget | null): HTMLElement | null =>
  node instanceof Element ? (node.closest('[data-tip]') as HTMLElement | null) : null;

/**
 * One tooltip for the whole app. Any element with `data-tip="Label"` gets a
 * tooltip on hover (and on keyboard focus); `data-tip-kbd="Ctrl O"` adds a
 * shortcut chip and `data-tip-side` picks the side (default: bottom).
 * Mount once at the root.
 */
export const TooltipHost: React.FC = () => {
  const [tip, setTip] = useState<TipState | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const current = useRef<HTMLElement | null>(null);
  const lastHidden = useRef(0);

  useEffect(() => {
    const clear = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
    };
    const hide = () => {
      clear();
      if (current.current) lastHidden.current = Date.now();
      current.current = null;
      setTip(null);
    };
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      current.current = el;
      setTip({
        text,
        kbd: el.dataset.tipKbd,
        rect: el.getBoundingClientRect(),
        side: (el.dataset.tipSide as Side) || 'bottom',
      });
    };
    const schedule = (el: HTMLElement) => {
      clear();
      current.current = el;
      const warm = Date.now() - lastHidden.current < WARM_WINDOW;
      timer.current = window.setTimeout(() => {
        if (current.current === el && el.isConnected) show(el);
      }, warm ? 0 : SHOW_DELAY);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = tipTarget(e.target);
      if (el === current.current) return;
      if (current.current) hide();
      if (el) schedule(el);
    };
    const onOut = (e: PointerEvent) => {
      const el = tipTarget(e.target);
      if (el && el === current.current && !el.contains(e.relatedTarget as Node)) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = tipTarget(e.target);
      if (el && el === e.target && el.matches(':focus-visible')) schedule(el);
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clear();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Place on the requested side, flipping or clamping to stay on screen.
  useLayoutEffect(() => {
    if (!tip || !ref.current) {
      setPos(null);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    const { rect } = tip;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let side = tip.side;
    if (side === 'bottom' && rect.bottom + GAP + height > vh - PAD) side = 'top';
    if (side === 'top' && rect.top - GAP - height < PAD) side = 'bottom';
    if (side === 'right' && rect.right + GAP + width > vw - PAD) side = 'left';
    if (side === 'left' && rect.left - GAP - width < PAD) side = 'right';
    let left: number;
    let top: number;
    if (side === 'top' || side === 'bottom') {
      left = rect.left + rect.width / 2 - width / 2;
      top = side === 'bottom' ? rect.bottom + GAP : rect.top - GAP - height;
    } else {
      left = side === 'right' ? rect.right + GAP : rect.left - GAP - width;
      top = rect.top + rect.height / 2 - height / 2;
    }
    left = Math.max(PAD, Math.min(left, vw - width - PAD));
    top = Math.max(PAD, Math.min(top, vh - height - PAD));
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="tooltip"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <span>{tip.text}</span>
      {tip.kbd && <span className="kbd">{tip.kbd}</span>}
    </div>,
    document.body,
  );
};
