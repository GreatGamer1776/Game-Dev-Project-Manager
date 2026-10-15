import type React from 'react';
import { create } from 'zustand';

// Program-wide context/dropdown menu (Obsidian-style). Any component can call
// showMenu() with a mouse event or an anchor element; <MenuHost /> renders it.

export type MenuIcon = React.ComponentType<{ className?: string }>;

export type MenuEntry =
  | {
      kind?: 'item';
      label: string;
      icon?: MenuIcon;
      onSelect: () => void;
      /** Right-aligned shortcut / hint text. */
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Renders a check mark (for sort/toggle menus). */
      checked?: boolean;
    }
  | { kind: 'separator' }
  | { kind: 'heading'; label: string };

export interface MenuPosition {
  x: number;
  y: number;
  /** Bottom edge of the anchor — used to flip above it when out of room. */
  anchorTop?: number;
}

interface MenuStoreState {
  entries: MenuEntry[] | null;
  position: MenuPosition | null;
  open: (entries: MenuEntry[], position: MenuPosition) => void;
  close: () => void;
}

export const useMenuStore = create<MenuStoreState>((set) => ({
  entries: null,
  position: null,
  open: (entries, position) => set({ entries, position }),
  close: () => set({ entries: null, position: null }),
}));

/**
 * Open a menu at the cursor (context menus) or under an element (dropdowns).
 * Pass the triggering event; a mouse event without coordinates (keyboard
 * "click") falls back to the target's rect.
 */
export const showMenu = (
  event: React.MouseEvent | MouseEvent | { currentTarget: Element },
  entries: MenuEntry[],
  placement: 'cursor' | 'below' = 'cursor',
) => {
  if ('preventDefault' in event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const target = event.currentTarget as Element | null;
  const rect = target?.getBoundingClientRect?.();
  const isPointer = 'clientX' in event && (event.clientX !== 0 || event.clientY !== 0);
  if (placement === 'cursor' && isPointer) {
    useMenuStore.getState().open(entries, { x: event.clientX, y: event.clientY });
  } else if (rect) {
    useMenuStore.getState().open(entries, { x: rect.left, y: rect.bottom + 4, anchorTop: rect.top - 4 });
  }
};
