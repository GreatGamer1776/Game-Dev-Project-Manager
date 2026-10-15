import { useCallback, useMemo, useRef, useState } from 'react';
import { uid } from '../utils/id';

// Obsidian-style tabs ("leaves"): each tab keeps its own back/forward history,
// opening a file navigates the active tab, and pinned tabs are never replaced.

export interface Leaf {
  id: string;
  /** Files visited in this tab; history[index] is the one shown. Empty = "New tab". */
  history: string[];
  index: number;
  pinned: boolean;
}

export interface PersistedLeaf {
  fileId: string | null;
  pinned: boolean;
}

export type OpenMode = 'current' | 'new-tab';

interface TabsState {
  leaves: Leaf[];
  activeLeafId: string | null;
}

const MAX_HISTORY = 50;

export const currentFileOf = (leaf: Leaf | undefined | null): string | null =>
  leaf && leaf.index >= 0 ? leaf.history[leaf.index] ?? null : null;

/** Pinned tabs stay grouped at the front, like Obsidian. */
const orderPinnedFirst = (leaves: Leaf[]) => [...leaves.filter(l => l.pinned), ...leaves.filter(l => !l.pinned)];

const newLeaf = (fileId: string | null, pinned = false): Leaf => ({
  id: uid(),
  history: fileId ? [fileId] : [],
  index: fileId ? 0 : -1,
  pinned,
});

