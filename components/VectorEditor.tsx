import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MousePointer2, CircleDot, Slash, PenTool, Circle as CircleIcon, Type, PaintBucket, Pipette, Ruler, Hand,
  Undo2, Redo2, Download, Trash2, Magnet, Eye, Pencil, Maximize, Image as ImageIcon, PanelRight, ZoomIn, ZoomOut,
  AlignLeft, AlignCenter, AlignRight, Group, Ungroup, Unlink, Scissors, ArrowUp, ArrowDown, Copy, Merge, Ratio, Upload, ClipboardCopy, Link2,
} from 'lucide-react';
import { EditorProps } from '../types';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { showMenu, MenuEntry } from '../stores/useMenuStore';
import { toast } from '../stores/useUiStore';
import {
  VectorDoc, Stroke, VCircle, VText, TextAlign, TextValign, VectorClipboard, ItemIds,
  DEFAULT_STROKE, DEFAULT_CIRCLE_RADIUS, DEFAULT_FILL, DEFAULT_TEXT_STYLE, TEXT_BOX, REFERENCE_IMAGE_OPACITY,
  parseVector, addVertex, addEdge, edgeExists, moveVertices, subdivideEdge, bindVertexOntoEdge, severEdgeEndpoint,
  disconnectVertex, splitVertex, mergeVertexInto, mergeCoincidentVertices, deleteItems, groupVertices, ungroupVertices,
  groupOf, isExactlyOneGroup, addFillAt, addText, textCornerIds, resolveTextQuad, shiftLayers, canShiftLayers,
  copySelection, pasteClipboard, contrastColor, loopsToPathData, toSvg,
} from '../utils/vectorModel';
import {
  Pt, SpatialGrid, SnapLine, SnapResult, buildVertexAdjacency, computeMiterJoints,
  computeQuadWarpMatrix3d, dist, perpendicularParallelLines, resolveBoundaryPolygon, snapCandidate,
} from '../utils/vectorTopology';
import { cn } from './ui';
import Popover from './ui/Popover';
import { uid } from '../utils/id';
import { ColorField, SliderField } from './vector/ColorField';
import VectorInspector from './vector/VectorInspector';
import { Box, GUIDE_SPAN, MOVE_THRESHOLD, MeasurementLabel, boxOf, fmt, handleConfigsFor, lineRotationDeg, vertexAngles, ScaleHandle } from './vector/geometry';

type Tool = 'select' | 'vertex' | 'edge' | 'pen' | 'circle' | 'text' | 'fill' | 'eyedropper' | 'axis' | 'pan';

const TOOLS: { id: Tool; label: string; key: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'select', label: 'Select & move', key: 'V', icon: MousePointer2 },
  { id: 'pen', label: 'Pen — click to chain points into lines', key: 'L', icon: PenTool },
  { id: 'vertex', label: 'Point — place points; drag from one to branch', key: 'P', icon: CircleDot },
  { id: 'edge', label: 'Line — click two spots or points for a single line', key: 'E', icon: Slash },
  { id: 'circle', label: 'Circle', key: 'C', icon: CircleIcon },
  { id: 'text', label: 'Text box', key: 'T', icon: Type },
  { id: 'fill', label: 'Fill a closed shape', key: 'F', icon: PaintBucket },
  { id: 'eyedropper', label: 'Eyedropper — copy a style', key: 'I', icon: Pipette },
  { id: 'axis', label: 'Guide line — a snap line that is never exported', key: 'X', icon: Ruler },
  { id: 'pan', label: 'Pan (or hold Space, or drag with the middle mouse button)', key: 'H', icon: Hand },
];

/** One-line instructions shown at the bottom of the canvas for the current tool. */
const TOOL_HINTS: Record<Tool, string> = {
  select: 'Click to select · Shift-click to add · drag empty space to box-select · Alt-drag a point to tear a line off it',
  pen: 'Click to place points · click the first point to close the shape · Enter or Esc to finish',
  vertex: 'Click to place a point (on a line to split it) · drag from a point to draw a connected one',
  edge: 'Click where the line starts, then where it ends — existing points and lines snap',
  circle: 'Click to place a circle, or drag to size it',
  text: 'Click for a text box or drag to size it, then type',
  fill: 'Click inside a closed shape to fill it · click a filled area to recolor it',
  eyedropper: 'Click a line, fill, circle or text to copy its style',
  axis: 'Drag to draw a guide line that points snap to',
  pan: 'Drag to move around · Ctrl+scroll to zoom',
};

const SAVE_DEBOUNCE_MS = 300;
const GRID = 20;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const VERTEX_SNAP_PX = 12;
const EDGE_SNAP_PX = 9;
const ALIGN_SNAP_PX = 6;
const SEVER_THRESHOLD_PX = 24;
const DRAW_TOOLS = new Set<Tool>(['vertex', 'edge', 'pen', 'circle', 'text', 'fill', 'axis']);

interface SnapSettings { vertex: boolean; edge: boolean; align: boolean; guides: boolean; perpendicular: boolean; grid: boolean; crossLayer: boolean; merge: boolean; lockRatio: boolean }
const DEFAULT_SNAP: SnapSettings = { vertex: true, edge: true, align: true, guides: true, perpendicular: true, grid: false, crossLayer: true, merge: true, lockRatio: false };
const SNAP_KEY = 'vector-editor-snap';
const PANEL_KEY = 'vector-editor-panel';

const loadPref = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};
const savePref = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};

interface Selection { vertices: Set<string>; edges: Set<string>; circles: Set<string>; fills: Set<string>; axes: Set<string> }
const emptySelection = (): Selection => ({ vertices: new Set(), edges: new Set(), circles: new Set(), fills: new Set(), axes: new Set() });
const selectionSize = (s: Selection) => s.vertices.size + s.edges.size + s.circles.size + s.fills.size + s.axes.size;
const toggled = (set: Set<string>, ids: string[]) => {
  const next = new Set(set);
  const allIn = ids.every(id => next.has(id));
  ids.forEach(id => (allIn ? next.delete(id) : next.add(id)));
  return next;
};

type Drag =
  | { mode: 'pan'; client: Pt; view: { x: number; y: number; zoom: number } }
  | { mode: 'marquee'; start: Pt; additive: boolean; base: Selection }
  | { mode: 'place-vertex'; start: Pt; moved: boolean }
  | { mode: 'spawn'; from: string; start: Pt; moved: boolean }
  | { mode: 'move'; start: Pt; moved: boolean; vertexStart: Map<string, Pt>; circleStart: Map<string, Pt>; single: string | null; lines: SnapLine[] | null; collapseTo: Selection | null }
  | { mode: 'tearaway'; vertexId: string; start: Pt }
  | { mode: 'transform'; kind: 'scale'; anchor: Pt; axisLock: 'x' | 'y' | null; span: Pt; vertexStart: Map<string, Pt>; circleStart: Map<string, VCircle> }
  | { mode: 'transform'; kind: 'rotate'; center: Pt; start: Pt; vertexStart: Map<string, Pt>; circleStart: Map<string, VCircle> }
  | { mode: 'draw-circle'; center: Pt }
  | { mode: 'resize-circle'; id: string; center: Pt }
  | { mode: 'draw-text'; start: Pt }
  | { mode: 'draw-axis'; start: Pt }
  | { mode: 'move-axis'; id: string; start: Pt; orig: { x1: number; y1: number; x2: number; y2: number } }
  | { mode: 'resize-axis'; id: string; which: 1 | 2 }
  | { mode: 'move-image'; id: string; start: Pt; orig: Pt }
  | { mode: 'resize-image'; id: string; orig: { x: number; y: number; width: number; height: number } };

