import { useCallback, useMemo, useRef, useState } from 'react';
import { uid } from '../utils/id';

// Obsidian-style workspace: a layout tree of split panes, each pane holding
// its own tabs ("leaves"), and each tab keeping its own back/forward history.
// Opening a file navigates the active tab of the active pane; pinned tabs are
// never replaced.

export interface Leaf {
  id: string;
  /** Files visited in this tab; history[index] is the one shown. Empty = "New tab". */
  history: string[];
  index: number;
  pinned: boolean;
}

export interface Pane {
  id: string;
  leaves: Leaf[];
  activeLeafId: string | null;
}

export type SplitDir = 'row' | 'column';
export type LayoutNode =
  | { kind: 'pane'; id: string }
  | { kind: 'split'; id: string; dir: SplitDir; children: LayoutNode[]; sizes: number[] };

export type OpenMode = 'current' | 'new-tab' | 'split-right' | 'split-down';
export type Edge = 'left' | 'right' | 'top' | 'bottom';

export interface PersistedLeaf {
  fileId: string | null;
  pinned: boolean;
}
export interface PersistedPane {
  tabs: PersistedLeaf[];
  activeIndex: number;
}
export interface PersistedWorkspace {
  layout: LayoutNode;
  panes: Record<string, PersistedPane>;
  activePaneId: string;
}

interface WorkspaceState {
  layout: LayoutNode;
  panes: Record<string, Pane>;
  activePaneId: string;
}

const MAX_HISTORY = 50;

export const currentFileOf = (leaf: Leaf | undefined | null): string | null =>
  leaf && leaf.index >= 0 ? leaf.history[leaf.index] ?? null : null;

const newLeaf = (fileId: string | null, pinned = false): Leaf => ({
  id: uid(),
  history: fileId ? [fileId] : [],
  index: fileId ? 0 : -1,
  pinned,
});

const newPane = (leaves: Leaf[] = []): Pane => ({ id: uid(), leaves, activeLeafId: leaves[0]?.id ?? null });

/** Pinned tabs stay grouped at the front, like Obsidian. */
const orderPinnedFirst = (leaves: Leaf[]) => [...leaves.filter(l => l.pinned), ...leaves.filter(l => !l.pinned)];

const singlePane = (pane: Pane): WorkspaceState => ({
  layout: { kind: 'pane', id: pane.id },
  panes: { [pane.id]: pane },
  activePaneId: pane.id,
});

// --- Layout tree helpers -------------------------------------------------------

export const paneIdsOf = (node: LayoutNode): string[] =>
  node.kind === 'pane' ? [node.id] : node.children.flatMap(paneIdsOf);

const normalizeSizes = (sizes: number[]) => {
  const total = sizes.reduce((s, n) => s + n, 0) || 1;
  return sizes.map(n => (n / total) * 100);
};

/** Puts `added` beside pane `targetId` on the given edge. */
const insertBeside = (node: LayoutNode, targetId: string, added: LayoutNode, edge: Edge): LayoutNode => {
  const dir: SplitDir = edge === 'left' || edge === 'right' ? 'row' : 'column';
  const before = edge === 'left' || edge === 'top';
  if (node.kind === 'pane') {
    if (node.id !== targetId) return node;
    return { kind: 'split', id: uid(), dir, children: before ? [added, node] : [node, added], sizes: [50, 50] };
  }
  const index = node.children.findIndex(c => c.kind === 'pane' && c.id === targetId);
  if (index >= 0 && node.dir === dir) {
    // Same direction: become a sibling, sharing the target's space.
    const children = [...node.children];
    const sizes = [...node.sizes];
    const half = sizes[index] / 2;
    sizes[index] = half;
    children.splice(before ? index : index + 1, 0, added);
    sizes.splice(before ? index : index + 1, 0, half);
    return { ...node, children, sizes };
  }
  return { ...node, children: node.children.map(c => insertBeside(c, targetId, added, edge)) };
};

/** Removes a pane, collapsing splits left with a single child. */
const removePane = (node: LayoutNode, paneId: string): LayoutNode | null => {
  if (node.kind === 'pane') return node.id === paneId ? null : node;
  const kept: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, i) => {
    const next = removePane(child, paneId);
    if (next) {
      kept.push(next);
      sizes.push(node.sizes[i]);
    }
  });
  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0];
  return { ...node, children: kept, sizes: normalizeSizes(sizes) };
};

