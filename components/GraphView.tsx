import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Search, Settings2 } from 'lucide-react';
import { ProjectFile } from '../types';
import { findOutgoingLinks, getRawContent } from '../utils/fileText';
import { extractTags } from '../utils/markdown';
import { SINGLE_INSTANCE_FILE_TYPES, getFileTypeMeta } from './fileTypes';
import Popover from './ui/Popover';
import { cn } from './ui';

interface GraphNode {
  id: string;
  label: string;
  kind: 'file' | 'tag' | 'system';
  fileType?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
  fixed?: boolean;
}

interface GraphSettings {
  showTags: boolean;
  showOrphans: boolean;
  showSystems: boolean;
  linkDistance: number;
  repel: number;
  depth: number;
}

const SETTINGS_KEY = 'devarchitect-graph-settings';
const DEFAULTS: GraphSettings = { showTags: false, showOrphans: true, showSystems: false, linkDistance: 80, repel: 1, depth: 1 };

const readSettings = (): GraphSettings => {
  try {
    return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
};

/** Deterministic start positions so the layout doesn't jump between renders. */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};

interface GraphViewProps {
  files: ProjectFile[];
  activeFileId: string | null;
  onOpenFile: (id: string) => void;
  onOpenTag?: (tag: string) => void;
  /** Local graph: only the neighbourhood of the active file. */
  local?: boolean;
  compact?: boolean;
}