/** Vertex/edge vector drawing (modelled on store-app's .vec editor) that compiles straight to SVG. */
const VectorEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, assets = {}, onAddAsset, projectFiles = [] }) => {
  const [doc, setDoc] = useState<VectorDoc>(() => parseVector(initialContent));
  const docRef = useRef(doc);
  const history = useUndoRedo<VectorDoc>(doc);
  const [tool, setToolState] = useState<Tool>('pen');
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [localGroupId, setLocalGroupId] = useState<string | null>(null);
  const [stroke, setStroke] = useState<Stroke>(DEFAULT_STROKE);
  const [fillColor, setFillColor] = useState(DEFAULT_FILL);
  const [circleFill, setCircleFill] = useState('none');
  const [radius, setRadius] = useState(DEFAULT_CIRCLE_RADIUS);
  const [textStyle, setTextStyle] = useState(DEFAULT_TEXT_STYLE);
  const [snap, setSnapState] = useState<SnapSettings>(() => loadPref(SNAP_KEY, DEFAULT_SNAP));
  const [panelOpen, setPanelOpenState] = useState<boolean>(() => loadPref(PANEL_KEY, { open: false }).open);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const [pointer, setPointer] = useState<Pt | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapResult | null>(null);
  const [edgeFirst, setEdgeFirst] = useState<string | null>(null);
  const [chain, setChain] = useState<string[]>([]);
  const [liveVertices, setLiveVertices] = useState<Map<string, Pt> | null>(null);
  const [liveCircles, setLiveCircles] = useState<Map<string, Partial<VCircle>> | null>(null);
  const [readout, setReadout] = useState<{ at: Pt; lines: string[] } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [circleDraft, setCircleDraft] = useState<{ cx: number; cy: number; r: number } | null>(null);
  const [textDraft, setTextDraft] = useState<{ a: Pt; b: Pt } | null>(null);
  const [axisDraft, setAxisDraft] = useState<{ id?: string; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [imageDraft, setImageDraft] = useState<{ id: string; x?: number; y?: number; width?: number; height?: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; buffer: string } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [snapAnchor, setSnapAnchor] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const clipboardRef = useRef<VectorClipboard | null>(null);
  const pasteCountRef = useRef(0);
  const lastClickRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  const setSnap = (patch: Partial<SnapSettings>) => setSnapState(s => { const next = { ...s, ...patch }; savePref(SNAP_KEY, next); return next; });
  const setPanelOpen = (open: boolean) => { setPanelOpenState(open); savePref(PANEL_KEY, { open }); };

  // --- Persistence & history ---------------------------------------------------------

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
    if (next === docRef.current) return;
    docRef.current = next;
    setDoc(next);
    if (record) history.pushState(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
  };
  const restore = (next: VectorDoc | undefined) => {
    if (!next) return;
    setSelection(emptySelection());
    setChain([]);
    setEdgeFirst(null);
    commit(next, false);
  };

  const setTool = (t: Tool) => {
    setToolState(t);
    setChain([]);
    setEdgeFirst(null);
    setSnapPreview(null);
  };
  const clearSelection = () => {
    setSelection(emptySelection());
    setSelectedImageId(null);
  };

  // --- Derived geometry ---------------------------------------------------------------

  const layer = doc.layers.find(l => l.id === activeLayerId) || doc.layers[doc.layers.length - 1];
  const layerById = useMemo(() => new Map(doc.layers.map(l => [l.id, l])), [doc.layers]);
  const isEditableLayer = (layerId: string) => { const l = layerById.get(layerId); return !!l && l.visible && !l.locked; };

  const vertices = useMemo(
    () => (liveVertices ? doc.vertices.map(v => (liveVertices.has(v.id) ? { ...v, ...liveVertices.get(v.id)! } : v)) : doc.vertices),
    [doc.vertices, liveVertices],
  );
  const vmap = useMemo(() => new Map(vertices.map(v => [v.id, v])), [vertices]);
  const circles = useMemo(
    () => (liveCircles ? doc.circles.map(c => (liveCircles.has(c.id) ? { ...c, ...liveCircles.get(c.id)! } : c)) : doc.circles),
    [doc.circles, liveCircles],
  );
  const axes = useMemo(() => (axisDraft?.id ? doc.snapAxes.map(a => (a.id === axisDraft.id ? { ...a, ...axisDraft, id: a.id } : a)) : doc.snapAxes), [doc.snapAxes, axisDraft]);
  const adjacency = useMemo(() => buildVertexAdjacency(doc.vertices, doc.edges).adj, [doc.vertices, doc.edges]);

  /** Which layers each vertex belongs to (through its lines and text boxes). */
  const vertexLayers = useMemo(() => {
    const owners = new Map<string, Set<string>>();
    const add = (id: string, layerId: string) => { if (!owners.has(id)) owners.set(id, new Set()); owners.get(id)!.add(layerId); };
    for (const e of doc.edges) { add(e.v1, e.layerId); add(e.v2, e.layerId); }
    for (const t of doc.texts) textCornerIds(t).forEach(id => add(id, t.layerId));
    return owners;
  }, [doc.edges, doc.texts]);
  const vertexVisible = (id: string) => { const o = vertexLayers.get(id); return !o || [...o].some(l => layerById.get(l)?.visible); };
  const vertexEditable = (id: string) => { const o = vertexLayers.get(id); return !o || [...o].some(isEditableLayer); };

  // Snapping only considers what you can see — and, optionally, only the active layer.
  const snapEdges = useMemo(
    () => doc.edges.filter(e => layerById.get(e.layerId)?.visible && (snap.crossLayer || e.layerId === layer.id)),
    [doc.edges, layerById, snap.crossLayer, layer.id],
  );
  const snapVertices = useMemo(() => {
    const onSnapEdge = new Set(snapEdges.flatMap(e => [e.v1, e.v2]));
    return doc.vertices.filter(v => onSnapEdge.has(v.id) || !vertexLayers.has(v.id));
  }, [doc.vertices, snapEdges, vertexLayers]);
  const grid = useMemo(() => { const g = new SpatialGrid(); g.rebuild(snapVertices); return g; }, [snapVertices]);
  const guideLines = useMemo<SnapLine[] | null>(
    () => (snap.guides && doc.snapAxes.length ? doc.snapAxes.map(a => ({ p1: { x: a.x1, y: a.y1 }, p2: { x: a.x2, y: a.y2 } })) : null),
    [snap.guides, doc.snapAxes],
  );

  const snapAt = (raw: Pt, opts: { exclude?: string | null; lines?: SnapLine[] | null; noEdge?: boolean } = {}) =>
    snapCandidate(snapVertices, snapEdges, raw, {
      grid,
      vertexPx: snap.vertex ? VERTEX_SNAP_PX / view.zoom : -1,
      edgePx: snap.edge && !opts.noEdge ? EDGE_SNAP_PX / view.zoom : -1,
      axisPx: snap.align ? ALIGN_SNAP_PX / view.zoom : -1,
      linePx: ALIGN_SNAP_PX / view.zoom,
      lines: [...(opts.lines || []), ...(guideLines || [])],
      excludeVertexId: opts.exclude,
      gridStep: snap.grid ? GRID : 0,
    });

  /** Existing vertex under `raw`, a split point on an edge, or a new vertex. */
  const placeVertex = (d: VectorDoc, raw: Pt, opts: { exclude?: string | null; lines?: SnapLine[] | null } = {}) => {
    const s = snapAt(raw, opts);
    if (s.snappedVertexId) return { doc: d, id: s.snappedVertexId };
    if (s.snappedEdgeId) {
      const res = subdivideEdge(d, s.snappedEdgeId, s.point);
      if (res.id) return { doc: res.doc, id: res.id };
    }
    return addVertex(d, s.point);
  };

  // --- Selection-derived values ----------------------------------------------------------

  const fillVertexIds = (fillId: string) => {
    const f = doc.fills.find(x => x.id === fillId);
    if (!f) return [];
    return [f.boundary.outer, ...f.boundary.holes].flat().flatMap(c => (c.type === 'vertex' ? [c.id] : []));
  };
  const transformVertexIds = useMemo(() => {
    const ids = new Set(selection.vertices);
    for (const e of doc.edges) if (selection.edges.has(e.id)) { ids.add(e.v1); ids.add(e.v2); }
    for (const id of selection.fills) fillVertexIds(id).forEach(v => ids.add(v));
    return ids;
  }, [selection, doc.edges, doc.fills]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedTexts = doc.texts.filter(t => textCornerIds(t).every(id => selection.vertices.has(id)));
  const selectedTextIds = new Set(selectedTexts.map(t => t.id));
  const edgesInSelection = selection.vertices.size > 1 ? doc.edges.filter(e => selection.vertices.has(e.v1) && selection.vertices.has(e.v2)) : [];
  const strokeTargets = new Set([...selection.edges, ...edgesInSelection.map(e => e.id)]);
  const fillTargets = new Set([...selection.fills, ...doc.fills.filter(f => f.boundary.outer.every(c => c.type === 'vertex' && selection.vertices.has(c.id))).map(f => f.id)]);
  const layerTargets: ItemIds = { edgeIds: strokeTargets, circleIds: selection.circles, textIds: selectedTextIds, fillIds: fillTargets };
  const hasLayerTargets = strokeTargets.size + selection.circles.size + selectedTextIds.size + fillTargets.size > 0;
  const singleVertex = selection.vertices.size === 1 && selection.edges.size === 0 && selection.circles.size === 0 ? [...selection.vertices][0] : null;
  const singleDegree = singleVertex ? (adjacency.get(singleVertex) || []).length : 0;
  const twoVertices = selection.vertices.size === 2 && selection.edges.size === 0 && selection.circles.size === 0 ? [...selection.vertices] : null;
  const canGroup = selection.vertices.size > 1 && !isExactlyOneGroup(doc, selection.vertices) && selectedTextIds.size === 0;
  const canUngroup = isExactlyOneGroup(doc, selection.vertices);

  const transformCount = transformVertexIds.size + selection.circles.size;
  const selectionBox: Box | null = useMemo(() => {
    if (viewMode || tool !== 'select' || transformCount < 2) return null;
    const pts: Pt[] = [...transformVertexIds].map(id => vmap.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    for (const c of circles) if (selection.circles.has(c.id)) pts.push({ x: c.cx - c.r, y: c.cy - c.r }, { x: c.cx + c.r, y: c.cy + c.r });
    return boxOf(pts);
  }, [viewMode, tool, transformCount, transformVertexIds, vmap, circles, selection.circles]);

  // --- Coordinates & viewport ------------------------------------------------------------

  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left - view.x) / view.zoom, y: (e.clientY - rect.top - view.y) / view.zoom };
  };
  const toScreen = (p: Pt) => ({ x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y });

  const zoomBy = useCallback((factor: number, at?: { clientX: number; clientY: number }) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    setView(v => {
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * factor));
      const cx = at ? at.clientX - rect.left : rect.width / 2;
      const cy = at ? at.clientY - rect.top : rect.height / 2;
      return { zoom, x: cx - ((cx - v.x) / v.zoom) * zoom, y: cy - ((cy - v.y) / v.zoom) * zoom };
    });
  }, []);

  const contentBox = (d: VectorDoc): Box | null =>
    boxOf([
      ...d.vertices,
      ...d.circles.flatMap(c => [{ x: c.cx - c.r, y: c.cy - c.r }, { x: c.cx + c.r, y: c.cy + c.r }]),
    ]);

  const fitView = useCallback((includeContent = true) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const d = docRef.current;
    const art: Box = { minX: 0, minY: 0, maxX: d.canvas.width, maxY: d.canvas.height };
    const c = includeContent ? contentBox(d) : null;
    const b = c ? { minX: Math.min(art.minX, c.minX), minY: Math.min(art.minY, c.minY), maxX: Math.max(art.maxX, c.maxX), maxY: Math.max(art.maxY, c.maxY) } : art;
    const pad = 48;
    const zoom = Math.min(4, Math.max(ZOOM_MIN, Math.min((rect.width - pad * 2) / Math.max(1, b.maxX - b.minX), (rect.height - pad * 2) / Math.max(1, b.maxY - b.minY))));
    setView({ zoom, x: rect.width / 2 - ((b.minX + b.maxX) / 2) * zoom, y: rect.height / 2 - ((b.minY + b.maxY) / 2) * zoom });
  }, []);
  useEffect(() => {
    const raf = requestAnimationFrame(() => fitView());
    return () => cancelAnimationFrame(raf);
  }, [fitView]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.0025), e);
      else if (e.shiftKey && !e.deltaX) setView(v => ({ ...v, x: v.x - e.deltaY }));
      else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  /** Detects a second press on the same thing (pointer capture swallows native dblclick). */
  const isDoubleClick = (key: string) => {
    const now = Date.now();
    const hit = lastClickRef.current.key === key && now - lastClickRef.current.at < 350;
    lastClickRef.current = { key, at: hit ? 0 : now };
    return hit;
  };

  // --- Pointer: starting gestures ----------------------------------------------------------

  const capture = (e: React.PointerEvent) => {
    surfaceRef.current?.focus({ preventScroll: true });
    surfaceRef.current?.setPointerCapture(e.pointerId);
  };
  const beginPan = (e: React.PointerEvent) => {
    capture(e);
    dragRef.current = { mode: 'pan', client: { x: e.clientX, y: e.clientY }, view };
    setPanning(true);
  };
  const wantsPan = (e: React.PointerEvent) => e.button === 1 || spaceDown || tool === 'pan' || (viewMode && e.button === 0);

  const requireDrawableLayer = () => {
    if (!layer.visible || layer.locked) {
      toast.info(`“${layer.name}” is ${layer.locked ? 'locked' : 'hidden'} — pick another layer in the Inspector.`);
      setPanelOpen(true);
      return false;
    }
    return true;
  };

  /** Starts a move of the given vertices/circles (the current selection, usually). */
  const beginMove = (world: Pt, vertexIds: Set<string>, circleIds: Set<string>, collapseTo: Selection | null) => {
    const vertexStart = new Map([...vertexIds].map(id => [id, vmap.get(id)!]).filter(([, p]) => p) as [string, Pt][]);
    const circleStart = new Map(circles.filter(c => circleIds.has(c.id)).map(c => [c.id, { x: c.cx, y: c.cy }]));
    const single = vertexStart.size === 1 && circleStart.size === 0 ? [...vertexStart.keys()][0] : null;
    let lines: SnapLine[] | null = null;
    if (single) {
      // Guide lines from the point's own neighbors: straighten A–V–C, extend each line, square to other lines.
      const v0 = vmap.get(single)!;
      const incident = doc.edges.filter(e => e.v1 === single || e.v2 === single);
      const others = incident.map(e => vmap.get(e.v1 === single ? e.v2 : e.v1)).filter((p): p is NonNullable<typeof p> => !!p);
      lines = others.map(p => ({ p1: p, p2: v0 }));
      if (others.length === 2) lines.push({ p1: others[0], p2: others[1] });
      if (snap.perpendicular && others.length === 1) {
        const refs = doc.edges.filter(e => !incident.includes(e)).map(e => ({ p1: vmap.get(e.v1)!, p2: vmap.get(e.v2)! })).filter(l => l.p1 && l.p2);
        lines.push(...perpendicularParallelLines(others[0], refs));
      }
      if (!snap.align) lines = null;
    }
    dragRef.current = { mode: 'move', start: world, moved: false, vertexStart, circleStart, single, lines, collapseTo };
  };

  const onCanvasDown = (e: React.PointerEvent) => {
    if (editing) return;
    if (wantsPan(e)) { beginPan(e); return; }
    if (e.button !== 0) return;
    capture(e);
    const world = toWorld(e);
    if (DRAW_TOOLS.has(tool) && !requireDrawableLayer()) return;

    switch (tool) {
      case 'vertex':
        dragRef.current = { mode: 'place-vertex', start: world, moved: false };
        return;
      case 'edge': {
        const placed = placeVertex(doc, world, { exclude: null });
        if (edgeFirst && edgeFirst !== placed.id) {
          const res = addEdge(placed.doc, edgeFirst, placed.id, stroke, layer.id);
          commit(res.doc);
          setEdgeFirst(null);
        } else {
          commit(placed.doc);
          setEdgeFirst(placed.id);
        }
        return;
      }
      case 'pen': {
        const last = chain[chain.length - 1];
        const placed = placeVertex(doc, world, { lines: last && snap.perpendicular ? penLines(last) : null });
        const closing = chain.includes(placed.id);
        const next = last && last !== placed.id ? addEdge(placed.doc, last, placed.id, stroke, layer.id).doc : placed.doc;
        commit(next);
        setChain(closing ? [] : [...chain, placed.id]);
        return;
      }
      case 'circle': {
        const center = snapAt(world, { noEdge: true }).point;
        dragRef.current = { mode: 'draw-circle', center };
        setCircleDraft({ cx: center.x, cy: center.y, r: 0 });
        return;
      }
      case 'text':
        dragRef.current = { mode: 'draw-text', start: world };
        setTextDraft({ a: world, b: world });
        return;
      case 'axis': {
        const start = snapAt(world, { noEdge: true }).point;
        dragRef.current = { mode: 'draw-axis', start };
        setAxisDraft({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });
        return;
      }
      case 'fill': {
        const res = addFillAt(doc, world, fillColor, layer.id);
        if (res.ok) commit(res.doc);
        else toast.info(`Nothing closed here on “${layer.name}”. Draw a closed shape on this layer first, then fill inside it.`);
        return;
      }
      case 'eyedropper':
        return;
      default: {
        // Select: empty space starts a box selection.
        const base = e.shiftKey ? selection : emptySelection();
        if (!e.shiftKey) clearSelection();
        setLocalGroupId(null);
        dragRef.current = { mode: 'marquee', start: world, additive: e.shiftKey, base };
        setMarquee({ a: world, b: world });
      }
    }
  };

  /** Lines through the pen's last point, parallel/perpendicular to existing lines. */
  const penLines = (lastId: string): SnapLine[] => {
    const from = vmap.get(lastId);
    if (!from) return [];
    return perpendicularParallelLines(from, snapEdges.map(e => ({ p1: vmap.get(e.v1)!, p2: vmap.get(e.v2)! })).filter(l => l.p1 && l.p2));
  };

  /** Selects a vertex (whole group unless editing inside it) and readies a move. */
  const pressVertex = (e: React.PointerEvent, vertexId: string, world: Pt) => {
    const group = groupOf(doc, vertexId);
    const ids = group && group.id !== localGroupId ? group.vertexIds : [vertexId];
    if (e.shiftKey) {
      setSelection(s => ({ ...s, vertices: toggled(s.vertices, ids), fills: new Set(), axes: new Set() }));
      return;
    }
    if (selection.vertices.has(vertexId) || transformVertexIds.has(vertexId)) {
      // Dragging part of the selection moves all of it; a plain click narrows to this point.
      const collapse = { ...emptySelection(), vertices: new Set(ids) };
      beginMove(world, transformVertexIds, selection.circles, transformCount > ids.length ? collapse : null);
      return;
    }
    const next = { ...emptySelection(), vertices: new Set(ids) };
    setSelection(next);
    setSelectedImageId(null);
    beginMove(world, next.vertices, new Set(), null);
  };

  const onVertexDown = (e: React.PointerEvent, vertexId: string) => {
    if (viewMode || editing) return;
    if (!vertexEditable(vertexId)) return;
    if (['fill', 'circle', 'text', 'axis'].includes(tool)) return; // let the canvas handle it
    if (wantsPan(e)) { e.stopPropagation(); beginPan(e); return; }
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    const world = toWorld(e);
    if (tool === 'eyedropper') return;
    if (DRAW_TOOLS.has(tool) && !requireDrawableLayer()) return;

    if (tool === 'vertex') {
      dragRef.current = { mode: 'spawn', from: vertexId, start: world, moved: false };
      return;
    }
    if (tool === 'edge') {
      if (edgeFirst && edgeFirst !== vertexId) {
        const res = addEdge(doc, edgeFirst, vertexId, stroke, layer.id);
        if (res.ok) commit(res.doc);
        else toast.info('Those points are already joined.');
        setEdgeFirst(null);
      } else {
        setEdgeFirst(vertexId);
      }
      return;
    }
    if (tool === 'pen') {
      const last = chain[chain.length - 1];
      if (last && last !== vertexId) {
        const res = addEdge(doc, last, vertexId, stroke, layer.id);
        if (res.ok) commit(res.doc);
      }
      setChain(chain.includes(vertexId) ? [] : [...chain, vertexId]);
      return;
    }
    // Select tool.
    if (isDoubleClick(`v:${vertexId}`)) {
      const group = groupOf(doc, vertexId);
      if (group) {
        setLocalGroupId(group.id);
        setSelection({ ...emptySelection(), vertices: new Set([vertexId]) });
        toast.info('Editing inside the group — click empty space to leave.');
        return;
      }
    }
    if (e.altKey && (adjacency.get(vertexId) || []).length) {
      dragRef.current = { mode: 'tearaway', vertexId, start: world };
      return;
    }
    pressVertex(e, vertexId, world);
  };

  const onEdgeDown = (e: React.PointerEvent, edgeId: string) => {
    if (viewMode || editing) return;
    const edge = doc.edges.find(x => x.id === edgeId);
    if (!edge || !isEditableLayer(edge.layerId)) return;
    // Drawing tools snap onto (and split) lines themselves via the canvas handler.
    if (tool !== 'select' && tool !== 'eyedropper') return;
    if (wantsPan(e)) { e.stopPropagation(); beginPan(e); return; }
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    const world = toWorld(e);
    if (tool === 'eyedropper') {
      setStroke({ ...edge.style });
      toast.info(`Picked line style: ${edge.style.thickness}px.`);
      return;
    }
    // Select tool: select the line; dragging moves it.
    if (e.shiftKey) {
      setSelection(s => ({ ...s, edges: toggled(s.edges, [edgeId]), fills: new Set(), axes: new Set() }));
      return;
    }
    if (selection.edges.has(edgeId) || (transformVertexIds.has(edge.v1) && transformVertexIds.has(edge.v2))) {
      beginMove(world, transformVertexIds, selection.circles, transformCount > 2 ? { ...emptySelection(), edges: new Set([edgeId]) } : null);
      return;
    }
    setSelection({ ...emptySelection(), edges: new Set([edgeId]) });
    setSelectedImageId(null);
    beginMove(world, new Set([edge.v1, edge.v2]), new Set(), null);
  };

  const onFillDown = (e: React.PointerEvent, fillId: string) => {
    if (viewMode || editing) return;
    const fill = doc.fills.find(f => f.id === fillId);
    if (!fill || !isEditableLayer(fill.layerId)) return;
    if (tool === 'eyedropper') {
      e.stopPropagation();
      setFillColor(fill.color);
      toast.info('Picked fill color.');
      return;
    }
    if (tool !== 'select' || spaceDown || e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    if (e.shiftKey) {
      setSelection(s => ({ ...s, fills: toggled(s.fills, [fillId]) }));
      return;
    }
    const world = toWorld(e);
    if (selection.fills.has(fillId)) {
      beginMove(world, transformVertexIds, selection.circles, null);
      return;
    }
    const next = { ...emptySelection(), fills: new Set([fillId]) };
    setSelection(next);
    setSelectedImageId(null);
    beginMove(world, new Set(fillVertexIds(fillId)), new Set(), null);
  };

  const onCircleDown = (e: React.PointerEvent, circle: VCircle) => {
    if (viewMode || editing || !isEditableLayer(circle.layerId)) return;
    if (tool === 'eyedropper') {
      e.stopPropagation();
      setStroke({ ...circle.style });
      setCircleFill(circle.fill);
      setRadius(Math.round(circle.r));
      toast.info('Picked circle style.');
      return;
    }
    if (tool === 'fill') {
      e.stopPropagation();
      commit({ ...doc, circles: doc.circles.map(c => (c.id === circle.id ? { ...c, fill: fillColor } : c)) });
      return;
    }
    if (tool !== 'select' || spaceDown || e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    if (e.shiftKey) {
      setSelection(s => ({ ...s, circles: toggled(s.circles, [circle.id]), fills: new Set(), axes: new Set() }));
      return;
    }
    const world = toWorld(e);
    if (selection.circles.has(circle.id)) {
      beginMove(world, transformVertexIds, selection.circles, transformCount > 1 ? { ...emptySelection(), circles: new Set([circle.id]) } : null);
      return;
    }
    setSelection({ ...emptySelection(), circles: new Set([circle.id]) });
    setSelectedImageId(null);
    beginMove(world, new Set(), new Set([circle.id]), null);
  };

  const onTextDown = (e: React.PointerEvent, text: VText) => {
    if (viewMode || editing || !isEditableLayer(text.layerId)) return;
    if (tool === 'eyedropper') {
      e.stopPropagation();
      setTextStyle({ color: text.color, fontSize: text.fontSize, align: text.align, valign: text.valign });
      toast.info('Picked text style.');
      return;
    }
    if (tool !== 'select' || spaceDown || e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    if (isDoubleClick(`t:${text.id}`)) {
      setEditing({ id: text.id, buffer: text.content });
      return;
    }
    const corners = textCornerIds(text);
    if (e.shiftKey) {
      setSelection(s => ({ ...s, vertices: toggled(s.vertices, corners) }));
      return;
    }
    const world = toWorld(e);
    if (corners.every(id => selection.vertices.has(id))) {
      beginMove(world, transformVertexIds, selection.circles, null);
      return;
    }
    setSelection({ ...emptySelection(), vertices: new Set(corners) });
    setSelectedImageId(null);
    beginMove(world, new Set(corners), new Set(), null);
  };

  const onAxisDown = (e: React.PointerEvent, axisId: string, which?: 1 | 2) => {
    if (viewMode || tool !== 'select' || spaceDown || e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    const axis = doc.snapAxes.find(a => a.id === axisId);
    if (!axis) return;
    if (which) {
      dragRef.current = { mode: 'resize-axis', id: axisId, which };
      return;
    }
    setSelection(s => (e.shiftKey ? { ...s, axes: toggled(s.axes, [axisId]) } : { ...emptySelection(), axes: new Set([axisId]) }));
    dragRef.current = { mode: 'move-axis', id: axisId, start: toWorld(e), orig: { x1: axis.x1, y1: axis.y1, x2: axis.x2, y2: axis.y2 } };
  };

  const onImageDown = (e: React.PointerEvent, imageId: string, resize = false) => {
    if (viewMode || tool !== 'select' || spaceDown || e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    const img = doc.referenceImages.find(r => r.id === imageId);
    if (!img) return;
    setSelection(emptySelection());
    setSelectedImageId(imageId);
    dragRef.current = resize
      ? { mode: 'resize-image', id: imageId, orig: { x: img.x, y: img.y, width: img.width, height: img.height } }
      : { mode: 'move-image', id: imageId, start: toWorld(e), orig: { x: img.x, y: img.y } };
  };

  const onCircleResizeDown = (e: React.PointerEvent, circle: VCircle) => {
    e.stopPropagation();
    capture(e);
    dragRef.current = { mode: 'resize-circle', id: circle.id, center: { x: circle.cx, y: circle.cy } };
  };

  const startTransform = (e: React.PointerEvent, kind: 'scale' | 'rotate', handle?: ScaleHandle) => {
    e.stopPropagation();
    capture(e);
    const world = toWorld(e);
    const vertexStart = new Map([...transformVertexIds].map(id => [id, vmap.get(id)!]).filter(([, p]) => p) as [string, Pt][]);
    const circleStart = new Map(circles.filter(c => selection.circles.has(c.id)).map(c => [c.id, c]));
    if (kind === 'scale' && handle) {
      dragRef.current = { mode: 'transform', kind, anchor: handle.anchor, axisLock: handle.axisLock, span: { x: world.x - handle.anchor.x, y: world.y - handle.anchor.y }, vertexStart, circleStart };
    } else if (selectionBox) {
      const center = { x: (selectionBox.minX + selectionBox.maxX) / 2, y: (selectionBox.minY + selectionBox.maxY) / 2 };
      dragRef.current = { mode: 'transform', kind: 'rotate', center, start: world, vertexStart, circleStart };
    }
  };

  // --- Pointer: during and after gestures ------------------------------------------------

  const transformFor = (drag: Extract<Drag, { mode: 'transform' }>, world: Pt, shift: boolean) => {
    const vmapNext = new Map<string, Pt>();
    const cmapNext = new Map<string, Partial<VCircle>>();
    let lines: string[];
    if (drag.kind === 'scale') {
      let sx = drag.span.x === 0 ? 1 : (world.x - drag.anchor.x) / drag.span.x;
      let sy = drag.span.y === 0 ? 1 : (world.y - drag.anchor.y) / drag.span.y;
      if (drag.axisLock === 'x') sy = 1;
      if (drag.axisLock === 'y') sx = 1;
      if (!drag.axisLock && snap.lockRatio !== shift) {
        const m = (Math.abs(sx) + Math.abs(sy)) / 2;
        sx = m * Math.sign(sx || 1);
        sy = m * Math.sign(sy || 1);
      }
      for (const [id, p] of drag.vertexStart) vmapNext.set(id, { x: drag.anchor.x + (p.x - drag.anchor.x) * sx, y: drag.anchor.y + (p.y - drag.anchor.y) * sy });
      const rf = Math.sqrt(Math.abs(sx * sy));
      for (const [id, c] of drag.circleStart) cmapNext.set(id, { cx: drag.anchor.x + (c.cx - drag.anchor.x) * sx, cy: drag.anchor.y + (c.cy - drag.anchor.y) * sy, r: Math.max(0.5, c.r * rf) });
      lines = [`${Math.round(sx * 100)}% × ${Math.round(sy * 100)}%`];
    } else {
      let da = Math.atan2(world.y - drag.center.y, world.x - drag.center.x) - Math.atan2(drag.start.y - drag.center.y, drag.start.x - drag.center.x);
      if (shift) da = Math.round(da / (Math.PI / 12)) * (Math.PI / 12);
      const cos = Math.cos(da), sin = Math.sin(da);
      const rot = (p: Pt) => ({ x: drag.center.x + (p.x - drag.center.x) * cos - (p.y - drag.center.y) * sin, y: drag.center.y + (p.x - drag.center.x) * sin + (p.y - drag.center.y) * cos });
      for (const [id, p] of drag.vertexStart) vmapNext.set(id, rot(p));
      for (const [id, c] of drag.circleStart) { const p = rot({ x: c.cx, y: c.cy }); cmapNext.set(id, { cx: p.x, cy: p.y }); }
      lines = [`${fmt((da * 180) / Math.PI)}°`];
    }
    return { vmapNext, cmapNext, lines };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = toWorld(e);
    setPointer(world);
    const drag = dragRef.current;
    if (!drag) {
      if (!viewMode && (tool === 'pen' || tool === 'vertex' || (tool === 'edge' && edgeFirst))) {
        const last = chain[chain.length - 1];
        setSnapPreview(snapAt(world, { lines: tool === 'pen' && last && snap.perpendicular ? penLines(last) : null }));
      } else if (snapPreview) setSnapPreview(null);
      return;
    }
    const threshold = MOVE_THRESHOLD / view.zoom;
    switch (drag.mode) {
      case 'pan':
        setView({ ...drag.view, x: drag.view.x + e.clientX - drag.client.x, y: drag.view.y + e.clientY - drag.client.y });
        return;
      case 'marquee':
        setMarquee({ a: drag.start, b: world });
        return;
      case 'place-vertex':
        if (dist(drag.start, world) > threshold) drag.moved = true;
        setSnapPreview(snapAt(world));
        return;
      case 'spawn':
        if (dist(drag.start, world) > threshold) drag.moved = true;
        setSnapPreview(snapAt(world, { exclude: drag.from }));
        return;
      case 'move': {
        if (!drag.moved && dist(drag.start, world) <= threshold) return;
        drag.moved = true;
        if (drag.single) {
          const s = snapAt(world, { exclude: drag.single, lines: drag.lines });
          setSnapPreview(s);
          setLiveVertices(new Map([[drag.single, s.point]]));
          return;
        }
        let dx = world.x - drag.start.x, dy = world.y - drag.start.y;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (snap.grid) { dx = Math.round(dx / GRID) * GRID; dy = Math.round(dy / GRID) * GRID; }
        setLiveVertices(new Map([...drag.vertexStart].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }])));
        setLiveCircles(new Map([...drag.circleStart].map(([id, p]) => [id, { cx: p.x + dx, cy: p.y + dy }])));
        setReadout({ at: world, lines: [`Δx ${fmt(dx)}`, `Δy ${fmt(dy)}`] });
        return;
      }
      case 'tearaway': {
        if (dist(drag.start, world) <= SEVER_THRESHOLD_PX / view.zoom) return;
        const origin = vmap.get(drag.vertexId)!;
        const angle = Math.atan2(world.y - drag.start.y, world.x - drag.start.x);
        let best: { edgeId: string } | null = null;
        let bestDiff = Infinity;
        for (const he of adjacency.get(drag.vertexId) || []) {
          const o = vmap.get(he.to)!;
          let diff = Math.abs(Math.atan2(o.y - origin.y, o.x - origin.x) - angle);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          if (diff < bestDiff) { bestDiff = diff; best = he; }
        }
        if (!best) return;
        const res = severEdgeEndpoint(doc, best.edgeId, drag.vertexId, world);
        commit(res.doc);
        setSelection({ ...emptySelection(), vertices: new Set([res.id]) });
        dragRef.current = { mode: 'move', start: world, moved: true, vertexStart: new Map([[res.id, world]]), circleStart: new Map(), single: res.id, lines: null, collapseTo: null };
        return;
      }
      case 'transform': {
        const { vmapNext, cmapNext, lines } = transformFor(drag, world, e.shiftKey);
        setLiveVertices(vmapNext);
        setLiveCircles(cmapNext);
        setReadout({ at: world, lines });
        return;
      }
      case 'draw-circle': {
        setCircleDraft({ cx: drag.center.x, cy: drag.center.y, r: dist(drag.center, world) });
        return;
      }
      case 'resize-circle':
        setLiveCircles(new Map([[drag.id, { r: Math.max(0.5, dist(drag.center, world)) }]]));
        return;
      case 'draw-text':
        setTextDraft({ a: drag.start, b: world });
        return;
      case 'draw-axis': {
        let end = snapAt(world, { noEdge: true }).point;
        if (e.shiftKey) end = Math.abs(end.x - drag.start.x) > Math.abs(end.y - drag.start.y) ? { x: end.x, y: drag.start.y } : { x: drag.start.x, y: end.y };
        setAxisDraft({ x1: drag.start.x, y1: drag.start.y, x2: end.x, y2: end.y });
        return;
      }
      case 'move-axis': {
        const dx = world.x - drag.start.x, dy = world.y - drag.start.y;
        setAxisDraft({ id: drag.id, x1: drag.orig.x1 + dx, y1: drag.orig.y1 + dy, x2: drag.orig.x2 + dx, y2: drag.orig.y2 + dy });
        return;
      }
      case 'resize-axis': {
        const a = doc.snapAxes.find(x => x.id === drag.id);
        if (a) setAxisDraft({ ...a, ...(drag.which === 1 ? { x1: world.x, y1: world.y } : { x2: world.x, y2: world.y }) });
        return;
      }
      case 'move-image':
        setImageDraft({ id: drag.id, x: drag.orig.x + world.x - drag.start.x, y: drag.orig.y + world.y - drag.start.y });
        return;
      case 'resize-image': {
        let width = Math.max(8, world.x - drag.orig.x), height = Math.max(8, world.y - drag.orig.y);
        if (snap.lockRatio !== e.shiftKey) {
          const ratio = drag.orig.width / drag.orig.height;
          if (Math.abs(width - drag.orig.width) >= Math.abs(height - drag.orig.height)) height = width / ratio;
          else width = height * ratio;
        }
        setImageDraft({ id: drag.id, width, height });
      }
    }
  };

  const endLive = () => {
    setLiveVertices(null);
    setLiveCircles(null);
    setReadout(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    setSnapPreview(null);
    if (!drag) return;
    const world = toWorld(e);
    switch (drag.mode) {
      case 'marquee': {
        setMarquee(null);
        const [x0, x1] = [Math.min(drag.start.x, world.x), Math.max(drag.start.x, world.x)];
        const [y0, y1] = [Math.min(drag.start.y, world.y), Math.max(drag.start.y, world.y)];
        if (x1 - x0 < 1 && y1 - y0 < 1) return;
        const inBox = (p: Pt) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
        const hitVertices = doc.vertices.filter(v => inBox(v) && vertexVisible(v.id) && vertexEditable(v.id)).map(v => v.id);
        const hitCircles = doc.circles.filter(c => isEditableLayer(c.layerId) && inBox({ x: c.cx - c.r, y: c.cy - c.r }) && inBox({ x: c.cx + c.r, y: c.cy + c.r })).map(c => c.id);
        setSelection({ ...drag.base, vertices: new Set([...drag.base.vertices, ...hitVertices]), circles: new Set([...drag.base.circles, ...hitCircles]) });
        return;
      }
      case 'place-vertex':
        if (!drag.moved) commit(placeVertex(doc, world).doc);
        return;
      case 'spawn': {
        if (!drag.moved) return;
        const placed = placeVertex(doc, world, { exclude: drag.from });
        commit(addEdge(placed.doc, drag.from, placed.id, stroke, layer.id).doc);
        return;
      }
      case 'move': {
        if (!drag.moved) {
          endLive();
          if (drag.collapseTo) setSelection(drag.collapseTo);
          return;
        }
        let next = doc;
        if (drag.single) {
          const s = snapAt(world, { exclude: drag.single, lines: drag.lines });
          next = moveVertices(next, new Map([[drag.single, s.point]]));
          if (s.snappedEdgeId) next = bindVertexOntoEdge(next, s.snappedEdgeId, drag.single);
          if (snap.merge) next = mergeCoincidentVertices(next, [drag.single]);
        } else {
          if (liveVertices) next = moveVertices(next, liveVertices);
          if (liveCircles) next = { ...next, circles: next.circles.map(c => (liveCircles.has(c.id) ? { ...c, ...liveCircles.get(c.id)! } : c)) };
          if (snap.merge && liveVertices) next = mergeCoincidentVertices(next, liveVertices.keys());
        }
        endLive();
        commit(next);
        return;
      }
      case 'transform': {
        let next = doc;
        if (liveVertices) next = moveVertices(next, liveVertices);
        if (liveCircles) next = { ...next, circles: next.circles.map(c => (liveCircles.has(c.id) ? { ...c, ...liveCircles.get(c.id)! } : c)) };
        endLive();
        commit(next);
        return;
      }
      case 'draw-circle': {
        setCircleDraft(null);
        const r = dist(drag.center, world);
        const dragged = r > MOVE_THRESHOLD / view.zoom;
        const circle: VCircle = { id: uid(), cx: drag.center.x, cy: drag.center.y, r: dragged ? r : radius, style: { ...stroke }, fill: circleFill, layerId: layer.id };
        commit({ ...doc, circles: [...doc.circles, circle] });
        if (dragged) setRadius(Math.round(r));
        return;
      }
      case 'resize-circle': {
        const r = Math.max(0.5, dist(drag.center, world));
        endLive();
        commit({ ...doc, circles: doc.circles.map(c => (c.id === drag.id ? { ...c, r } : c)) });
        setRadius(Math.round(r));
        return;
      }
      case 'draw-text': {
        setTextDraft(null);
        const dragged = dist(drag.start, world) > MOVE_THRESHOLD / view.zoom;
        const end = dragged ? world : { x: drag.start.x + TEXT_BOX.width, y: drag.start.y + TEXT_BOX.height };
        const l = Math.min(drag.start.x, end.x), r = Math.max(drag.start.x, end.x), t = Math.min(drag.start.y, end.y), b = Math.max(drag.start.y, end.y);
        const res = addText(doc, [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }], textStyle, layer.id);
        commit(res.doc);
        setEditing({ id: res.id, buffer: '' });
        setToolState('select');
        return;
      }
      case 'draw-axis': {
        const draft = axisDraft;
        setAxisDraft(null);
        if (!draft || Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) <= MOVE_THRESHOLD / view.zoom) return;
        const id = uid();
        commit({ ...doc, snapAxes: [...doc.snapAxes, { id, x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2 }] });
        setSelection({ ...emptySelection(), axes: new Set([id]) });
        setToolState('select');
        return;
      }
      case 'move-axis':
      case 'resize-axis': {
        const draft = axisDraft;
        setAxisDraft(null);
        if (draft?.id) commit({ ...doc, snapAxes: doc.snapAxes.map(a => (a.id === draft.id ? { id: a.id, x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2 } : a)) });
        return;
      }
      case 'move-image':
      case 'resize-image': {
        const draft = imageDraft;
        setImageDraft(null);
        if (draft) commit({ ...doc, referenceImages: doc.referenceImages.map(r => (r.id === draft.id ? { ...r, ...draft, id: r.id } : r)) });
      }
    }
  };

  // --- Actions -----------------------------------------------------------------------

  const deleteSelection = () => {
    if (selectedImageId) {
      commit({ ...doc, referenceImages: doc.referenceImages.filter(r => r.id !== selectedImageId) });
      setSelectedImageId(null);
      return;
    }
    if (selectionSize(selection) === 0) return;
    commit(deleteItems(doc, { vertexIds: selection.vertices, edgeIds: selection.edges, circleIds: selection.circles, fillIds: selection.fills, axisIds: selection.axes }));
    setSelection(emptySelection());
  };

  const applyStroke = (patch: Partial<Stroke>) => {
    setStroke(s => ({ ...s, ...patch }));
    if (!strokeTargets.size && !selection.circles.size) return;
    commit({
      ...doc,
      edges: doc.edges.map(e => (strokeTargets.has(e.id) ? { ...e, style: { ...e.style, ...patch } } : e)),
      circles: doc.circles.map(c => (selection.circles.has(c.id) ? { ...c, style: { ...c.style, ...patch } } : c)),
    });
  };
  const applyFillColor = (color: string) => {
    setFillColor(color === 'none' ? DEFAULT_FILL : color);
    if (!fillTargets.size) return;
    commit(color === 'none'
      ? deleteItems(doc, { fillIds: fillTargets })
      : { ...doc, fills: doc.fills.map(f => (fillTargets.has(f.id) ? { ...f, color } : f)) });
  };
  const applyCircle = (patch: { fill?: string; r?: number }) => {
    if (patch.fill !== undefined) setCircleFill(patch.fill);
    if (patch.r !== undefined) setRadius(patch.r);
    if (selection.circles.size) commit({ ...doc, circles: doc.circles.map(c => (selection.circles.has(c.id) ? { ...c, ...patch } : c)) });
  };
  const applyText = (patch: Partial<typeof DEFAULT_TEXT_STYLE>) => {
    setTextStyle(s => ({ ...s, ...patch }));
    if (selectedTextIds.size) commit({ ...doc, texts: doc.texts.map(t => (selectedTextIds.has(t.id) ? { ...t, ...patch } : t)) });
  };

  const commitTextEdit = () => {
    if (!editing) return;
    const { id, buffer } = editing;
    setEditing(null);
    const d = docRef.current;
    // An empty box is just a stray click — remove it rather than leaving an invisible text.
    if (!buffer.trim()) commit(deleteItems(d, { textIds: new Set([id]) }));
    else commit({ ...d, texts: d.texts.map(t => (t.id === id ? { ...t, content: buffer } : t)) });
  };

  const copy = () => {
    if (!selection.vertices.size && !selection.circles.size && !transformVertexIds.size) return false;
    clipboardRef.current = copySelection(doc, transformVertexIds, selection.circles);
    pasteCountRef.current = 0;
    return true;
  };
  const paste = () => {
    const clip = clipboardRef.current;
    if (!clip || !requireDrawableLayer()) return;
    pasteCountRef.current += 1;
    const shift = 20 * pasteCountRef.current;
    const res = pasteClipboard(doc, clip, { x: shift, y: shift }, layer.id);
    commit(res.doc);
    setSelection({ ...emptySelection(), vertices: new Set(res.vertexIds), circles: new Set(res.circleIds) });
    setToolState('select');
  };
  const duplicate = () => { if (copy()) paste(); };

  const nudge = (dx: number, dy: number) => {
    const moves = new Map([...transformVertexIds].map(id => { const v = vmap.get(id)!; return [id, { x: v.x + dx, y: v.y + dy }] as [string, Pt]; }));
    let next = moveVertices(doc, moves);
    if (selection.circles.size) next = { ...next, circles: next.circles.map(c => (selection.circles.has(c.id) ? { ...c, cx: c.cx + dx, cy: c.cy + dy } : c)) };
    if (selection.axes.size) next = { ...next, snapAxes: next.snapAxes.map(a => (selection.axes.has(a.id) ? { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy } : a)) };
    commit(next);
  };

  const selectAll = () => {
    const editableEdges = doc.edges.filter(e => isEditableLayer(e.layerId));
    setSelection({
      ...emptySelection(),
      vertices: new Set(doc.vertices.filter(v => vertexVisible(v.id) && vertexEditable(v.id)).map(v => v.id)),
      edges: new Set(editableEdges.map(e => e.id)),
      circles: new Set(doc.circles.filter(c => isEditableLayer(c.layerId)).map(c => c.id)),
    });
    setToolState('select');
  };

  const fileStem = () => fileName.replace(/[^\w.-]+/g, '_') || 'vector';
  const download = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileStem()}.${ext}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportSvg = () => download(new Blob([toSvg(doc)], { type: 'image/svg+xml' }), 'svg');
  const exportPng = (scale: number) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([toSvg(doc, { rasterSafe: true })], { type: 'image/svg+xml' }));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = doc.canvas.width * scale;
      canvas.height = doc.canvas.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob && download(blob, 'png'), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast.error('PNG export failed.'); };
    img.src = url;
  };
  const copySvg = async () => {
    try {
      await navigator.clipboard.writeText(toSvg(doc));
      toast.success('SVG markup copied.');
    } catch {
      toast.error('Couldn’t reach the clipboard.');
    }
  };

  const fitArtboard = () => {
    const b = contentBox(doc);
    if (!b) { toast.info('Draw something first.'); return; }
    const pad = 16;
    const dx = pad - b.minX, dy = pad - b.minY;
    const moved = moveVertices(doc, new Map(doc.vertices.map(v => [v.id, { x: v.x + dx, y: v.y + dy }])));
    commit({
      ...moved,
      circles: moved.circles.map(c => ({ ...c, cx: c.cx + dx, cy: c.cy + dy })),
      snapAxes: moved.snapAxes.map(a => ({ ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy })),
      referenceImages: moved.referenceImages.map(r => ({ ...r, x: r.x + dx, y: r.y + dy })),
      canvas: { ...moved.canvas, width: Math.ceil(b.maxX - b.minX + pad * 2), height: Math.ceil(b.maxY - b.minY + pad * 2) },
    });
    requestAnimationFrame(() => fitView(false));
  };

  // Tracing images come from the project's asset library (or a fresh upload into it).
  const imageAssets = useMemo(() => {
    const names: Record<string, string> = {};
    for (const f of projectFiles) {
      const map = (f.type === 'asset-gallery' && f.content && typeof f.content === 'object' && (f.content as { assetNameMap?: Record<string, string> }).assetNameMap) || {};
      Object.assign(names, map);
    }
    return Object.entries(assets)
      .filter(([, url]) => typeof url === 'string' && (url.startsWith('data:image') || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)))
      .map(([id]) => ({ id, name: names[id] || id }));
  }, [assets, projectFiles]);
  const uploadRef = useRef<HTMLInputElement>(null);
  const placeImage = (assetId: string, name: string) => {
    const url = assets[assetId];
    const finish = (w: number, h: number) => {
      const d = docRef.current;
      const scale = Math.min(1, (d.canvas.width * 0.8) / w, (d.canvas.height * 0.8) / h);
      const width = Math.round(w * scale), height = Math.round(h * scale);
      const id = uid();
      commit({ ...d, referenceImages: [...d.referenceImages, { id, assetId, name, x: Math.round((d.canvas.width - width) / 2), y: Math.round((d.canvas.height - height) / 2), width, height }] });
      setSelection(emptySelection());
      setSelectedImageId(id);
      setToolState('select');
    };
    if (!url) { finish(400, 300); return; }
    const img = new Image();
    img.onload = () => finish(img.naturalWidth || 400, img.naturalHeight || 300);
    img.onerror = () => finish(400, 300);
    img.src = url;
  };
  const addImageMenu = (e: React.MouseEvent) => showMenu(e, [
    { label: 'Upload image…', icon: Upload, disabled: !onAddAsset, onSelect: () => uploadRef.current?.click() },
    ...(imageAssets.length ? [{ kind: 'heading', label: 'From asset library' } as MenuEntry] : []),
    ...imageAssets.slice(0, 30).map(a => ({ label: a.name, icon: ImageIcon, onSelect: () => placeImage(a.id, a.name) })),
  ], 'below');
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onAddAsset) return;
    try {
      const uri = await onAddAsset(file);
      const id = uri.startsWith('asset://') ? uri.slice('asset://'.length) : uri;
      placeImage(id, file.name);
    } catch {
      toast.error('Upload failed.');
    }
  };

  // --- Keyboard -------------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!rootRef.current?.contains(target)) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || document.querySelector('[role="dialog"]')) return;
      if (e.type === 'keyup') {
        if (e.code === 'Space') setSpaceDown(false);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.code === 'Space') {
        if (target.tagName !== 'BUTTON') { setSpaceDown(true); e.preventDefault(); }
        return;
      }
      if (mod && key === 'z') { e.preventDefault(); restore(e.shiftKey ? history.redo() : history.undo()); return; }
      if (mod && key === 'y') { e.preventDefault(); restore(history.redo()); return; }
      if (viewMode) {
        if (key === 'escape') setViewMode(false);
        return;
      }
      if (mod && key === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod && key === 'c') { if (copy()) e.preventDefault(); return; }
      if (mod && key === 'v') { if (clipboardRef.current) { e.preventDefault(); paste(); } return; }
      if (mod && key === 'd') { e.preventDefault(); duplicate(); return; }
      if (key === 'escape') {
        if (chain.length || edgeFirst) { setChain([]); setEdgeFirst(null); return; }
        if (localGroupId) { setLocalGroupId(null); return; }
        clearSelection();
        return;
      }
      if (key === 'enter') { setChain([]); setEdgeFirst(null); return; }
      if (key === 'delete' || key === 'backspace') { e.preventDefault(); deleteSelection(); return; }
      if (key.startsWith('arrow') && (transformCount || selection.axes.size)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudge(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0);
        return;
      }
      if (mod || e.altKey) return;
      if (key === 'g' && selection.vertices.size > 1) {
        commit(e.shiftKey ? ungroupVertices(doc, selection.vertices) : groupVertices(doc, selection.vertices));
        return;
      }
      if (e.shiftKey && e.code === 'Digit1') { fitView(); return; }
      if (e.shiftKey && e.code === 'Digit0') { setView(v => ({ ...v, zoom: 1 })); return; }
      if (key === '=' || key === '+') { zoomBy(1.2); return; }
      if (key === '-') { zoomBy(1 / 1.2); return; }
      const t = TOOLS.find(x => x.key.toLowerCase() === key);
      if (t) setTool(t.id);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  });

  // --- Render helpers --------------------------------------------------------------------

  const z = view.zoom;
  const accent = 'rgb(var(--color-accent))';
  const dotColor = contrastColor(doc.canvas.background);
  const resolvedFills = useMemo(
    () => doc.fills.map(f => ({ fill: f, resolved: resolveBoundaryPolygon(vertices, doc.edges, f.boundary) })).filter(x => x.resolved),
    [doc.fills, doc.edges, vertices],
  );
  const miters = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeMiterJoints>>();
    for (const l of doc.layers) m.set(l.id, computeMiterJoints(vertices, doc.edges.filter(e => e.layerId === l.id)));
    return m;
  }, [doc.layers, doc.edges, vertices]);
  const sortedEdges = useMemo(() => [...doc.edges].sort((a, b) => a.style.thickness - b.style.thickness), [doc.edges]);

  const drawingFrom = tool === 'pen' ? chain[chain.length - 1] : tool === 'edge' ? edgeFirst : dragRef.current?.mode === 'spawn' ? (dragRef.current as { from: string }).from : null;
  const previewFrom = drawingFrom ? vmap.get(drawingFrom) : undefined;
  const previewTo = snapPreview?.point || pointer;
  const isEmpty = doc.vertices.length === 0 && doc.circles.length === 0 && doc.referenceImages.length === 0;

  const cursorClass = panning ? 'cursor-grabbing' : spaceDown || tool === 'pan' || viewMode ? 'cursor-grab'
    : tool === 'select' ? 'cursor-default' : tool === 'text' ? 'cursor-text' : tool === 'eyedropper' ? 'cursor-copy' : 'cursor-crosshair';

  const selectionSummary = () => {
    const parts: string[] = [];
    const looseVertices = [...selection.vertices].filter(id => !selectedTexts.some(t => textCornerIds(t).includes(id))).length;
    if (looseVertices) parts.push(`${looseVertices} point${looseVertices === 1 ? '' : 's'}`);
    const lines = strokeTargets.size;
    if (lines) parts.push(`${lines} line${lines === 1 ? '' : 's'}`);
    if (selection.circles.size) parts.push(`${selection.circles.size} circle${selection.circles.size === 1 ? '' : 's'}`);
    if (selection.fills.size) parts.push(`${selection.fills.size} fill${selection.fills.size === 1 ? '' : 's'}`);
    if (selectedTexts.length) parts.push(`${selectedTexts.length} text${selectedTexts.length === 1 ? '' : 's'}`);
    if (selection.axes.size) parts.push(`${selection.axes.size} guide${selection.axes.size === 1 ? '' : 's'}`);
    return parts.join(' · ');
  };

  // Which style controls the toolbar shows: what's selected, else what the tool draws.
  const hasSelection = selectionSize(selection) > 0;
  const show = hasSelection
    ? { stroke: strokeTargets.size > 0 || selection.circles.size > 0, circle: selection.circles.size > 0, fill: fillTargets.size > 0, text: selectedTextIds.size > 0 }
    : {
      stroke: ['pen', 'vertex', 'edge', 'circle', 'eyedropper'].includes(tool),
      circle: tool === 'circle' || tool === 'eyedropper',
      fill: tool === 'fill' || tool === 'eyedropper',
      text: tool === 'text' || tool === 'eyedropper',
    };
  const anyStyle = show.stroke || show.circle || show.fill || show.text;

  const sep = <span className="mx-1 h-4 w-px shrink-0 bg-border" />;
  const editingText = editing ? doc.texts.find(t => t.id === editing.id) : undefined;
  const editingQuad = editingText ? resolveTextQuad(vmap, editingText) : null;

  return (
    <div ref={rootRef} className="flex h-full flex-col bg-bg">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center overflow-x-auto border-b border-border/70 px-2 [scrollbar-width:thin]">
        <div className="flex shrink-0 items-center" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map(t => (
            <button
              key={t.id}
              type="button"
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              aria-pressed={tool === t.id && !viewMode}
              onClick={() => { setTool(t.id); setViewMode(false); }}
              className={cn('icon-btn', tool === t.id && !viewMode && '!bg-accent/15 !text-accent')}
            >
              <t.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        {sep}
        <div className="flex shrink-0 items-center gap-0.5">
          {viewMode ? (
            <span className="px-1 text-[12px] text-faint">Previewing as exported</span>
          ) : !anyStyle ? (
            <span className="px-1 text-[12px] text-faint">{tool === 'select' && !hasSelection ? 'Select something to style it' : ''}</span>
          ) : (
            <>
              {show.stroke && (
                <>
                  <ColorField color={stroke.color} onChange={color => applyStroke({ color })} label="Line" title="Line color" />
                  <SliderField value={stroke.thickness} onChange={thickness => applyStroke({ thickness })} min={0} max={40} title="Line width in px — 0 makes an invisible construction line" />
                </>
              )}
              {show.circle && (
                <>
                  <ColorField color={circleFill} onChange={fill => applyCircle({ fill })} label="Fill" title="Circle fill" allowNone />
                  <SliderField value={radius} onChange={r => applyCircle({ r: Math.max(1, r) })} min={1} max={400} title="Circle radius" label="R" />
                </>
              )}
              {show.fill && <ColorField color={fillColor} onChange={applyFillColor} label="Fill" title={fillTargets.size ? 'Fill color (None removes the fill)' : 'Color for the Fill tool'} allowNone={fillTargets.size > 0} />}
              {show.text && (
                <>
                  <ColorField color={textStyle.color} onChange={color => applyText({ color })} label="Text" title="Text color" />
                  <SliderField value={textStyle.fontSize} onChange={fontSize => applyText({ fontSize: Math.max(4, fontSize) })} min={6} max={160} title="Font size" label="Size" />
                  {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as [TextAlign, typeof AlignLeft][]).map(([a, Icon]) => (
                    <button key={a} type="button" title={`Align ${a}`} aria-label={`Align ${a}`} aria-pressed={textStyle.align === a} onClick={() => applyText({ align: a })} className={cn('icon-btn h-7 w-7', textStyle.align === a && '!text-accent')}>
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                  <button
                    type="button"
                    className="h-7 rounded-md px-1.5 text-[12px] text-muted hover:bg-surface-hover"
                    title="Vertical alignment"
                    onClick={e => showMenu(e, (['top', 'middle', 'bottom'] as TextValign[]).map(v => ({ label: v[0].toUpperCase() + v.slice(1), checked: textStyle.valign === v, onSelect: () => applyText({ valign: v }) })), 'below')}
                  >
                    {textStyle.valign[0].toUpperCase() + textStyle.valign.slice(1)}
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
          <button type="button" className={cn('icon-btn', snapAnchor && 'is-active')} title="Snapping" aria-label="Snapping options" onClick={e => setSnapAnchor(snapAnchor ? null : e.currentTarget)}>
            <Magnet className="h-4 w-4" />
          </button>
          <button type="button" className="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!history.canUndo} onClick={() => restore(history.undo())}><Undo2 className="h-4 w-4" /></button>
          <button type="button" className="icon-btn" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!history.canRedo} onClick={() => restore(history.redo())}><Redo2 className="h-4 w-4" /></button>
          {sep}
          <button type="button" className="icon-btn" title="Zoom out (-)" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}><ZoomOut className="h-4 w-4" /></button>
          <button type="button" className="h-7 min-w-[3rem] rounded-md px-1 text-[12px] tabular-nums text-muted hover:bg-surface-hover" title="Reset to 100% (Shift+0)" onClick={() => setView(v => ({ ...v, zoom: 1 }))}>
            {Math.round(z * 100)}%
          </button>
          <button type="button" className="icon-btn" title="Zoom in (+)" aria-label="Zoom in" onClick={() => zoomBy(1.2)}><ZoomIn className="h-4 w-4" /></button>
          <button type="button" className="icon-btn" title="Fit to screen (Shift+1)" aria-label="Fit to screen" onClick={() => fitView()}><Maximize className="h-4 w-4" /></button>
          {sep}
          <button
            type="button"
            className={cn('icon-btn', viewMode && 'is-active')}
            title={viewMode ? 'Back to editing (Esc)' : 'Preview as exported'}
            aria-pressed={viewMode}
            onClick={() => { setViewMode(v => !v); clearSelection(); setChain([]); setEdgeFirst(null); setEditing(null); }}
          >
            {viewMode ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Export"
            aria-label="Export"
            onClick={e => showMenu(e, [
              { label: 'Download SVG', icon: Download, onSelect: exportSvg },
              { label: 'Download PNG (1×)', icon: ImageIcon, onSelect: () => exportPng(1) },
              { label: 'Download PNG (2×)', icon: ImageIcon, onSelect: () => exportPng(2) },
              { label: 'Copy SVG markup', icon: ClipboardCopy, onSelect: () => { void copySvg(); } },
            ], 'below')}
          >
            <Download className="h-4 w-4" />
          </button>
          <button type="button" className={cn('icon-btn', panelOpen && 'is-active')} title="Layers, canvas & notes" aria-label="Toggle inspector" aria-pressed={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          ref={surfaceRef}
          tabIndex={-1}
          className={cn('relative min-w-0 flex-1 touch-none select-none overflow-hidden outline-none', cursorClass)}
          style={{
            backgroundColor: 'rgb(var(--color-chrome))',
            backgroundImage: viewMode ? undefined : 'radial-gradient(circle, rgb(var(--color-border-strong)) 1px, transparent 1.2px)',
            backgroundSize: `${GRID * z}px ${GRID * z}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
          onPointerDown={onCanvasDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => { if (!dragRef.current) { setPointer(null); setSnapPreview(null); } }}
          onContextMenu={e => { e.preventDefault(); setChain([]); setEdgeFirst(null); }}
        >
          <svg className="absolute inset-0 h-full w-full">
            <defs>
              <pattern id="vec-checker" width="16" height="16" patternUnits="userSpaceOnUse">
                <rect width="16" height="16" fill="rgb(var(--color-surface))" />
                <rect width="8" height="8" fill="rgb(var(--color-surface-hover))" />
                <rect x="8" y="8" width="8" height="8" fill="rgb(var(--color-surface-hover))" />
              </pattern>
              <pattern id="vec-dots" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <circle cx="0" cy="0" r={1 / z} fill={dotColor || 'rgb(var(--color-border-strong))'} opacity="0.35" />
              </pattern>
            </defs>
            <g transform={`translate(${view.x} ${view.y}) scale(${z})`}>
              {/* Artboard: the area that gets exported. */}
              <rect width={doc.canvas.width} height={doc.canvas.height} fill={doc.canvas.background === 'transparent' ? 'url(#vec-checker)' : doc.canvas.background} />
              {!viewMode && dotColor && <rect width={doc.canvas.width} height={doc.canvas.height} fill="url(#vec-dots)" pointerEvents="none" />}
              <rect width={doc.canvas.width} height={doc.canvas.height} fill="none" stroke="rgb(var(--color-border-strong))" strokeWidth={1 / z} pointerEvents="none" />

              {!viewMode && doc.referenceImages.map(img0 => {
                const img = imageDraft?.id === img0.id ? { ...img0, ...imageDraft } : img0;
                const selected = selectedImageId === img.id && tool === 'select';
                const url = assets[img.assetId];
                return (
                  <g key={img.id}>
                    {url
                      ? <image href={url} x={img.x} y={img.y} width={img.width} height={img.height} opacity={REFERENCE_IMAGE_OPACITY} preserveAspectRatio="none" onPointerDown={e => onImageDown(e, img.id)} />
                      : <rect x={img.x} y={img.y} width={img.width} height={img.height} fill="none" stroke="rgb(var(--color-faint))" strokeDasharray={`${6 / z}`} strokeWidth={1 / z} onPointerDown={e => onImageDown(e, img.id)} />}
                    {selected && (
                      <>
                        <rect x={img.x} y={img.y} width={img.width} height={img.height} fill="none" stroke={accent} strokeWidth={1.5 / z} pointerEvents="none" />
                        <rect x={img.x + img.width - 5 / z} y={img.y + img.height - 5 / z} width={10 / z} height={10 / z} fill="rgb(var(--color-bg))" stroke={accent} strokeWidth={1.5 / z} style={{ cursor: 'nwse-resize' }} onPointerDown={e => onImageDown(e, img.id, true)} />
                      </>
                    )}
                  </g>
                );
              })}

              {doc.layers.filter(l => l.visible).map(l => {
                const locked = l.locked || viewMode;
                return (
                  <g key={l.id} pointerEvents={locked ? 'none' : undefined}>
                    {resolvedFills.filter(({ fill }) => fill.layerId === l.id).map(({ fill, resolved }) => (
                      <path
                        key={fill.id}
                        d={loopsToPathData([resolved!.outer, ...resolved!.holes])}
                        fill={fill.color}
                        fillRule="evenodd"
                        stroke={selection.fills.has(fill.id) && !viewMode ? accent : 'none'}
                        strokeWidth={2 / z}
                        strokeDasharray={`${5 / z} ${3 / z}`}
                        onPointerDown={e => onFillDown(e, fill.id)}
                      />
                    ))}
                    {circles.filter(c => c.layerId === l.id).map(c => {
                      const selected = selection.circles.has(c.id) && !viewMode;
                      return (
                        <g key={c.id} onPointerDown={e => onCircleDown(e, c)}>
                          {selected && <circle cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke={accent} strokeOpacity={0.45} strokeWidth={Math.max(c.style.thickness, 2) + 6 / z} />}
                          <circle cx={c.cx} cy={c.cy} r={c.r} fill={c.fill && c.fill !== 'none' ? c.fill : 'none'} stroke={c.style.thickness > 0 ? c.style.color : 'none'} strokeWidth={c.style.thickness} />
                          {!viewMode && c.style.thickness === 0 && <circle cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke="rgb(var(--color-faint))" strokeWidth={1 / z} strokeDasharray={`${4 / z}`} />}
                          {/* Wide invisible ring so thin outlines are easy to grab. */}
                          {!viewMode && <circle cx={c.cx} cy={c.cy} r={c.r} fill={c.fill && c.fill !== 'none' ? 'transparent' : 'none'} stroke="transparent" strokeWidth={Math.max(c.style.thickness, 10 / z)} pointerEvents={c.fill && c.fill !== 'none' ? 'all' : 'stroke'} />}
                        </g>
                      );
                    })}
                    {doc.texts.filter(t => t.layerId === l.id).map(t => {
                      const quad = resolveTextQuad(vmap, t);
                      if (!quad) return null;
                      const selected = selectedTextIds.has(t.id) && !viewMode;
                      const beingEdited = editing?.id === t.id;
                      return (
                        <g key={t.id}>
                          {selected && <polygon points={quad.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={accent} strokeWidth={1.5 / z} strokeDasharray={`${4 / z}`} />}
                          {!viewMode && !selected && !t.content && <polygon points={quad.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="rgb(var(--color-faint))" strokeWidth={1 / z} strokeDasharray={`${4 / z}`} />}
                          <foreignObject x="0" y="0" width={TEXT_BOX.width} height={TEXT_BOX.height} overflow="visible" style={{ transform: computeQuadWarpMatrix3d(quad, TEXT_BOX.width, TEXT_BOX.height), transformOrigin: '0 0', opacity: beingEdited ? 0.25 : 1 }}>
                            <div
                              onPointerDown={e => onTextDown(e, t)}
                              style={{
                                width: TEXT_BOX.width, height: TEXT_BOX.height, color: t.color, fontSize: t.fontSize, textAlign: t.align,
                                display: 'flex', flexDirection: 'column', justifyContent: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[t.valign],
                                whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontFamily: 'sans-serif', lineHeight: 1.25, overflow: 'visible',
                                cursor: tool === 'select' ? 'move' : undefined,
                              }}
                            >
                              {t.content || (!viewMode && <span style={{ opacity: 0.45, fontStyle: 'italic', fontSize: 13, color: 'rgb(var(--color-muted))' }}>Double-click to type</span>)}
                            </div>
                          </foreignObject>
                        </g>
                      );
                    })}
                    {sortedEdges.filter(e => e.layerId === l.id).map(e => {
                      const a = vmap.get(e.v1), b = vmap.get(e.v2);
                      if (!a || !b) return null;
                      const selected = (strokeTargets.has(e.id)) && !viewMode;
                      const snapTarget = snapPreview?.snappedEdgeId === e.id;
                      return (
                        <g key={e.id} onPointerDown={ev => onEdgeDown(ev, e.id)}>
                          {(selected || snapTarget) && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={accent} strokeOpacity={snapTarget ? 0.7 : 0.45} strokeWidth={Math.max(e.style.thickness, 2) + 6 / z} strokeLinecap="round" />}
                          {e.style.thickness > 0 && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.style.color} strokeWidth={e.style.thickness} />}
                          {!viewMode && e.style.thickness === 0 && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(var(--color-faint))" strokeWidth={1 / z} strokeDasharray={`${4 / z}`} />}
                          {!viewMode && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={Math.max(e.style.thickness, 10 / z)} />}
                        </g>
                      );
                    })}
                    {(miters.get(l.id) || []).map(j => (
                      <polygon key={j.vertexId} points={j.points.map(p => `${p.x},${p.y}`).join(' ')} fill={j.color} pointerEvents="none" />
                    ))}
                  </g>
                );
              })}

              {/* Guide lines (snap axes): editing aids, never exported. */}
              {!viewMode && axes.map(a => {
                const selected = selection.axes.has(a.id);
                const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1;
                const ux = (a.x2 - a.x1) / len, uy = (a.y2 - a.y1) / len;
                return (
                  <g key={a.id}>
                    <line x1={a.x1 - ux * GUIDE_SPAN} y1={a.y1 - uy * GUIDE_SPAN} x2={a.x2 + ux * GUIDE_SPAN} y2={a.y2 + uy * GUIDE_SPAN} stroke="rgb(var(--color-info))" strokeOpacity={selected ? 0.9 : 0.45} strokeWidth={1 / z} strokeDasharray={`${6 / z} ${4 / z}`} pointerEvents="none" />
                    <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth={8 / z} style={{ cursor: tool === 'select' ? 'move' : undefined }} pointerEvents={tool === 'select' ? 'stroke' : 'none'} onPointerDown={e => onAxisDown(e, a.id)} />
                    {selected && ([1, 2] as const).map(w => (
                      <circle key={w} cx={w === 1 ? a.x1 : a.x2} cy={w === 1 ? a.y1 : a.y2} r={5 / z} fill="rgb(var(--color-bg))" stroke="rgb(var(--color-info))" strokeWidth={1.5 / z} onPointerDown={e => onAxisDown(e, a.id, w)} />
                    ))}
                    {selected && <MeasurementLabel x={(a.x1 + a.x2) / 2} y={(a.y1 + a.y2) / 2} lines={[`${fmt(len)}`, `${fmt(lineRotationDeg(a.x2 - a.x1, a.y2 - a.y1))}°`]} zoom={z} />}
                  </g>
                );
              })}
              {axisDraft && !axisDraft.id && <line x1={axisDraft.x1} y1={axisDraft.y1} x2={axisDraft.x2} y2={axisDraft.y2} stroke="rgb(var(--color-info))" strokeWidth={1.5 / z} strokeDasharray={`${6 / z} ${4 / z}`} />}

              {/* Drawing previews */}
              {circleDraft && (
                <>
                  <circle cx={circleDraft.cx} cy={circleDraft.cy} r={circleDraft.r || radius} fill="none" stroke={accent} strokeWidth={1 / z} strokeDasharray={`${4 / z}`} />
                  <MeasurementLabel x={circleDraft.cx} y={circleDraft.cy - (circleDraft.r || radius) - 16 / z} lines={[`r ${fmt(circleDraft.r || radius)}`]} zoom={z} />
                </>
              )}
              {textDraft && (
                <rect x={Math.min(textDraft.a.x, textDraft.b.x)} y={Math.min(textDraft.a.y, textDraft.b.y)} width={Math.abs(textDraft.b.x - textDraft.a.x)} height={Math.abs(textDraft.b.y - textDraft.a.y)} fill="rgb(var(--color-accent) / 0.08)" stroke={accent} strokeWidth={1 / z} strokeDasharray={`${4 / z}`} />
              )}
              {previewFrom && previewTo && !viewMode && (
                <>
                  <line x1={previewFrom.x} y1={previewFrom.y} x2={previewTo.x} y2={previewTo.y} stroke={stroke.color} strokeOpacity={0.7} strokeWidth={Math.max(stroke.thickness, 1 / z)} strokeDasharray={`${6 / z} ${4 / z}`} pointerEvents="none" />
                  <MeasurementLabel
                    x={(previewFrom.x + previewTo.x) / 2}
                    y={(previewFrom.y + previewTo.y) / 2 - 14 / z}
                    lines={[`${fmt(dist(previewFrom, previewTo))} · ${fmt(lineRotationDeg(previewTo.x - previewFrom.x, previewTo.y - previewFrom.y))}°`]}
                    zoom={z}
                  />
                </>
              )}
              {tool === 'pen' && chain.length > 2 && !viewMode && (() => {
                const first = vmap.get(chain[0]);
                return first && <circle cx={first.x} cy={first.y} r={8 / z} fill="none" stroke={accent} strokeWidth={1.5 / z} pointerEvents="none" />;
              })()}

              {/* Snap feedback */}
              {snapPreview && !viewMode && (
                <g pointerEvents="none">
                  {snapPreview.snapLines?.map((ln, i) => {
                    const len = Math.hypot(ln.p2.x - ln.p1.x, ln.p2.y - ln.p1.y) || 1;
                    const ux = (ln.p2.x - ln.p1.x) / len, uy = (ln.p2.y - ln.p1.y) / len;
                    return <line key={i} x1={ln.p1.x - ux * GUIDE_SPAN} y1={ln.p1.y - uy * GUIDE_SPAN} x2={ln.p1.x + ux * GUIDE_SPAN} y2={ln.p1.y + uy * GUIDE_SPAN} stroke="rgb(var(--color-warning))" strokeOpacity={0.6} strokeWidth={1 / z} strokeDasharray={`${4 / z} ${4 / z}`} />;
                  })}
                  {snapPreview.axisSnapVertexX && vmap.get(snapPreview.axisSnapVertexX) && (
                    <line x1={snapPreview.point.x} y1={vmap.get(snapPreview.axisSnapVertexX)!.y} x2={snapPreview.point.x} y2={snapPreview.point.y} stroke="rgb(var(--color-warning))" strokeOpacity={0.7} strokeWidth={1 / z} strokeDasharray={`${3 / z}`} />
                  )}
                  {snapPreview.axisSnapVertexY && vmap.get(snapPreview.axisSnapVertexY) && (
                    <line x1={vmap.get(snapPreview.axisSnapVertexY)!.x} y1={snapPreview.point.y} x2={snapPreview.point.x} y2={snapPreview.point.y} stroke="rgb(var(--color-warning))" strokeOpacity={0.7} strokeWidth={1 / z} strokeDasharray={`${3 / z}`} />
                  )}
                  {snapPreview.snappedVertexId
                    ? <circle cx={snapPreview.point.x} cy={snapPreview.point.y} r={7 / z} fill="none" stroke="rgb(var(--color-warning))" strokeWidth={2 / z} />
                    : snapPreview.snappedEdgeId
                      ? <rect x={snapPreview.point.x - 4 / z} y={snapPreview.point.y - 4 / z} width={8 / z} height={8 / z} fill="rgb(var(--color-warning))" transform={`rotate(45 ${snapPreview.point.x} ${snapPreview.point.y})`} />
                      : <circle cx={snapPreview.point.x} cy={snapPreview.point.y} r={3 / z} fill="rgb(var(--color-warning))" />}
                </g>
              )}

              {/* Points */}
              {!viewMode && doc.vertices.map(v0 => {
                if (!vertexVisible(v0.id)) return null;
                const v = vmap.get(v0.id)!;
                const selected = selection.vertices.has(v.id) || transformVertexIds.has(v.id) || v.id === edgeFirst || chain.includes(v.id);
                const editable = vertexEditable(v.id);
                const grouped = !!groupOf(doc, v.id);
                return (
                  <circle
                    key={v.id}
                    cx={v.x}
                    cy={v.y}
                    r={(selected ? 4.5 : 3.5) / z}
                    fill={selected ? accent : 'rgb(var(--color-bg))'}
                    stroke={grouped && !selected ? 'rgb(var(--color-info))' : accent}
                    strokeWidth={1.5 / z}
                    opacity={editable ? 1 : 0.35}
                    pointerEvents={editable && ['select', 'vertex', 'edge', 'pen', 'eyedropper'].includes(tool) ? 'all' : 'none'}
                    style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}
                    onPointerDown={e => onVertexDown(e, v.id)}
                  />
                );
              })}

              {/* Measurements for what's selected */}
              {!viewMode && sortedEdges.filter(e => selection.edges.has(e.id)).slice(0, 12).map(e => {
                const a = vmap.get(e.v1), b = vmap.get(e.v2);
                return a && b && <MeasurementLabel key={`m-${e.id}`} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 14 / z} lines={[`${fmt(dist(a, b))} · ${fmt(lineRotationDeg(b.x - a.x, b.y - a.y))}°`]} zoom={z} />;
              })}
              {!viewMode && singleVertex && vmap.get(singleVertex) && (() => {
                const v = vmap.get(singleVertex)!;
                const others = (adjacency.get(singleVertex) || []).map(he => vmap.get(he.to)).filter((p): p is NonNullable<typeof p> => !!p);
                return (
                  <g>
                    <MeasurementLabel x={v.x} y={v.y - 20 / z} lines={[`${fmt(v.x)}, ${fmt(v.y)}`]} zoom={z} />
                    {vertexAngles(others.map(p => ({ x: p.x - v.x, y: p.y - v.y }))).map((a, i) => (
                      <MeasurementLabel key={i} x={v.x + Math.cos(a.bisector) * 34 / z} y={v.y + Math.sin(a.bisector) * 34 / z} lines={[`${fmt(a.angleDeg)}°`]} zoom={z} />
                    ))}
                  </g>
                );
              })()}
              {!viewMode && circles.filter(c => selection.circles.has(c.id)).slice(0, 8).map(c => (
                <MeasurementLabel key={`mc-${c.id}`} x={c.cx} y={c.cy - c.r - 16 / z} lines={[`r ${fmt(c.r)}`]} zoom={z} />
              ))}
              {readout && <MeasurementLabel x={readout.at.x + 40 / z} y={readout.at.y - 24 / z} lines={readout.lines} zoom={z} />}

              {/* Single circle: radius handle */}
              {!viewMode && tool === 'select' && !selectionBox && selection.circles.size === 1 && (() => {
                const c = circles.find(x => selection.circles.has(x.id));
                return c && <rect x={c.cx + c.r - 4 / z} y={c.cy - 4 / z} width={8 / z} height={8 / z} fill="rgb(var(--color-bg))" stroke={accent} strokeWidth={1.5 / z} style={{ cursor: 'ew-resize' }} onPointerDown={e => onCircleResizeDown(e, c)} />;
              })()}

              {/* Selection box: scale, rotate and move handles */}
              {selectionBox && (() => {
                const pad = 10 / z;
                const b = selectionBox;
                const cx = (b.minX + b.maxX) / 2;
                return (
                  <g>
                    <rect x={b.minX - pad} y={b.minY - pad} width={b.maxX - b.minX + pad * 2} height={b.maxY - b.minY + pad * 2} fill="none" stroke={accent} strokeWidth={1 / z} strokeDasharray={`${4 / z} ${3 / z}`} pointerEvents="none" />
                    {handleConfigsFor(b, pad).map(h => (
                      <rect key={h.key} x={h.x - 4 / z} y={h.y - 4 / z} width={8 / z} height={8 / z} fill="rgb(var(--color-bg))" stroke={accent} strokeWidth={1.5 / z} style={{ cursor: h.cursor }} onPointerDown={e => startTransform(e, 'scale', h)}>
                        <title>Scale (Shift toggles keep proportions)</title>
                      </rect>
                    ))}
                    <line x1={cx} y1={b.minY - pad} x2={cx} y2={b.minY - pad - 22 / z} stroke={accent} strokeWidth={1 / z} pointerEvents="none" />
                    <circle cx={cx} cy={b.minY - pad - 22 / z} r={6 / z} fill="rgb(var(--color-bg))" stroke={accent} strokeWidth={1.5 / z} style={{ cursor: 'grab' }} onPointerDown={e => startTransform(e, 'rotate')}>
                      <title>Rotate (Shift snaps to 15°)</title>
                    </circle>
                    <line x1={cx} y1={b.maxY + pad} x2={cx} y2={b.maxY + pad + 22 / z} stroke={accent} strokeWidth={1 / z} pointerEvents="none" />
                    <circle
                      cx={cx}
                      cy={b.maxY + pad + 22 / z}
                      r={6 / z}
                      fill={accent}
                      stroke="rgb(var(--color-bg))"
                      strokeWidth={1.5 / z}
                      style={{ cursor: 'move' }}
                      onPointerDown={e => { e.stopPropagation(); capture(e); beginMove(toWorld(e), transformVertexIds, selection.circles, null); }}
                    >
                      <title>Move selection</title>
                    </circle>
                  </g>
                );
              })()}

              {marquee && (
                <rect x={Math.min(marquee.a.x, marquee.b.x)} y={Math.min(marquee.a.y, marquee.b.y)} width={Math.abs(marquee.b.x - marquee.a.x)} height={Math.abs(marquee.b.y - marquee.a.y)} fill="rgb(var(--color-accent) / 0.1)" stroke={accent} strokeWidth={1 / z} />
              )}
            </g>
          </svg>

          {/* In-place text editing */}
          {editing && editingQuad && (() => {
            const pts = editingQuad.map(toScreen);
            const minX = Math.min(...pts.map(p => p.x)), minY = Math.min(...pts.map(p => p.y));
            const maxX = Math.max(...pts.map(p => p.x)), maxY = Math.max(...pts.map(p => p.y));
            return (
              <textarea
                autoFocus
                value={editing.buffer}
                placeholder="Type…"
                onChange={e => setEditing({ ...editing, buffer: e.target.value })}
                onPointerDown={e => e.stopPropagation()}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commitTextEdit(); }
                }}
                onBlur={commitTextEdit}
                className="absolute z-10 resize-none rounded border border-accent bg-surface-raised p-1.5 text-[13px] leading-snug text-content shadow-raised outline-none"
                style={{ left: minX, top: minY, width: Math.max(140, maxX - minX), height: Math.max(48, maxY - minY) }}
              />
            );
          })()}

          {/* Empty state */}
          {isEmpty && !viewMode && chain.length === 0 && !dragRef.current && (
            <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center px-4">
              <div className="pointer-events-auto max-w-md rounded-lg border border-border bg-surface/95 px-4 py-3 text-[12px] text-muted shadow-raised">
                <div className="mb-1 text-[13px] font-medium text-content">Start drawing</div>
                <p className="leading-relaxed">
                  With the <b className="text-content">Pen</b> (L), click to drop points — each click joins a line to the last. Click the first point again to close the shape, then use <b className="text-content">Fill</b> (F) to color inside it.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setTool('pen')} className="rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-accent-content hover:bg-accent-hover">Use the Pen</button>
                  <button type="button" onClick={() => setTool('circle')} className="rounded-md px-2 py-1 text-[12px] text-muted ring-1 ring-border hover:bg-surface-hover">Draw a circle</button>
                  <button type="button" onClick={addImageMenu} className="rounded-md px-2 py-1 text-[12px] text-muted ring-1 ring-border hover:bg-surface-hover">Trace an image</button>
                </div>
              </div>
            </div>
          )}

          {/* Selection actions */}
          {!viewMode && (hasSelection || selectedImageId) && !dragRef.current && (
            <div className="absolute bottom-9 left-1/2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface-raised px-1.5 py-1 shadow-raised" onPointerDown={e => e.stopPropagation()}>
              <span className="px-1.5 text-[12px] text-muted">{selectedImageId ? 'Tracing image' : selectionSummary()}</span>
              {localGroupId && <span className="rounded bg-info/15 px-1.5 py-0.5 text-[11px] text-info">inside group</span>}
              {twoVertices && !edgeExists(doc, twoVertices[0], twoVertices[1]) && (
                <ActionButton icon={Link2} label="Connect" onClick={() => commit(addEdge(doc, twoVertices[0], twoVertices[1], stroke, layer.id).doc)} />
              )}
              {twoVertices && <ActionButton icon={Merge} label="Merge" title="Merge the two points into one" onClick={() => { commit(mergeVertexInto(doc, twoVertices[0], twoVertices[1])); setSelection({ ...emptySelection(), vertices: new Set([twoVertices[0]]) }); }} />}
              {canGroup && <ActionButton icon={Group} label="Group" title="Group (G) — click selects the whole group" onClick={() => commit(groupVertices(doc, selection.vertices))} />}
              {canUngroup && <ActionButton icon={Ungroup} label="Ungroup" title="Ungroup (Shift+G)" onClick={() => commit(ungroupVertices(doc, selection.vertices))} />}
              {singleVertex && (singleDegree === 1 || singleDegree === 2) && (
                <ActionButton icon={Unlink} label="Disconnect" title={singleDegree === 2 ? 'Take this point out of the path, joining its neighbors directly' : 'Remove this point’s line'} onClick={() => commit(disconnectVertex(doc, singleVertex))} />
              )}
              {singleVertex && singleDegree >= 2 && (
                <ActionButton icon={Scissors} label="Split" title="Split into one point per line, so the lines can be pulled apart" onClick={() => { const res = splitVertex(doc, singleVertex); commit(res.doc); setSelection({ ...emptySelection(), vertices: new Set([singleVertex, ...res.ids]) }); }} />
              )}
              {hasLayerTargets && doc.layers.length > 1 && (
                <>
                  <button type="button" className="icon-btn h-7 w-7" title="Move to the layer above" aria-label="Move to the layer above" disabled={!canShiftLayers(doc, layerTargets, 1)} onClick={() => commit(shiftLayers(doc, layerTargets, 1))}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" className="icon-btn h-7 w-7" title="Move to the layer below" aria-label="Move to the layer below" disabled={!canShiftLayers(doc, layerTargets, -1)} onClick={() => commit(shiftLayers(doc, layerTargets, -1))}><ArrowDown className="h-3.5 w-3.5" /></button>
                </>
              )}
              {transformVertexIds.size + selection.circles.size > 0 && (
                <button type="button" className="icon-btn h-7 w-7" title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={duplicate}><Copy className="h-3.5 w-3.5" /></button>
              )}
              {transformCount > 1 && (
                <button type="button" className={cn('icon-btn h-7 w-7', snap.lockRatio && 'is-active')} title="Keep proportions when scaling" aria-label="Keep proportions when scaling" aria-pressed={snap.lockRatio} onClick={() => setSnap({ lockRatio: !snap.lockRatio })}><Ratio className="h-3.5 w-3.5" /></button>
              )}
              <button type="button" className="icon-btn h-7 w-7 hover:!text-danger" title="Delete (Del)" aria-label="Delete selection" onClick={deleteSelection}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {/* Status line */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 truncate px-3 py-1.5 text-[11px] text-faint">
            <span className="tabular-nums">{pointer ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}` : `${doc.canvas.width} × ${doc.canvas.height}`}</span>
            <span className="truncate">{viewMode ? 'Preview — drag to pan, Esc to edit' : TOOL_HINTS[tool]}</span>
            {!viewMode && doc.layers.length > 1 && <span className="ml-auto shrink-0">Layer: {layer.name}</span>}
          </div>
        </div>

        {panelOpen && (
          <VectorInspector
            doc={doc}
            commit={commit}
            activeLayerId={layer.id}
            onActiveLayer={setActiveLayerId}
            selectedImageId={selectedImageId}
            onSelectImage={id => { setSelectedImageId(id); setSelection(emptySelection()); setToolState('select'); }}
            onAddImage={addImageMenu}
            onFitArtboard={fitArtboard}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />

      <SnapPopover anchor={snapAnchor} onClose={() => setSnapAnchor(null)} snap={snap} setSnap={setSnap} />
    </div>
  );
};

const ActionButton: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; title?: string; onClick: () => void }> = ({ icon: Icon, label, title, onClick }) => (
  <button type="button" title={title || label} onClick={onClick} className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] text-muted hover:bg-surface-hover hover:text-content">
    <Icon className="h-3.5 w-3.5" /> {label}
  </button>
);

const SNAP_OPTIONS: { key: keyof SnapSettings; label: string; hint: string }[] = [
  { key: 'vertex', label: 'Points', hint: 'Snap onto existing points' },
  { key: 'edge', label: 'Lines', hint: 'Snap onto a line, splitting it there' },
  { key: 'align', label: 'Alignment', hint: 'Line up horizontally/vertically with other points, and straighten bends' },
  { key: 'perpendicular', label: 'Parallel & perpendicular', hint: 'Match the angle of other lines' },
  { key: 'guides', label: 'Guide lines', hint: 'Snap to guide lines drawn with the Guide tool (X)' },
  { key: 'grid', label: 'Grid', hint: `Snap to the ${GRID}px dot grid` },
];

const SnapPopover: React.FC<{ anchor: HTMLElement | null; onClose: () => void; snap: SnapSettings; setSnap: (p: Partial<SnapSettings>) => void }> = ({ anchor, onClose, snap, setSnap }) => {
  const row = (key: keyof SnapSettings, label: string, hint: string) => (
    <label key={key} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover" title={hint}>
      <input type="checkbox" checked={snap[key]} onChange={() => setSnap({ [key]: !snap[key] })} className="mt-0.5 accent-[rgb(var(--color-accent))]" />
      <span>
        <span className="block text-[12px] text-content">{label}</span>
        <span className="block text-[11px] leading-snug text-faint">{hint}</span>
      </span>
    </label>
  );
  return (
    <Popover anchor={anchor} onClose={onClose} className="w-64">
      <div className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Snap to</div>
      {SNAP_OPTIONS.map(o => row(o.key, o.label, o.hint))}
      <div className="my-1 border-t border-border" />
      {row('crossLayer', 'Snap across layers', 'When off, only the active layer’s points and lines attract')}
      {row('merge', 'Merge overlapping points', 'Points dropped exactly on another point become one')}
    </Popover>
  );
};

export default VectorEditor;
