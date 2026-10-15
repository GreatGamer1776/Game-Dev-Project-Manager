import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MousePointer2, PenLine, Circle as CircleIcon, PaintBucket, Type, Hand, Undo2, Redo2, Download, Trash2, Grid3x3,
  Eye, Pencil, Maximize, Image as ImageIcon,
} from 'lucide-react';
import { EditorProps } from '../types';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { showMenu } from '../stores/useMenuStore';
import { promptDialog, toast } from '../stores/useUiStore';
import { uid } from '../utils/id';
import {
  VectorDoc, Vertex, VECTOR_COLORS, VECTOR_THICKNESSES, parseVector, addEdge, pruneFills, faceAt, toSvg,
} from '../utils/vectorModel';
import { cn } from './ui';

type Tool = 'select' | 'pen' | 'circle' | 'fill' | 'text' | 'pan';
type Selection = { vertices: Set<string>; edges: Set<string>; circles: Set<string>; texts: Set<string>; fills: Set<string> };

const emptySelection = (): Selection => ({ vertices: new Set(), edges: new Set(), circles: new Set(), texts: new Set(), fills: new Set() });
const selectionSize = (s: Selection) => s.vertices.size + s.edges.size + s.circles.size + s.texts.size + s.fills.size;

const TOOLS: { id: Tool; label: string; key: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'select', label: 'Select & move', key: 'V', icon: MousePointer2 },
  { id: 'pen', label: 'Draw edges (click vertices; Esc to finish)', key: 'P', icon: PenLine },
  { id: 'circle', label: 'Circle (drag from center)', key: 'C', icon: CircleIcon },
  { id: 'fill', label: 'Fill a closed region', key: 'F', icon: PaintBucket },
  { id: 'text', label: 'Text', key: 'T', icon: Type },
  { id: 'pan', label: 'Pan (or hold Space / middle mouse; Ctrl+wheel zooms)', key: 'H', icon: Hand },
];

const SAVE_DEBOUNCE_MS = 300;
const GRID = 10;

const distToSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Vertex/edge vector drawing that compiles straight to SVG. */
const VectorEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName }) => {
  const [doc, setDoc] = useState<VectorDoc>(() => parseVector(initialContent));
  const docRef = useRef(doc);
  const history = useUndoRedo<VectorDoc>(doc);
  const [tool, setTool] = useState<Tool>('pen');
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [stroke, setStroke] = useState({ color: VECTOR_COLORS[6], thickness: 2 });
  const [fillColor, setFillColor] = useState(VECTOR_COLORS[5]);
  const [snap, setSnap] = useState(true);
  const [viewMode, setViewMode] = useState(false);
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [penFrom, setPenFrom] = useState<string | null>(null);
  const penStartRef = useRef<string | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [circleDraft, setCircleDraft] = useState<{ cx: number; cy: number; r: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    | { kind: 'move'; start: { x: number; y: number }; origin: VectorDoc }
    | { kind: 'pan'; start: { x: number; y: number }; view: { x: number; y: number; zoom: number } }
    | { kind: 'marquee'; start: { x: number; y: number }; additive: boolean }
    | { kind: 'circle'; center: { x: number; y: number } }
    | null
  >(null);

  // --- Persistence & history ---------------------------------------------------

  const saveTimer = useRef<number | null>(null);
  const flush = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    onSave(docRef.current);
  }, [onSave]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => { if (saveTimer.current) flushRef.current(); }, []);

  const commit = (next: VectorDoc, record = true) => {
    const pruned = pruneFills(next);
    docRef.current = pruned;
    setDoc(pruned);
    if (record) history.pushState(pruned);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
  };
  const restore = (next: VectorDoc | undefined) => {
    if (!next) return;
    setSelection(emptySelection());
    commit(next, false);
  };

  // --- Geometry helpers ----------------------------------------------------------

  const toDoc = (e: { clientX: number; clientY: number }, snapIt = snap) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left - view.x) / view.zoom;
    const y = (e.clientY - rect.top - view.y) / view.zoom;
    return snapIt ? { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID } : { x, y };
  };
  const pos = useMemo(() => new Map(doc.vertices.map(v => [v.id, v])), [doc.vertices]);
  const hitRadius = 8 / view.zoom;

  const vertexAt = (p: { x: number; y: number }) =>
    doc.vertices.find(v => Math.hypot(v.x - p.x, v.y - p.y) <= hitRadius);
  const edgeAt = (p: { x: number; y: number }) =>
    doc.edges.find(e => distToSegment(p, pos.get(e.v1)!, pos.get(e.v2)!) <= Math.max(hitRadius * 0.75, e.thickness / 2));
  const circleAt = (p: { x: number; y: number }) =>
    [...doc.circles].reverse().find(c => {
      const d = Math.hypot(c.cx - p.x, c.cy - p.y);
      return Math.abs(d - c.r) <= hitRadius || (c.fill !== 'none' && d <= c.r);
    });
  const textAt = (p: { x: number; y: number }) =>
    [...doc.texts].reverse().find(t => p.x >= t.x && p.x <= t.x + t.text.length * t.size * 0.6 && p.y <= t.y && p.y >= t.y - t.size);
  const fillAt = (p: { x: number; y: number }) =>
    [...doc.fills].reverse().find(f => {
      const poly = f.boundary.map(id => pos.get(id)!);
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside;
      }
      return inside;
    });

  /** Vertex under the point, or a new one (splitting an edge if clicked on it). */
  const ensureVertex = (d: VectorDoc, p: { x: number; y: number }): { doc: VectorDoc; id: string } => {
    const hit = d.vertices.find(v => Math.hypot(v.x - p.x, v.y - p.y) <= hitRadius);
    if (hit) return { doc: d, id: hit.id };
    const v: Vertex = { id: uid(), x: p.x, y: p.y };
    let next: VectorDoc = { ...d, vertices: [...d.vertices, v] };
    const dpos = new Map(d.vertices.map(x => [x.id, x]));
    const split = d.edges.find(e => distToSegment(p, dpos.get(e.v1)!, dpos.get(e.v2)!) <= hitRadius * 0.75);
    if (split) {
      next = { ...next, edges: next.edges.filter(e => e.id !== split.id) };
      next = addEdge(next, split.v1, v.id, split.color, split.thickness);
      next = addEdge(next, v.id, split.v2, split.color, split.thickness);
      // A split changes boundaries; fills referencing the old edge get re-validated.
      next = { ...next, fills: next.fills.map(f => {
        const i = f.boundary.findIndex((id, k) => {
          const nextId = f.boundary[(k + 1) % f.boundary.length];
          return (id === split.v1 && nextId === split.v2) || (id === split.v2 && nextId === split.v1);
        });
        if (i < 0) return f;
        const boundary = [...f.boundary];
        boundary.splice(i + 1, 0, v.id);
        return { ...f, boundary };
      }) };
    }
    return { doc: next, id: v.id };
  };

  // --- Pointer handling ------------------------------------------------------------

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const raw = toDoc(e, false);
    const p = toDoc(e);
    if (e.button === 1 || tool === 'pan' || spaceDown) {
      dragRef.current = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, view };
      return;
    }
    if (e.button !== 0 || viewMode) return;

    if (tool === 'pen') {
      const { doc: withVertex, id } = ensureVertex(doc, vertexAt(raw) ? raw : p);
      let next = withVertex;
      if (penFrom && penFrom !== id) next = addEdge(next, penFrom, id, stroke.color, stroke.thickness);
      commit(next);
      if (!penFrom) penStartRef.current = id;
      // Clicking the chain's start closes the shape; clicking the last vertex again ends it.
      const finished = penFrom !== null && (id === penFrom || id === penStartRef.current);
      setPenFrom(finished ? null : id);
      return;
    }
    if (tool === 'circle') {
      dragRef.current = { kind: 'circle', center: p };
      setCircleDraft({ cx: p.x, cy: p.y, r: 0 });
      return;
    }
    if (tool === 'fill') {
      const existing = fillAt(raw);
      if (existing) {
        commit({ ...doc, fills: doc.fills.map(f => (f.id === existing.id ? { ...f, color: fillColor } : f)) });
        return;
      }
      const c = circleAt(raw);
      if (c) {
        commit({ ...doc, circles: doc.circles.map(x => (x.id === c.id ? { ...x, fill: fillColor } : x)) });
        return;
      }
      const face = faceAt(doc, raw);
      if (!face) {
        toast.info('Click inside a closed shape to fill it.');
        return;
      }
      commit({ ...doc, fills: [...doc.fills, { id: uid(), boundary: face, color: fillColor, opacity: 1 }] });
      return;
    }
    if (tool === 'text') {
      void promptDialog({ title: 'Add text', label: 'Text', confirmText: 'Add' }).then(text => {
        if (text) commit({ ...docRef.current, texts: [...docRef.current.texts, { id: uid(), x: p.x, y: p.y, text, size: 24, color: stroke.color }] });
      });
      return;
    }

    // Select tool: pick the top-most thing under the pointer.
    const additive = e.shiftKey;
    const v = vertexAt(raw);
    const t = v ? undefined : textAt(raw);
    const c = v || t ? undefined : circleAt(raw);
    const ed = v || t || c ? undefined : edgeAt(raw);
    const f = v || t || c || ed ? undefined : fillAt(raw);
    const hit = v ? { kind: 'vertices' as const, id: v.id } : t ? { kind: 'texts' as const, id: t.id } : c ? { kind: 'circles' as const, id: c.id }
      : ed ? { kind: 'edges' as const, id: ed.id } : f ? { kind: 'fills' as const, id: f.id } : null;
    if (!hit) {
      dragRef.current = { kind: 'marquee', start: raw, additive };
      setMarquee({ x1: raw.x, y1: raw.y, x2: raw.x, y2: raw.y });
      if (!additive) setSelection(emptySelection());
      return;
    }
    let next = selection;
    if (!selection[hit.kind].has(hit.id)) {
      next = additive ? { ...selection, [hit.kind]: new Set(selection[hit.kind]).add(hit.id) } : { ...emptySelection(), [hit.kind]: new Set([hit.id]) };
      setSelection(next);
    }
    dragRef.current = { kind: 'move', start: p, origin: doc };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toDoc(e);
    setCursor(p);
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') {
      setView({ ...drag.view, x: drag.view.x + e.clientX - drag.start.x, y: drag.view.y + e.clientY - drag.start.y });
    } else if (drag.kind === 'circle') {
      setCircleDraft({ cx: drag.center.x, cy: drag.center.y, r: Math.hypot(p.x - drag.center.x, p.y - drag.center.y) });
    } else if (drag.kind === 'marquee') {
      const raw = toDoc(e, false);
      setMarquee({ x1: drag.start.x, y1: drag.start.y, x2: raw.x, y2: raw.y });
    } else if (drag.kind === 'move') {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (dx === 0 && dy === 0) return;
      const o = drag.origin;
      // Moving an edge/fill moves its vertices.
      const moving = new Set(selection.vertices);
      o.edges.forEach(ed => { if (selection.edges.has(ed.id)) { moving.add(ed.v1); moving.add(ed.v2); } });
      o.fills.forEach(f => { if (selection.fills.has(f.id)) f.boundary.forEach(id => moving.add(id)); });
      const next: VectorDoc = {
        ...o,
        vertices: o.vertices.map(v => (moving.has(v.id) ? { ...v, x: v.x + dx, y: v.y + dy } : v)),
        circles: o.circles.map(c => (selection.circles.has(c.id) ? { ...c, cx: c.cx + dx, cy: c.cy + dy } : c)),
        texts: o.texts.map(t => (selection.texts.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t)),
      };
      docRef.current = next;
      setDoc(next);
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === 'circle' && circleDraft) {
      if (circleDraft.r >= 2) {
        commit({ ...doc, circles: [...doc.circles, { id: uid(), cx: circleDraft.cx, cy: circleDraft.cy, r: Math.round(circleDraft.r), color: stroke.color, thickness: stroke.thickness, fill: 'none' }] });
      }
      setCircleDraft(null);
    } else if (drag.kind === 'marquee' && marquee) {
      const [x1, x2] = [Math.min(marquee.x1, marquee.x2), Math.max(marquee.x1, marquee.x2)];
      const [y1, y2] = [Math.min(marquee.y1, marquee.y2), Math.max(marquee.y1, marquee.y2)];
      const inBox = (x: number, y: number) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
      const base = drag.additive ? selection : emptySelection();
      const vertices = new Set([...base.vertices, ...doc.vertices.filter(v => inBox(v.x, v.y)).map(v => v.id)]);
      setSelection({
        ...base,
        vertices,
        edges: new Set([...base.edges, ...doc.edges.filter(ed => vertices.has(ed.v1) && vertices.has(ed.v2)).map(ed => ed.id)]),
        circles: new Set([...base.circles, ...doc.circles.filter(c => inBox(c.cx, c.cy)).map(c => c.id)]),
        texts: new Set([...base.texts, ...doc.texts.filter(t => inBox(t.x, t.y)).map(t => t.id)]),
      });
      setMarquee(null);
    } else if (drag.kind === 'move' && docRef.current !== drag.origin) {
      commit(docRef.current);
    }
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd + wheel (and trackpad pinch) zooms around the cursor.
      const zoom = Math.min(8, Math.max(0.1, view.zoom * Math.exp(-e.deltaY * 0.0015)));
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView({ zoom, x: mx - ((mx - view.x) / view.zoom) * zoom, y: my - ((my - view.y) / view.zoom) * zoom });
    } else if (e.shiftKey) {
      setView(v => ({ ...v, x: v.x - e.deltaY - e.deltaX }));
    } else {
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  };

  // --- Actions -----------------------------------------------------------------

  const deleteSelection = () => {
    if (selectionSize(selection) === 0) return;
    const vertices = doc.vertices.filter(v => !selection.vertices.has(v.id));
    const keep = new Set(vertices.map(v => v.id));
    commit({
      ...doc,
      vertices,
      edges: doc.edges.filter(e => !selection.edges.has(e.id) && keep.has(e.v1) && keep.has(e.v2)),
      circles: doc.circles.filter(c => !selection.circles.has(c.id)),
      texts: doc.texts.filter(t => !selection.texts.has(t.id)),
      fills: doc.fills.filter(f => !selection.fills.has(f.id)),
    });
    setSelection(emptySelection());
  };

  /** Applies a style to whatever is selected (and makes it the default). */
  const applyStroke = (patch: Partial<{ color: string; thickness: number }>) => {
    setStroke(s => ({ ...s, ...patch }));
    if (selectionSize(selection) === 0) return;
    commit({
      ...doc,
      edges: doc.edges.map(e => (selection.edges.has(e.id) ? { ...e, ...patch } : e)),
      circles: doc.circles.map(c => (selection.circles.has(c.id) ? { ...c, ...patch } : c)),
      texts: doc.texts.map(t => (selection.texts.has(t.id) && patch.color ? { ...t, color: patch.color } : t)),
    });
  };
  const applyFill = (color: string) => {
    setFillColor(color);
    if (selection.fills.size === 0 && selection.circles.size === 0) return;
    commit({
      ...doc,
      fills: doc.fills.map(f => (selection.fills.has(f.id) ? { ...f, color } : f)),
      circles: doc.circles.map(c => (selection.circles.has(c.id) ? { ...c, fill: color } : c)),
    });
  };

  const download = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/[^\w.-]+/g, '_') || 'vector'}.${ext}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportSvg = () => download(new Blob([toSvg(doc)], { type: 'image/svg+xml' }), 'svg');
  const exportPng = () => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([toSvg(doc)], { type: 'image/svg+xml' }));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = doc.width * 2;
      canvas.height = doc.height * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob && download(blob, 'png'), 'image/png');
    };
    img.src = url;
  };

  const fitView = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const zoom = Math.min((rect.width - 80) / doc.width, (rect.height - 80) / doc.height, 4);
    setView({ zoom, x: (rect.width - doc.width * zoom) / 2, y: (rect.height - doc.height * zoom) / 2 });
  };
  useEffect(() => { fitView(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canvasMenu = (e: React.MouseEvent) => showMenu(e, [
    {
      label: `Canvas size (${doc.width}×${doc.height})…`, icon: Maximize, onSelect: async () => {
        const value = await promptDialog({ title: 'Canvas size', label: 'Width × height', defaultValue: `${doc.width}x${doc.height}`, confirmText: 'Resize' });
        const m = value && /^(\d+)\s*[x×*,]\s*(\d+)$/.exec(value.trim());
        if (m) commit({ ...doc, width: Math.max(16, Number(m[1])), height: Math.max(16, Number(m[2])) });
      },
    },
    { kind: 'heading', label: 'Background' },
    { label: 'Transparent', checked: doc.background === 'transparent', onSelect: () => commit({ ...doc, background: 'transparent' }) },
    ...['#ffffff', '#1e1e1e', '#f5efe6', '#0f172a'].map(bg => ({ label: bg, checked: doc.background === bg, onSelect: () => commit({ ...doc, background: bg }) })),
  ], 'below');

  // --- Keyboard -------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || document.querySelector('[role="dialog"]')) return;
      // Only while the editor (or nothing in particular) has focus — never steal
      // Space/letters from buttons and fields elsewhere in the app.
      if (target !== document.body && !rootRef.current?.contains(target)) return;
      if (e.code === 'Space' && target.tagName === 'BUTTON') return;
      if (e.type === 'keyup') {
        if (e.code === 'Space') setSpaceDown(false);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') { setSpaceDown(true); e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); restore(history.undo()); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); restore(history.redo()); return; }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelection({ vertices: new Set(doc.vertices.map(v => v.id)), edges: new Set(doc.edges.map(x => x.id)), circles: new Set(doc.circles.map(c => c.id)), texts: new Set(doc.texts.map(t => t.id)), fills: new Set(doc.fills.map(f => f.id)) });
        return;
      }
      if (e.key === 'Escape' || e.key === 'Enter') { setPenFrom(null); setSelection(emptySelection()); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
      if (mod || e.altKey) return;
      const t = TOOLS.find(x => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) { setTool(t.id); setPenFrom(null); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  });

  // --- Render ---------------------------------------------------------------------

  const guide = 'rgb(var(--color-accent))';
  const penPreview = tool === 'pen' && penFrom && cursor ? pos.get(penFrom) : undefined;
  const cursorClass = spaceDown || tool === 'pan' ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair';

  return (
    <div ref={rootRef} className="flex h-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/70 px-2 [scrollbar-width:none]">
        {TOOLS.map(t => (
          <button
            key={t.id}
            type="button"
            title={`${t.label} (${t.key})`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            onClick={() => { setTool(t.id); setPenFrom(null); }}
            disabled={viewMode && t.id !== 'pan' && t.id !== 'select'}
            className={cn('icon-btn', tool === t.id && '!bg-accent/15 !text-accent')}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-muted hover:bg-surface-hover" title="Stroke color" onClick={e => showMenu(e, VECTOR_COLORS.map(c => ({ label: c, checked: c === stroke.color, icon: dot(c), onSelect: () => applyStroke({ color: c }) })), 'below')}>
          <span className="h-4 w-4 rounded-full ring-1 ring-border-strong" style={{ backgroundColor: stroke.color }} /> Stroke
        </button>
        <button type="button" className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] text-muted hover:bg-surface-hover" title="Stroke thickness (0 = invisible guide)" onClick={e => showMenu(e, VECTOR_THICKNESSES.map(t => ({ label: t === 0 ? '0 — invisible' : `${t}px`, checked: t === stroke.thickness, onSelect: () => applyStroke({ thickness: t }) })), 'below')}>
          {stroke.thickness}px
        </button>
        <button type="button" className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-muted hover:bg-surface-hover" title="Fill color" onClick={e => showMenu(e, [
          ...VECTOR_COLORS.map(c => ({ label: c, checked: c === fillColor, icon: dot(c), onSelect: () => applyFill(c) })),
          { label: 'None (circles)', onSelect: () => applyFill('none') },
        ], 'below')}>
          <span className="h-4 w-4 rounded ring-1 ring-border-strong" style={{ backgroundColor: fillColor === 'none' ? 'transparent' : fillColor }} /> Fill
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" className={cn('icon-btn', snap && '!text-accent')} title={`Snap to grid (${snap ? 'on' : 'off'})`} aria-pressed={snap} onClick={() => setSnap(s => !s)}><Grid3x3 className="h-4 w-4" /></button>
        <button type="button" className="icon-btn" title="Delete selection (Del)" aria-label="Delete selection" disabled={selectionSize(selection) === 0} onClick={deleteSelection}><Trash2 className="h-4 w-4" /></button>
        <button type="button" className="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!history.canUndo} onClick={() => restore(history.undo())}><Undo2 className="h-4 w-4" /></button>
        <button type="button" className="icon-btn" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!history.canRedo} onClick={() => restore(history.redo())}><Redo2 className="h-4 w-4" /></button>
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          <button type="button" className="flex h-7 items-center rounded-md px-1.5 text-[12px] text-muted hover:bg-surface-hover" onClick={canvasMenu} title="Canvas size and background">
            {doc.width}×{doc.height}
          </button>
          <button type="button" className="icon-btn" title="Fit to view" aria-label="Fit to view" onClick={fitView}><Maximize className="h-4 w-4" /></button>
          <button type="button" className={cn('icon-btn', viewMode && '!text-accent')} title={viewMode ? 'Back to editing' : 'Preview as exported'} aria-pressed={viewMode} onClick={() => { setViewMode(v => !v); setSelection(emptySelection()); setPenFrom(null); }}>
            {viewMode ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button type="button" className="icon-btn" title="Export" aria-label="Export" onClick={e => showMenu(e, [
            { label: 'Export SVG', icon: Download, onSelect: exportSvg },
            { label: 'Export PNG (2×)', icon: ImageIcon, onSelect: exportPng },
          ], 'below')}><Download className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-chrome/50">
        <svg
          ref={svgRef}
          className={cn('h-full w-full touch-none select-none', cursorClass)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setCursor(null)}
          onWheel={onWheel}
          onDoubleClick={() => setPenFrom(null)}
          onContextMenu={e => { e.preventDefault(); setPenFrom(null); }}
        >
          <defs>
            <pattern id="vec-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgb(var(--color-border))" strokeWidth={0.5 / view.zoom} />
            </pattern>
            <pattern id="vec-checker" width="16" height="16" patternUnits="userSpaceOnUse">
              <rect width="16" height="16" fill="rgb(var(--color-surface))" />
              <rect width="8" height="8" fill="rgb(var(--color-surface-hover))" />
              <rect x="8" y="8" width="8" height="8" fill="rgb(var(--color-surface-hover))" />
            </pattern>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {/* Artboard */}
            <rect width={doc.width} height={doc.height} fill={doc.background === 'transparent' ? 'url(#vec-checker)' : doc.background} stroke="rgb(var(--color-border-strong))" strokeWidth={1 / view.zoom} />
            {!viewMode && snap && <rect width={doc.width} height={doc.height} fill="url(#vec-grid)" pointerEvents="none" />}
            {doc.fills.map(f => (
              <polygon
                key={f.id}
                points={f.boundary.map(id => { const v = pos.get(id)!; return `${v.x},${v.y}`; }).join(' ')}
                fill={f.color}
                fillOpacity={f.opacity}
                stroke={selection.fills.has(f.id) && !viewMode ? guide : 'none'}
                strokeWidth={2 / view.zoom}
                strokeDasharray={`${4 / view.zoom}`}
              />
            ))}
            {doc.edges.map(e => {
              const a = pos.get(e.v1)!;
              const b = pos.get(e.v2)!;
              const selected = selection.edges.has(e.id) && !viewMode;
              return (
                <g key={e.id}>
                  {selected && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={guide} strokeOpacity={0.4} strokeWidth={e.thickness + 6 / view.zoom} strokeLinecap="round" />}
                  {e.thickness > 0
                    ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.color} strokeWidth={e.thickness} strokeLinecap="round" />
                    : !viewMode && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(var(--color-faint))" strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom}`} />}
                </g>
              );
            })}
            {doc.circles.map(c => (
              <circle
                key={c.id}
                cx={c.cx}
                cy={c.cy}
                r={c.r}
                fill={c.fill}
                stroke={c.thickness > 0 ? c.color : !viewMode ? 'rgb(var(--color-faint))' : 'none'}
                strokeWidth={c.thickness > 0 ? c.thickness : 1 / view.zoom}
                strokeDasharray={c.thickness > 0 ? undefined : `${4 / view.zoom}`}
                {...(selection.circles.has(c.id) && !viewMode ? { filter: 'drop-shadow(0 0 2px rgb(138 108 239))' } : {})}
              />
            ))}
            {doc.texts.map(t => (
              <text
                key={t.id}
                x={t.x}
                y={t.y}
                fontFamily="Inter, sans-serif"
                fontSize={t.size}
                fill={t.color}
                textDecoration={selection.texts.has(t.id) && !viewMode ? 'underline' : undefined}
                onDoubleClick={() => {
                  if (viewMode) return;
                  void promptDialog({ title: 'Edit text', label: 'Text', defaultValue: t.text, confirmText: 'Save' }).then(text => {
                    if (text) commit({ ...docRef.current, texts: docRef.current.texts.map(x => (x.id === t.id ? { ...x, text } : x)) });
                  });
                }}
              >
                {t.text}
              </text>
            ))}
            {circleDraft && <circle cx={circleDraft.cx} cy={circleDraft.cy} r={circleDraft.r} fill="none" stroke={guide} strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom}`} />}
            {penPreview && cursor && <line x1={penPreview.x} y1={penPreview.y} x2={cursor.x} y2={cursor.y} stroke={stroke.color} strokeOpacity={0.6} strokeWidth={Math.max(stroke.thickness, 1 / view.zoom)} strokeDasharray={`${6 / view.zoom}`} />}
            {!viewMode && doc.vertices.map(v => {
              const selected = selection.vertices.has(v.id) || v.id === penFrom;
              return (
                <circle
                  key={v.id}
                  cx={v.x}
                  cy={v.y}
                  r={(selected ? 4.5 : 3.5) / view.zoom}
                  fill={selected ? guide : 'rgb(var(--color-bg))'}
                  stroke={guide}
                  strokeWidth={1.5 / view.zoom}
                />
              );
            })}
            {marquee && (
              <rect
                x={Math.min(marquee.x1, marquee.x2)}
                y={Math.min(marquee.y1, marquee.y2)}
                width={Math.abs(marquee.x2 - marquee.x1)}
                height={Math.abs(marquee.y2 - marquee.y1)}
                fill="rgb(var(--color-accent) / 0.1)"
                stroke={guide}
                strokeWidth={1 / view.zoom}
              />
            )}
          </g>
        </svg>
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-faint">
          {Math.round(view.zoom * 100)}%{cursor ? ` · ${Math.round(cursor.x)}, ${Math.round(cursor.y)}` : ''}
          {tool === 'pen' && !viewMode && ' · click to place vertices, click the start to close, Esc to finish'}
          {tool === 'fill' && !viewMode && ' · click inside a closed shape'}
        </div>
      </div>
    </div>
  );
};

const dot = (color: string): React.ComponentType<{ className?: string }> => {
  const Dot = ({ className }: { className?: string }) => <span className={cn('inline-block rounded-full ring-1 ring-border', className)} style={{ backgroundColor: color }} />;
  return Dot;
};

export default VectorEditor;