const setSizes = (node: LayoutNode, splitId: string, sizes: number[]): LayoutNode => {
  if (node.kind === 'pane') return node;
  if (node.id === splitId) return { ...node, sizes };
  return { ...node, children: node.children.map(c => setSizes(c, splitId, sizes)) };
};

/** Validates a persisted layout against the panes it references. */
const validLayout = (node: unknown, paneIds: Set<string>): node is LayoutNode => {
  if (!node || typeof node !== 'object') return false;
  const n = node as LayoutNode;
  if (n.kind === 'pane') return paneIds.has(n.id);
  return n.kind === 'split' && (n.dir === 'row' || n.dir === 'column') && Array.isArray(n.children) && n.children.length >= 2 &&
    Array.isArray(n.sizes) && n.sizes.length === n.children.length && n.children.every(c => validLayout(c, paneIds));
};

// --- Hook -------------------------------------------------------------------------

export const useWorkspace = () => {
  const [state, setState] = useState<WorkspaceState>(() => singlePane(newPane()));
  // Latest state, so several calls in one event compose and no side effects
  // ever run inside a state updater.
  const stateRef = useRef(state);
  const commit = useCallback((next: WorkspaceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const updatePane = useCallback((paneId: string, fn: (pane: Pane) => Pane, focus = true) => {
    const s = stateRef.current;
    const pane = s.panes[paneId];
    if (!pane) return;
    commit({ ...s, panes: { ...s.panes, [paneId]: fn(pane) }, activePaneId: focus ? paneId : s.activePaneId });
  }, [commit]);

  const activePane = state.panes[state.activePaneId] || Object.values(state.panes)[0];
  const activeLeaf = activePane?.leaves.find(l => l.id === activePane.activeLeafId) || null;
  const activeFileId = currentFileOf(activeLeaf);
  const paneIds = useMemo(() => paneIdsOf(state.layout), [state.layout]);

  // --- Whole-workspace ----------------------------------------------------------

  const reset = useCallback((saved?: PersistedWorkspace | null) => {
    if (!saved) {
      commit(singlePane(newPane()));
      return;
    }
    const panes: Record<string, Pane> = {};
    for (const [id, p] of Object.entries(saved.panes || {})) {
      const leaves = orderPinnedFirst((p.tabs || []).map(t => newLeaf(t.fileId, t.pinned)));
      panes[id] = { id, leaves, activeLeafId: leaves[Math.min(Math.max(p.activeIndex, 0), leaves.length - 1)]?.id ?? null };
    }
    const ids = new Set(Object.keys(panes));
    if (ids.size === 0 || !validLayout(saved.layout, ids)) {
      const first = Object.values(panes)[0] || newPane();
      commit(singlePane(first));
      return;
    }
    // Drop panes the layout doesn't reference.
    const used = new Set(paneIdsOf(saved.layout));
    for (const id of Object.keys(panes)) if (!used.has(id)) delete panes[id];
    commit({ layout: saved.layout, panes, activePaneId: used.has(saved.activePaneId) ? saved.activePaneId : paneIdsOf(saved.layout)[0] });
  }, [commit]);

  /** Single pane with the given tabs (opening a project). */
  const resetTabs = useCallback((tabs: PersistedLeaf[], activeIndex: number) => {
    const leaves = orderPinnedFirst(tabs.map(t => newLeaf(t.fileId, t.pinned)));
    const pane: Pane = { id: uid(), leaves, activeLeafId: leaves[Math.min(Math.max(activeIndex, 0), leaves.length - 1)]?.id ?? null };
    commit(singlePane(pane));
  }, [commit]);

  const focusPane = useCallback((paneId: string) => {
    const s = stateRef.current;
    if (s.activePaneId !== paneId && s.panes[paneId]) commit({ ...s, activePaneId: paneId });
  }, [commit]);

  const resize = useCallback((splitId: string, sizes: number[]) => {
    const s = stateRef.current;
    commit({ ...s, layout: setSizes(s.layout, splitId, sizes) });
  }, [commit]);

  // --- Panes --------------------------------------------------------------------

  /** Adds a new pane beside `paneId`, showing `fileId` (or an empty tab). */
  const splitPane = useCallback((paneId: string, edge: Edge, fileId: string | null = null) => {
    const s = stateRef.current;
    if (!s.panes[paneId]) return null;
    const pane = newPane([newLeaf(fileId)]);
    commit({
      layout: insertBeside(s.layout, paneId, { kind: 'pane', id: pane.id }, edge),
      panes: { ...s.panes, [pane.id]: pane },
      activePaneId: pane.id,
    });
    return pane.id;
  }, [commit]);

  const closePane = useCallback((paneId: string) => {
    const s = stateRef.current;
    const layout = removePane(s.layout, paneId);
    if (!layout) {
      // Closing the last pane just empties it.
      commit(singlePane({ ...s.panes[paneId], leaves: [], activeLeafId: null }));
      return;
    }
    const panes = { ...s.panes };
    delete panes[paneId];
    const remaining = paneIdsOf(layout);
    commit({ layout, panes, activePaneId: remaining.includes(s.activePaneId) ? s.activePaneId : remaining[0] });
  }, [commit]);

  // --- Tabs ---------------------------------------------------------------------

  const openFile = useCallback((fileId: string, mode: OpenMode = 'current', options: { allowDuplicate?: boolean } = {}) => {
    const s = stateRef.current;
    const pane = s.panes[s.activePaneId];
    if (!pane) return;
    if (mode === 'split-right' || mode === 'split-down') {
      splitPane(pane.id, mode === 'split-right' ? 'right' : 'bottom', fileId);
      return;
    }
    // Already open? Focus that tab (in whichever pane) instead of duplicating it.
    if (mode === 'current' && !options.allowDuplicate) {
      const here = pane.leaves.find(l => currentFileOf(l) === fileId);
      if (here) { updatePane(pane.id, p => ({ ...p, activeLeafId: here.id })); return; }
      for (const other of Object.values(s.panes)) {
        const leaf = other.leaves.find(l => currentFileOf(l) === fileId);
        if (leaf) { updatePane(other.id, p => ({ ...p, activeLeafId: leaf.id })); return; }
      }
    }
    const active = pane.leaves.find(l => l.id === pane.activeLeafId);
    if (mode === 'new-tab' || !active || active.pinned) {
      const leaf = newLeaf(fileId);
      const at = active ? pane.leaves.indexOf(active) + 1 : pane.leaves.length;
      updatePane(pane.id, p => ({ ...p, leaves: orderPinnedFirst([...p.leaves.slice(0, at), leaf, ...p.leaves.slice(at)]), activeLeafId: leaf.id }));
      return;
    }
    updatePane(pane.id, p => ({
      ...p,
      leaves: p.leaves.map(l => {
        if (l.id !== active.id) return l;
        const history = [...l.history.slice(0, l.index + 1), fileId].slice(-MAX_HISTORY);
        return { ...l, history, index: history.length - 1 };
      }),
    }));
  }, [splitPane, updatePane]);

  const setActiveLeaf = useCallback((paneId: string, leafId: string) => {
    updatePane(paneId, p => ({ ...p, activeLeafId: leafId }));
  }, [updatePane]);

  const newTab = useCallback((paneId?: string) => {
    const id = paneId || stateRef.current.activePaneId;
    const leaf = newLeaf(null);
    updatePane(id, p => {
      const at = p.leaves.findIndex(l => l.id === p.activeLeafId);
      return { ...p, leaves: orderPinnedFirst([...p.leaves.slice(0, at + 1), leaf, ...p.leaves.slice(at + 1)]), activeLeafId: leaf.id };
    });
  }, [updatePane]);

  const go = useCallback((delta: 1 | -1, paneId?: string) => {
    const id = paneId || stateRef.current.activePaneId;
    updatePane(id, p => ({
      ...p,
      leaves: p.leaves.map(l => {
        if (l.id !== p.activeLeafId) return l;
        const index = l.index + delta;
        return index >= 0 && index < l.history.length ? { ...l, index } : l;
      }),
    }));
  }, [updatePane]);

  /** Closes matching tabs; an emptied pane closes too when it isn't the only one. */
  const closeWhere = useCallback((paneId: string, shouldClose: (leaf: Leaf, i: number, all: Leaf[]) => boolean, focusId?: string) => {
    const s = stateRef.current;
    const pane = s.panes[paneId];
    if (!pane) return;
    const leaves = pane.leaves.filter((l, i) => !shouldClose(l, i, pane.leaves));
    if (leaves.length === 0 && paneIdsOf(s.layout).length > 1) {
      closePane(paneId);
      return;
    }
    let activeLeafId = focusId && leaves.some(l => l.id === focusId) ? focusId : pane.activeLeafId;
    if (!leaves.some(l => l.id === activeLeafId)) {
      // Prefer the neighbour that slides into the closed tab's slot.
      const oldIndex = pane.leaves.findIndex(l => l.id === pane.activeLeafId);
      activeLeafId = leaves[Math.min(Math.max(oldIndex, 0), leaves.length - 1)]?.id ?? null;
    }
    updatePane(paneId, p => ({ ...p, leaves, activeLeafId }));
  }, [closePane, updatePane]);

  const closeTab = useCallback((paneId: string, leafId: string) => closeWhere(paneId, l => l.id === leafId), [closeWhere]);
  const closeOthers = useCallback((paneId: string, leafId: string) => closeWhere(paneId, l => l.id !== leafId && !l.pinned, leafId), [closeWhere]);
  const closeToRight = useCallback((paneId: string, leafId: string) =>
    closeWhere(paneId, (l, i, all) => i > all.findIndex(x => x.id === leafId) && !l.pinned), [closeWhere]);
  const closeAll = useCallback((paneId: string) => closeWhere(paneId, l => !l.pinned), [closeWhere]);

  const togglePin = useCallback((paneId: string, leafId: string) => {
    updatePane(paneId, p => ({ ...p, leaves: orderPinnedFirst(p.leaves.map(l => (l.id === leafId ? { ...l, pinned: !l.pinned } : l))) }));
  }, [updatePane]);

  /**
   * Moves a tab within or across panes (drag and drop). `beforeLeafId` null =
   * append. An `edge` splits the target pane and drops the tab into the new one.
   */
  const moveLeaf = useCallback((fromPaneId: string, leafId: string, toPaneId: string, target: { beforeLeafId?: string | null; edge?: Edge }) => {
    const s = stateRef.current;
    const from = s.panes[fromPaneId];
    const leaf = from?.leaves.find(l => l.id === leafId);
    if (!from || !leaf || !s.panes[toPaneId]) return;
    if (target.edge) {
      // Splitting a pane with its own only tab would just move it — skip.
      if (fromPaneId === toPaneId && from.leaves.length === 1) return;
      const remaining = from.leaves.filter(l => l.id !== leafId);
      let next: WorkspaceState = { ...s, panes: { ...s.panes, [fromPaneId]: { ...from, leaves: remaining, activeLeafId: from.activeLeafId === leafId ? remaining[0]?.id ?? null : from.activeLeafId } } };
      const pane = newPane([leaf]);
      next = { layout: insertBeside(next.layout, toPaneId, { kind: 'pane', id: pane.id }, target.edge), panes: { ...next.panes, [pane.id]: pane }, activePaneId: pane.id };
      if (remaining.length === 0) {
        const layout = removePane(next.layout, fromPaneId)!;
        const panes = { ...next.panes };
        delete panes[fromPaneId];
        next = { ...next, layout, panes };
      }
      commit(next);
      return;
    }
    if (fromPaneId === toPaneId) {
      const without = from.leaves.filter(l => l.id !== leafId);
      const at = target.beforeLeafId ? without.findIndex(l => l.id === target.beforeLeafId) : without.length;
      without.splice(at < 0 ? without.length : at, 0, leaf);
      updatePane(fromPaneId, p => ({ ...p, leaves: orderPinnedFirst(without), activeLeafId: leafId }));
      return;
    }
    const to = s.panes[toPaneId];
    const remaining = from.leaves.filter(l => l.id !== leafId);
    const dest = [...to.leaves];
    const at = target.beforeLeafId ? dest.findIndex(l => l.id === target.beforeLeafId) : dest.length;
    dest.splice(at < 0 ? dest.length : at, 0, leaf);
    let next: WorkspaceState = {
      ...s,
      panes: {
        ...s.panes,
        [fromPaneId]: { ...from, leaves: remaining, activeLeafId: from.activeLeafId === leafId ? remaining[0]?.id ?? null : from.activeLeafId },
        [toPaneId]: { ...to, leaves: orderPinnedFirst(dest), activeLeafId: leafId },
      },
      activePaneId: toPaneId,
    };
    if (remaining.length === 0) {
      const layout = removePane(next.layout, fromPaneId)!;
      const panes = { ...next.panes };
      delete panes[fromPaneId];
      next = { ...next, layout, panes };
    }
    commit(next);
  }, [commit, updatePane]);

  /** Opens a file into a pane edge (dragged from the sidebar) or into the pane itself. */
  const openFileAt = useCallback((fileId: string, paneId: string, edge?: Edge) => {
    if (edge) {
      splitPane(paneId, edge, fileId);
      return;
    }
    focusPane(paneId);
    openFile(fileId, 'new-tab');
  }, [focusPane, openFile, splitPane]);

  /** Drop history entries for files that no longer exist (e.g. after a delete). */
  const pruneMissing = useCallback((exists: (fileId: string) => boolean) => {
    const s = stateRef.current;
    const all = Object.values(s.panes);
    if (all.every(p => p.leaves.every(l => l.history.every(exists)))) return;
    let next: WorkspaceState = { ...s, panes: { ...s.panes } };
    for (const pane of all) {
      if (pane.leaves.every(l => l.history.every(exists))) continue;
      const leaves: Leaf[] = [];
      for (const l of pane.leaves) {
        if (l.history.every(exists)) { leaves.push(l); continue; }
        const kept = l.history.filter(exists);
        // A tab whose every file vanished closes (explicit empty tabs never get here).
        if (kept.length === 0) continue;
        const before = l.history.slice(0, l.index + 1).filter(exists).length;
        leaves.push({ ...l, history: kept, index: Math.max(0, before - 1) });
      }
      const activeLeafId = leaves.some(l => l.id === pane.activeLeafId) ? pane.activeLeafId : leaves[0]?.id ?? null;
      next.panes[pane.id] = { ...pane, leaves, activeLeafId };
      if (leaves.length === 0 && paneIdsOf(next.layout).length > 1) {
        const layout = removePane(next.layout, pane.id)!;
        delete next.panes[pane.id];
        next = { ...next, layout, activePaneId: next.activePaneId === pane.id ? paneIdsOf(layout)[0] : next.activePaneId };
      }
    }
    commit(next);
  }, [commit]);

  /** The tab currently showing `fileId`, in any pane. */
  const findLeaf = useCallback((fileId: string): { paneId: string; leafId: string } | null => {
    for (const pane of Object.values(stateRef.current.panes)) {
      const leaf = pane.leaves.find(l => currentFileOf(l) === fileId);
      if (leaf) return { paneId: pane.id, leafId: leaf.id };
    }
    return null;
  }, []);

  const toPersisted = useCallback((): PersistedWorkspace => ({
    layout: state.layout,
    panes: Object.fromEntries(Object.values(state.panes).map(p => [p.id, {
      tabs: p.leaves.map(l => ({ fileId: currentFileOf(l), pinned: l.pinned })),
      activeIndex: p.leaves.findIndex(l => l.id === p.activeLeafId),
    }])),
    activePaneId: state.activePaneId,
  }), [state]);

  const goBack = useCallback((paneId?: string) => go(-1, paneId), [go]);
  const goForward = useCallback((paneId?: string) => go(1, paneId), [go]);

  return {
    layout: state.layout,
    panes: state.panes,
    paneIds,
    activePaneId: activePane?.id ?? state.activePaneId,
    activePane,
    activeLeaf,
    activeFileId,
    reset,
    resetTabs,
    focusPane,
    resize,
    splitPane,
    closePane,
    openFile,
    openFileAt,
    setActiveLeaf,
    newTab,
    goBack,
    goForward,
    closeTab,
    closeOthers,
    closeToRight,
    closeAll,
    togglePin,
    moveLeaf,
    findLeaf,
    pruneMissing,
    toPersisted,
  };
};

export type Workspace = ReturnType<typeof useWorkspace>;