/** Obsidian-style force-directed graph of how project files link to each other. */
const GraphView: React.FC<GraphViewProps> = ({ files, activeFileId, onOpenFile, onOpenTag, local = false, compact = false }) => {
  const [settings, setSettingsState] = useState<GraphSettings>(readSettings);
  const [filter, setFilter] = useState('');
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<Map<string, GraphNode>>(new Map());
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 });
  const alphaRef = useRef(1);
  // Redraw only while the layout settles or something changed (idle = no CPU).
  const dirtyRef = useRef(true);
  const hoverRef = useRef<string | null>(null);

  const setSettings = (patch: Partial<GraphSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch };
      try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* in-memory only */ }
      return next;
    });
    alphaRef.current = 1;
  };

  // --- Graph data ---------------------------------------------------------------

  const graph = useMemo(() => {
    const visibleFiles = files.filter(f => settings.showSystems || !SINGLE_INSTANCE_FILE_TYPES.has(f.type) || f.id === activeFileId);
    const ids = new Set(visibleFiles.map(f => f.id));
    const links: Array<[string, string]> = [];
    const seen = new Set<string>();
    const link = (a: string, b: string) => {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (a === b || seen.has(key)) return;
      seen.add(key);
      links.push([a, b]);
    };
    for (const file of visibleFiles) {
      for (const target of findOutgoingLinks(file, visibleFiles)) link(file.id, target.id);
      // Canvas file cards and Base file-link cells reference files by id.
      if (file.type === 'canvas' || file.type === 'base') {
        const raw = getRawContent(file);
        for (const other of visibleFiles) if (other.id !== file.id && raw.includes(`"${other.id}"`)) link(file.id, other.id);
      }
    }
    const nodes: Array<Pick<GraphNode, 'id' | 'label' | 'kind' | 'fileType'>> = visibleFiles.map(f => ({
      id: f.id, label: f.name, kind: SINGLE_INSTANCE_FILE_TYPES.has(f.type) ? 'system' : 'file', fileType: f.type,
    }));
    if (settings.showTags) {
      const tagIds = new Set<string>();
      for (const f of visibleFiles) {
        if (f.type !== 'doc' || typeof f.content !== 'string') continue;
        for (const tag of extractTags(f.content)) {
          const id = `#${tag}`;
          if (!tagIds.has(id)) { tagIds.add(id); nodes.push({ id, label: id, kind: 'tag' }); }
          link(f.id, id);
        }
      }
    }
    let keep = new Set(nodes.map(n => n.id));
    if (local && activeFileId && ids.has(activeFileId)) {
      keep = new Set([activeFileId]);
      for (let d = 0; d < settings.depth; d++) {
        for (const [a, b] of links) {
          if (keep.has(a)) keep.add(b);
          else if (keep.has(b)) keep.add(a);
        }
      }
    }
    const degree = new Map<string, number>();
    links.forEach(([a, b]) => { degree.set(a, (degree.get(a) || 0) + 1); degree.set(b, (degree.get(b) || 0) + 1); });
    const finalNodes = nodes.filter(n => keep.has(n.id) && (settings.showOrphans || local || (degree.get(n.id) || 0) > 0 || n.id === activeFileId));
    const finalIds = new Set(finalNodes.map(n => n.id));
    return {
      nodes: finalNodes.map(n => ({ ...n, degree: degree.get(n.id) || 0 })),
      links: links.filter(([a, b]) => finalIds.has(a) && finalIds.has(b)),
    };
  }, [files, settings.showTags, settings.showOrphans, settings.showSystems, settings.depth, local, activeFileId]);

  // Keep positions for nodes that survive a data change.
  useEffect(() => {
    const prev = nodesRef.current;
    const next = new Map<string, GraphNode>();
    const spread = Math.sqrt(graph.nodes.length + 1) * 40;
    for (const n of graph.nodes) {
      const old = prev.get(n.id);
      const angle = hash(n.id) * Math.PI * 2;
      const radius = spread * Math.sqrt(hash(`${n.id}r`));
      next.set(n.id, old ? { ...old, ...n } : { ...n, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 });
    }
    nodesRef.current = next;
    alphaRef.current = Math.max(alphaRef.current, prev.size === 0 ? 1 : 0.5);
    dirtyRef.current = true;
  }, [graph]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    graph.links.forEach(([a, b]) => {
      map.set(a, (map.get(a) || new Set()).add(b));
      map.set(b, (map.get(b) || new Set()).add(a));
    });
    return map;
  }, [graph.links]);

  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? new Set(graph.nodes.filter(n => n.label.toLowerCase().includes(q)).map(n => n.id)) : null;
  }, [filter, graph.nodes]);

  // --- Simulation + drawing ------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let frame = 0;
    let centered = false;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
      if (!centered) {
        viewRef.current = { x: wrap.clientWidth / 2, y: wrap.clientHeight / 2, zoom: local || compact ? 0.9 : 1 };
        centered = true;
      }
    };
    resize();
    dirtyRef.current = true;
    const observer = new ResizeObserver(() => { resize(); dirtyRef.current = true; });
    observer.observe(wrap);
    // Theme / accent changes recolour the graph.
    const themeObserver = new MutationObserver(() => { dirtyRef.current = true; });
    themeObserver.observe(document.documentElement, { attributes: true });

    const step = () => {
      const nodes = Array.from(nodesRef.current.values());
      const alpha = alphaRef.current;
      if (alpha <= 0.002 && !dirtyRef.current) {
        frame = requestAnimationFrame(step);
        return;
      }
      dirtyRef.current = false;
      if (alpha > 0.002) {
        const byId = nodesRef.current;
        const repel = 1800 * settings.repel;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 0.01) { dx = hash(a.id) - 0.5; dy = hash(b.id) - 0.5; d2 = 0.01; }
            if (d2 > 250000) continue;
            const f = (repel / d2) * alpha;
            const d = Math.sqrt(d2);
            a.vx += (dx / d) * f; a.vy += (dy / d) * f;
            b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
          }
        }
        for (const [ia, ib] of graph.links) {
          const a = byId.get(ia);
          const b = byId.get(ib);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = ((d - settings.linkDistance) / d) * 0.06 * alpha;
          a.vx += dx * f; a.vy += dy * f;
          b.vx -= dx * f; b.vy -= dy * f;
        }
        for (const n of nodes) {
          n.vx -= n.x * 0.004 * alpha; // gentle pull to the centre
          n.vy -= n.y * 0.004 * alpha;
          if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
          n.vx *= 0.82; n.vy *= 0.82;
          n.x += Math.max(-30, Math.min(30, n.vx));
          n.y += Math.max(-30, Math.min(30, n.vy));
        }
        alphaRef.current = alpha * 0.985;
      }

      // Draw
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const css = getComputedStyle(document.documentElement);
        const color = (name: string, a = 1) => `rgb(${css.getPropertyValue(name).trim()} / ${a})`;
        const dpr = window.devicePixelRatio || 1;
        const { x: vx, y: vy, zoom } = viewRef.current;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * vx, dpr * vy);
        const focus = hoverRef.current;
        const focusSet = focus ? new Set([focus, ...(neighbors.get(focus) || [])]) : null;
        const dim = (id: string) => (focusSet && !focusSet.has(id)) || (matches && !matches.has(id));

        ctx.lineWidth = 1 / zoom;
        for (const [ia, ib] of graph.links) {
          const a = nodesRef.current.get(ia);
          const b = nodesRef.current.get(ib);
          if (!a || !b) continue;
          const highlighted = focus && (ia === focus || ib === focus);
          ctx.strokeStyle = highlighted ? color('--color-accent', 0.8) : color('--color-faint', dim(ia) || dim(ib) ? 0.12 : 0.45);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        for (const n of nodesRef.current.values()) {
          const r = 4 + Math.min(8, Math.sqrt(n.degree) * 2);
          const active = n.id === activeFileId;
          const faded = dim(n.id);
          ctx.globalAlpha = faded ? 0.25 : 1;
          ctx.fillStyle = active || n.id === focus ? color('--color-accent')
            : n.kind === 'tag' ? color('--color-success')
            : n.kind === 'system' ? color('--color-warning')
            : n.fileType === 'doc' ? color('--color-muted') : color('--color-info');
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fill();
          if (zoom > 0.65 || n.id === focus || active || (matches && matches.has(n.id))) {
            ctx.font = `${active || n.id === focus ? 600 : 400} ${12 / Math.max(zoom, 0.75)}px Inter, sans-serif`;
            ctx.fillStyle = color('--color-content', faded ? 0.3 : 0.9);
            ctx.textAlign = 'center';
            ctx.fillText(n.label.length > 32 ? `${n.label.slice(0, 30)}…` : n.label, n.x, n.y + r + 13 / Math.max(zoom, 0.75));
          }
          ctx.globalAlpha = 1;
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, [graph, neighbors, matches, settings.linkDistance, settings.repel, activeFileId, local, compact]);

  // --- Interaction ----------------------------------------------------------------

  const dragRef = useRef<{ kind: 'node'; id: string; moved: boolean } | { kind: 'pan'; x: number; y: number; vx: number; vy: number } | null>(null);

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { x, y, zoom } = viewRef.current;
    return { x: (e.clientX - rect.left - x) / zoom, y: (e.clientY - rect.top - y) / zoom };
  };
  const nodeAt = (e: { clientX: number; clientY: number }) => {
    const p = toWorld(e);
    let best: GraphNode | null = null;
    let bestD = Infinity;
    for (const n of nodesRef.current.values()) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      const r = 6 + Math.min(8, Math.sqrt(n.degree) * 2);
      if (d <= r / Math.min(1, viewRef.current.zoom) && d < bestD) { best = n; bestD = d; }
    }
    return best;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const n = nodeAt(e);
    if (n) {
      n.fixed = true;
      dragRef.current = { kind: 'node', id: n.id, moved: false };
    } else {
      dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dirtyRef.current = true;
    if (!drag) {
      const n = nodeAt(e);
      if ((n?.id ?? null) !== hoverRef.current) {
        hoverRef.current = n?.id ?? null;
        setHover(n?.id ?? null);
      }
      return;
    }
    if (drag.kind === 'pan') {
      viewRef.current = { ...viewRef.current, x: drag.vx + e.clientX - drag.x, y: drag.vy + e.clientY - drag.y };
    } else {
      const n = nodesRef.current.get(drag.id);
      if (!n) return;
      const p = toWorld(e);
      n.x = p.x;
      n.y = p.y;
      drag.moved = true;
      alphaRef.current = Math.max(alphaRef.current, 0.3);
    }
  };
  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind !== 'node') return;
    const n = nodesRef.current.get(drag.id);
    if (n) n.fixed = false;
    if (!drag.moved && n) {
      if (n.kind === 'tag') onOpenTag?.(n.label.slice(1));
      else onOpenFile(n.id);
    }
  };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const zoom = Math.min(4, Math.max(0.15, v.zoom * Math.exp(-e.deltaY * 0.0015)));
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    viewRef.current = { zoom, x: mx - ((mx - v.x) / v.zoom) * zoom, y: my - ((my - v.y) / v.zoom) * zoom };
    dirtyRef.current = true;
  };

  const hovered = hover ? graph.nodes.find(n => n.id === hover) : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-bg">
      <canvas
        ref={canvasRef}
        className={cn('block touch-none', hover ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { hoverRef.current = null; setHover(null); dirtyRef.current = true; }}
        onWheel={onWheel}
        role="img"
        aria-label={`${local ? 'Local' : 'Project'} graph with ${graph.nodes.length} files and ${graph.links.length} links`}
      />
      <div className={cn('absolute left-2 top-2 flex items-center gap-1', compact && 'left-1 top-1')}>
        {!compact && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter files…" aria-label="Filter graph" className="h-7 w-44 rounded-md border border-border bg-surface-raised/90 pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-faint focus:border-accent" />
          </div>
        )}
        <button type="button" className="icon-btn bg-surface-raised/80" title="Graph settings" aria-label="Graph settings" onClick={e => setSettingsAnchor(settingsAnchor ? null : e.currentTarget)}>
          <Settings2 className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn bg-surface-raised/80" title="Re-run layout" aria-label="Re-run layout" onClick={() => {
          nodesRef.current.forEach(n => { const a = hash(n.id) * Math.PI * 2; n.x = Math.cos(a) * 60; n.y = Math.sin(a) * 60; });
          alphaRef.current = 1;
          const wrap = wrapRef.current;
          if (wrap) viewRef.current = { x: wrap.clientWidth / 2, y: wrap.clientHeight / 2, zoom: 1 };
          dirtyRef.current = true;
        }}>
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      {!compact && (
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-faint">
          {graph.nodes.length} nodes · {graph.links.length} links{hovered ? ` · ${hovered.kind === 'tag' ? 'Tag' : getFileTypeMeta(hovered.fileType || '').label}: ${hovered.label}` : ''}
        </div>
      )}
      {graph.nodes.length <= 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-[12px] text-faint">
          {local ? 'No links to or from this file yet.' : 'Link files with [[wikilinks]] to see connections.'}
        </div>
      )}
      <Popover anchor={settingsAnchor} onClose={() => setSettingsAnchor(null)} className="w-60">
        <div className="space-y-1.5 text-[12px] text-content">
          {([
            ['showTags', 'Show tags'],
            ['showOrphans', 'Show orphans'],
            ['showSystems', 'Show project systems'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-1 hover:bg-surface-hover">
              {label}
              <input type="checkbox" checked={settings[key]} onChange={e => setSettings({ [key]: e.target.checked })} className="md-checkbox" />
            </label>
          ))}
          {local && (
            <label className="block px-1 pt-1">
              <span className="flex justify-between text-muted">Depth <span>{settings.depth}</span></span>
              <input type="range" min={1} max={3} value={settings.depth} onChange={e => setSettings({ depth: Number(e.target.value) })} className="w-full accent-[rgb(var(--color-accent))]" />
            </label>
          )}
          <label className="block px-1">
            <span className="flex justify-between text-muted">Link distance <span>{settings.linkDistance}</span></span>
            <input type="range" min={30} max={250} value={settings.linkDistance} onChange={e => setSettings({ linkDistance: Number(e.target.value) })} className="w-full accent-[rgb(var(--color-accent))]" />
          </label>
          <label className="block px-1">
            <span className="flex justify-between text-muted">Repel force <span>{settings.repel.toFixed(1)}</span></span>
            <input type="range" min={0.2} max={3} step={0.1} value={settings.repel} onChange={e => setSettings({ repel: Number(e.target.value) })} className="w-full accent-[rgb(var(--color-accent))]" />
          </label>
        </div>
      </Popover>
    </div>
  );
};

export default GraphView;