export const useWorkspaceTabs = () => {
  const [state, setState] = useState<TabsState>({ leaves: [], activeLeafId: null });
  // Latest committed-or-pending state, so several calls in one event compose
  // and no side effects ever run inside a state updater.
  const stateRef = useRef(state);

  const commit = useCallback((next: TabsState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const { leaves, activeLeafId } = state;
  const activeLeaf = useMemo(() => leaves.find(l => l.id === activeLeafId) || null, [leaves, activeLeafId]);
  const activeFileId = currentFileOf(activeLeaf);

  /** Replace every tab (project switch / hydration). */
  const resetTabs = useCallback((saved: PersistedLeaf[], activeIndex: number) => {
    const next = orderPinnedFirst(saved.map(s => newLeaf(s.fileId, s.pinned)));
    const active = next[Math.min(Math.max(activeIndex, 0), next.length - 1)];
    commit({ leaves: next, activeLeafId: active?.id ?? null });
  }, [commit]);

  const setActiveLeafId = useCallback((leafId: string) => {
    commit({ ...stateRef.current, activeLeafId: leafId });
  }, [commit]);

  const openFile = useCallback((fileId: string, mode: OpenMode = 'current') => {
    const { leaves: prev, activeLeafId: activeId } = stateRef.current;
    // Already open somewhere? Focus that tab instead of duplicating it.
    const existing = prev.find(l => currentFileOf(l) === fileId);
    if (existing && mode === 'current') {
      commit({ leaves: prev, activeLeafId: existing.id });
      return;
    }
    const active = prev.find(l => l.id === activeId);
    if (mode === 'new-tab' || !active || active.pinned) {
      const leaf = newLeaf(fileId);
      const at = active ? prev.indexOf(active) + 1 : prev.length;
      commit({ leaves: orderPinnedFirst([...prev.slice(0, at), leaf, ...prev.slice(at)]), activeLeafId: leaf.id });
      return;
    }
    commit({
      activeLeafId: active.id,
      leaves: prev.map(l => {
        if (l.id !== active.id) return l;
        const history = [...l.history.slice(0, l.index + 1), fileId].slice(-MAX_HISTORY);
        return { ...l, history, index: history.length - 1 };
      }),
    });
  }, [commit]);

  const newTab = useCallback(() => {
    const { leaves: prev, activeLeafId: activeId } = stateRef.current;
    const leaf = newLeaf(null);
    const at = prev.findIndex(l => l.id === activeId);
    commit({ leaves: orderPinnedFirst([...prev.slice(0, at + 1), leaf, ...prev.slice(at + 1)]), activeLeafId: leaf.id });
  }, [commit]);

  const go = useCallback((delta: 1 | -1) => {
    const { leaves: prev, activeLeafId: activeId } = stateRef.current;
    commit({
      activeLeafId: activeId,
      leaves: prev.map(l => {
        if (l.id !== activeId) return l;
        const index = l.index + delta;
        return index >= 0 && index < l.history.length ? { ...l, index } : l;
      }),
    });
  }, [commit]);

  const closeWhere = useCallback((shouldClose: (leaf: Leaf, i: number, all: Leaf[]) => boolean, focusId?: string) => {
    const { leaves: prev, activeLeafId: activeId } = stateRef.current;
    const next = prev.filter((l, i) => !shouldClose(l, i, prev));
    let nextActive = focusId && next.some(l => l.id === focusId) ? focusId : activeId;
    if (!next.some(l => l.id === nextActive)) {
      // Prefer the neighbour that slides into the closed tab's slot.
      const oldIndex = prev.findIndex(l => l.id === activeId);
      nextActive = next[Math.min(Math.max(oldIndex, 0), next.length - 1)]?.id ?? null;
    }
    commit({ leaves: next, activeLeafId: nextActive });
  }, [commit]);

  const closeTab = useCallback((leafId: string) => closeWhere(l => l.id === leafId), [closeWhere]);
  const closeOthers = useCallback((leafId: string) => closeWhere(l => l.id !== leafId && !l.pinned, leafId), [closeWhere]);
  const closeToRight = useCallback((leafId: string) =>
    closeWhere((l, i, all) => i > all.findIndex(x => x.id === leafId) && !l.pinned), [closeWhere]);
  const closeAll = useCallback(() => closeWhere(l => !l.pinned), [closeWhere]);

  const togglePin = useCallback((leafId: string) => {
    const { leaves: prev, activeLeafId: activeId } = stateRef.current;
    commit({ activeLeafId: activeId, leaves: orderPinnedFirst(prev.map(l => (l.id === leafId ? { ...l, pinned: !l.pinned } : l))) });
  }, [commit]);

  const reorder = useCallback((draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const { leaves: prev, activeLeafId: activeId } = stateRef.current;
    const from = prev.findIndex(l => l.id === draggedId);
    const to = prev.findIndex(l => l.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...prev];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit({ activeLeafId: activeId, leaves: orderPinnedFirst(next) });
  }, [commit]);

  /** Drop history entries for files that no longer exist (e.g. after a delete). */
  const pruneMissing = useCallback((exists: (fileId: string) => boolean) => {
    const { leaves: prev, activeLeafId: activeId } = stateRef.current;
    if (prev.every(l => l.history.every(exists))) return;
    const next: Leaf[] = [];
    for (const l of prev) {
      if (l.history.every(exists)) {
        next.push(l);
        continue;
      }
      const kept = l.history.filter(exists);
      // A tab whose every file vanished closes (explicit empty tabs never get here).
      if (kept.length === 0) continue;
      // Point at the nearest surviving entry at or before the old position.
      const before = l.history.slice(0, l.index + 1).filter(exists).length;
      next.push({ ...l, history: kept, index: Math.max(0, before - 1) });
    }
    const nextActive = next.some(l => l.id === activeId) ? activeId : next[0]?.id ?? null;
    commit({ leaves: next, activeLeafId: nextActive });
  }, [commit]);

  const toPersisted = useCallback((): { tabs: PersistedLeaf[]; activeIndex: number } => ({
    tabs: leaves.map(l => ({ fileId: currentFileOf(l), pinned: l.pinned })),
    activeIndex: leaves.findIndex(l => l.id === activeLeafId),
  }), [leaves, activeLeafId]);

  const goBack = useCallback(() => go(-1), [go]);
  const goForward = useCallback(() => go(1), [go]);

  return {
    leaves,
    activeLeafId,
    activeFileId,
    canGoBack: Boolean(activeLeaf && activeLeaf.index > 0),
    canGoForward: Boolean(activeLeaf && activeLeaf.index < activeLeaf.history.length - 1),
    setActiveLeafId,
    resetTabs,
    openFile,
    newTab,
    goBack,
    goForward,
    closeTab,
    closeOthers,
    closeToRight,
    closeAll,
    togglePin,
    reorder,
    pruneMissing,
    toPersisted,
  };
};
