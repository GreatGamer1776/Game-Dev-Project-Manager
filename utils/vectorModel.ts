import { uid } from './id';
import {
  FillBoundary, GVertex, Pt, ResolvedFill, boundaryReferencesOnly, buildVertexAdjacency, computeMiterJoints,
  computeQuadWarpMatrix3d, findFillBoundary, pointInPolygon, polygonArea, resolveBoundaryPolygon,
} from './vectorTopology';

// Vector art document — a strict vertex/edge graph (modelled on store-app's
// .vec editor). Edges always join two vertices and carry their own style;
// fills reference vertex ids / edge crossings so they follow the shape as it
// is edited; circles are free-standing; a text's four corners are real
// vertices so it can be moved, scaled, rotated or skewed like any shape.
// Layers are a strict z-partition, bottom (index 0) to top.

export interface Stroke { color: string; thickness: number }
export type Vertex = GVertex;
export interface VEdge { id: string; v1: string; v2: string; style: Stroke; layerId: string }
export interface VFill { id: string; boundary: FillBoundary; color: string; layerId: string }
export interface VCircle { id: string; cx: number; cy: number; r: number; style: Stroke; fill: string; layerId: string }
export type TextAlign = 'left' | 'center' | 'right';
export type TextValign = 'top' | 'middle' | 'bottom';
export interface VText {
  id: string;
  v1: string; v2: string; v3: string; v4: string; // TL, TR, BR, BL corner vertices
  content: string;
  color: string;
  fontSize: number;
  align: TextAlign;
  valign: TextValign;
  layerId: string;
}
export interface VGroup { id: string; vertexIds: string[] }
export interface VLayer { id: string; name: string; visible: boolean; locked: boolean }
export interface SnapAxis { id: string; x1: number; y1: number; x2: number; y2: number }
export interface ReferenceImage { id: string; assetId: string; name: string; x: number; y: number; width: number; height: number }

export interface VectorDoc {
  canvas: { width: number; height: number; background: string };
  vertices: Vertex[];
  edges: VEdge[];
  fills: VFill[];
  circles: VCircle[];
  texts: VText[];
  groups: VGroup[];
  layers: VLayer[];
  snapAxes: SnapAxis[];
  referenceImages: ReferenceImage[];
  notes: string;
}

export const VECTOR_SWATCHES = ['#e0555a', '#e0a63d', '#d8c34a', '#6fcf97', '#4fb0c6', '#8a6cef', '#dcddde', '#1f1f1f'];
export const DEFAULT_STROKE: Stroke = { color: '#dcddde', thickness: 2 };
export const DEFAULT_CIRCLE_RADIUS = 30;
export const DEFAULT_FILL = '#8a6cef';
/** Layout box a text is drawn in before being warped onto its four corners. */
export const TEXT_BOX = { width: 160, height: 60 };
export const DEFAULT_TEXT_STYLE = { color: '#ffffff', fontSize: 24, align: 'left' as TextAlign, valign: 'top' as TextValign };
/** Reference images are tracing guides: always faded, behind everything, never exported. */
export const REFERENCE_IMAGE_OPACITY = 0.35;

const newLayer = (name = 'Layer 1'): VLayer => ({ id: `layer-${uid()}`, name, visible: true, locked: false });

export const emptyVector = (): VectorDoc => ({
  canvas: { width: 800, height: 600, background: 'transparent' },
  vertices: [], edges: [], fills: [], circles: [], texts: [], groups: [],
  layers: [newLayer()],
  snapAxes: [], referenceImages: [], notes: '',
});

// --- Parsing ------------------------------------------------------------------

const num = (raw: unknown, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};
const str = (raw: unknown, fallback: string) => (typeof raw === 'string' ? raw : fallback);
const arr = (raw: unknown): any[] => (Array.isArray(raw) ? raw : []);

/** Tolerant parse: malformed input yields an empty document; older flat-style files are upgraded. */
export const parseVector = (raw: unknown): VectorDoc => {
  let d: any = raw;
  if (typeof raw === 'string') {
    try { d = JSON.parse(raw); } catch { d = null; }
  }
  if (!d || typeof d !== 'object') return emptyVector();

  const parsedLayers: VLayer[] = arr(d.layers)
    .filter(l => l && typeof l.id === 'string')
    .map(l => ({ id: l.id, name: str(l.name, 'Layer'), visible: l.visible !== false, locked: l.locked === true }));
  const layers = parsedLayers.length ? parsedLayers : [newLayer()];
  const layerIds = new Set(layers.map(l => l.id));
  const layerOf = (id: unknown) => (typeof id === 'string' && layerIds.has(id) ? id : layers[0].id);
  // Older files stored color/thickness flat on the object instead of in `style`.
  const strokeOf = (o: any): Stroke => ({
    color: str(o?.style?.color ?? o?.color, DEFAULT_STROKE.color),
    thickness: Math.max(0, num(o?.style?.thickness ?? o?.thickness, DEFAULT_STROKE.thickness)),
  });

  const vertices: Vertex[] = arr(d.vertices)
    .filter(v => v && typeof v.id === 'string')
    .map(v => ({ id: v.id, x: num(v.x, 0), y: num(v.y, 0) }));
  const vertexIds = new Set(vertices.map(v => v.id));

  const seenPairs = new Set<string>();
  const edges: VEdge[] = arr(d.edges)
    .filter(e => e && typeof e.id === 'string' && vertexIds.has(e.v1) && vertexIds.has(e.v2) && e.v1 !== e.v2)
    .filter(e => {
      const key = e.v1 < e.v2 ? `${e.v1}|${e.v2}` : `${e.v2}|${e.v1}`;
      if (seenPairs.has(key)) return false;
      seenPairs.add(key);
      return true;
    })
    .map(e => ({ id: e.id, v1: e.v1, v2: e.v2, style: strokeOf(e), layerId: layerOf(e.layerId) }));
  const edgeIds = new Set(edges.map(e => e.id));

  const parseLoop = (loop: unknown) => {
    if (!Array.isArray(loop) || loop.length < 3) return null;
    const out: FillBoundary['outer'] = [];
    for (const c of loop) {
      // Older files stored a bare list of vertex ids.
      if (typeof c === 'string' && vertexIds.has(c)) out.push({ type: 'vertex', id: c });
      else if (c?.type === 'vertex' && vertexIds.has(c.id)) out.push({ type: 'vertex', id: c.id });
      else if (c?.type === 'crossing' && edgeIds.has(c.edgeA) && edgeIds.has(c.edgeB)) out.push({ type: 'crossing', edgeA: c.edgeA, edgeB: c.edgeB });
      else return null;
    }
    return out;
  };
  const fills: VFill[] = arr(d.fills).flatMap(f => {
    if (!f || typeof f.id !== 'string') return [];
    const spec = Array.isArray(f.boundary) ? { outer: f.boundary, holes: [] } : f.boundary;
    const outer = parseLoop(spec?.outer);
    if (!outer) return [];
    const holes = arr(spec.holes).map(parseLoop).filter((h): h is FillBoundary['outer'] => !!h);
    return [{ id: f.id, boundary: { outer, holes }, color: str(f.color, DEFAULT_FILL), layerId: layerOf(f.layerId) }];
  });

  const circles: VCircle[] = arr(d.circles)
    .filter(c => c && typeof c.id === 'string')
    .map(c => ({
      id: c.id, cx: num(c.cx, 0), cy: num(c.cy, 0), r: Math.max(0.5, num(c.r, DEFAULT_CIRCLE_RADIUS)),
      style: strokeOf(c), fill: str(c.fill, 'none'), layerId: layerOf(c.layerId),
    }));

  const texts: VText[] = [];
  for (const t of arr(d.texts)) {
    if (!t || typeof t.id !== 'string') continue;
    if ([t.v1, t.v2, t.v3, t.v4].every(id => vertexIds.has(id))) {
      texts.push({
        id: t.id, v1: t.v1, v2: t.v2, v3: t.v3, v4: t.v4,
        content: str(t.content, ''),
        color: str(t.color, DEFAULT_TEXT_STYLE.color),
        fontSize: num(t.fontSize, 0) > 0 ? num(t.fontSize, 0) : DEFAULT_TEXT_STYLE.fontSize,
        align: ['left', 'center', 'right'].includes(t.align) ? t.align : 'left',
        valign: ['top', 'middle', 'bottom'].includes(t.valign) ? t.valign : 'top',
        layerId: layerOf(t.layerId),
      });
    } else if (typeof t.text === 'string' && Number.isFinite(Number(t.x))) {
      // Older point text (baseline at x,y): give it a box of its own.
      const size = num(t.size, DEFAULT_TEXT_STYLE.fontSize);
      const x = num(t.x, 0), top = num(t.y, 0) - size;
      const corners = [{ x, y: top }, { x: x + TEXT_BOX.width, y: top }, { x: x + TEXT_BOX.width, y: top + TEXT_BOX.height }, { x, y: top + TEXT_BOX.height }]
        .map(p => ({ id: uid(), ...p }));
      vertices.push(...corners);
      texts.push({
        id: t.id, v1: corners[0].id, v2: corners[1].id, v3: corners[2].id, v4: corners[3].id,
        content: t.text, color: str(t.color, DEFAULT_TEXT_STYLE.color), fontSize: size, align: 'left', valign: 'top', layerId: layers[0].id,
      });
    }
  }
  const allVertexIds = new Set(vertices.map(v => v.id));

  const canvas = d.canvas && typeof d.canvas === 'object' ? d.canvas : d;
  return {
    canvas: {
      width: num(canvas.width, 0) > 0 ? num(canvas.width, 800) : 800,
      height: num(canvas.height, 0) > 0 ? num(canvas.height, 600) : 600,
      background: str(canvas.background, 'transparent'),
    },
    vertices,
    edges,
    fills,
    circles,
    texts,
    groups: arr(d.groups)
      .filter(g => g && typeof g.id === 'string' && Array.isArray(g.vertexIds))
      .map(g => ({ id: g.id, vertexIds: g.vertexIds.filter((id: unknown) => typeof id === 'string' && allVertexIds.has(id)) }))
      .filter(g => g.vertexIds.length > 1),
    layers,
    snapAxes: arr(d.snapAxes)
      .filter(a => a && typeof a.id === 'string' && [a.x1, a.y1, a.x2, a.y2].every(n => Number.isFinite(Number(n))))
      .map(a => ({ id: a.id, x1: Number(a.x1), y1: Number(a.y1), x2: Number(a.x2), y2: Number(a.y2) })),
    referenceImages: arr(d.referenceImages)
      .filter(r => r && typeof r.id === 'string' && typeof r.assetId === 'string')
      .map(r => ({
        id: r.id, assetId: r.assetId, name: str(r.name, 'Image'),
        x: num(r.x, 0), y: num(r.y, 0), width: Math.max(1, num(r.width, 400)), height: Math.max(1, num(r.height, 300)),
      })),
    notes: str(d.notes, ''),
  };
};

// --- Graph edits (each returns a new document) ------------------------------------

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const edgeExists = (doc: VectorDoc, v1: string, v2: string) => doc.edges.some(e => edgeKey(e.v1, e.v2) === edgeKey(v1, v2));

export const addVertex = (doc: VectorDoc, p: Pt): { doc: VectorDoc; id: string } => {
  const v = { id: uid(), x: p.x, y: p.y };
  return { doc: { ...doc, vertices: [...doc.vertices, v] }, id: v.id };
};

/** No-op (ok: false) for self-loops or a pair that's already connected. */
export const addEdge = (doc: VectorDoc, v1: string, v2: string, style: Stroke, layerId: string) => {
  if (v1 === v2 || edgeExists(doc, v1, v2)) return { doc, ok: false };
  return { doc: { ...doc, edges: [...doc.edges, { id: uid(), v1, v2, style: { ...style }, layerId }] }, ok: true };
};

/** `positions` maps vertex id → new absolute position. */
export const moveVertices = (doc: VectorDoc, positions: Map<string, Pt>): VectorDoc =>
  positions.size ? { ...doc, vertices: doc.vertices.map(v => (positions.has(v.id) ? { ...v, ...positions.get(v.id)! } : v)) } : doc;

/** Splits an edge at `point`; both halves keep the original style. */
export const subdivideEdge = (doc: VectorDoc, edgeId: string, point: Pt): { doc: VectorDoc; id: string | null } => {
  const edge = doc.edges.find(e => e.id === edgeId);
  if (!edge) return { doc, id: null };
  const v = { id: uid(), x: point.x, y: point.y };
  return {
    id: v.id,
    doc: pruneFills({
      ...doc,
      vertices: [...doc.vertices, v],
      edges: [
        ...doc.edges.filter(e => e.id !== edgeId),
        { ...edge, id: uid(), v2: v.id },
        { ...edge, id: uid(), v1: v.id },
      ],
    }),
  };
};

/** Drops an existing vertex onto an edge, making it the split point. */
export const bindVertexOntoEdge = (doc: VectorDoc, edgeId: string, vertexId: string): VectorDoc => {
  const edge = doc.edges.find(e => e.id === edgeId);
  if (!edge || edge.v1 === vertexId || edge.v2 === vertexId) return doc;
  let next: VectorDoc = { ...doc, edges: doc.edges.filter(e => e.id !== edgeId) };
  next = addEdge(next, edge.v1, vertexId, edge.style, edge.layerId).doc;
  return pruneFills(addEdge(next, vertexId, edge.v2, edge.style, edge.layerId).doc);
};

/** Detaches one endpoint of one edge onto a new vertex (Alt-drag tear-away). */
export const severEdgeEndpoint = (doc: VectorDoc, edgeId: string, vertexId: string, point: Pt) => {
  const v = { id: uid(), x: point.x, y: point.y };
  return {
    id: v.id,
    doc: pruneFills({
      ...doc,
      vertices: [...doc.vertices, v],
      edges: doc.edges.map(e => (e.id === edgeId ? { ...e, v1: e.v1 === vertexId ? v.id : e.v1, v2: e.v2 === vertexId ? v.id : e.v2 } : e)),
    }),
  };
};

/**
 * Takes a vertex out of its path: a dead end loses its edge; a through-point
 * (A–V–C) is bypassed by a direct A–C edge. Undefined for 3+ edges.
 */
export const disconnectVertex = (doc: VectorDoc, vertexId: string): VectorDoc => {
  const incident = doc.edges.filter(e => e.v1 === vertexId || e.v2 === vertexId);
  if (incident.length === 0 || incident.length > 2) return doc;
  const without = doc.edges.filter(e => !incident.includes(e));
  if (incident.length === 1) return pruneFills({ ...doc, edges: without });
  const [e1, e2] = incident;
  const a = e1.v1 === vertexId ? e1.v2 : e1.v1;
  const c = e2.v1 === vertexId ? e2.v2 : e2.v1;
  const next: VectorDoc = { ...doc, edges: without };
  return pruneFills(a === c ? next : addEdge(next, a, c, e2.style, e2.layerId).doc);
};

/** Splits a shared vertex into one coincident vertex per edge, ready to drag apart. */
export const splitVertex = (doc: VectorDoc, vertexId: string): { doc: VectorDoc; ids: string[] } => {
  const v = doc.vertices.find(x => x.id === vertexId);
  const incident = doc.edges.filter(e => e.v1 === vertexId || e.v2 === vertexId);
  if (!v || incident.length < 2) return { doc, ids: [] };
  const fresh: Vertex[] = [];
  let edges = doc.edges;
  for (const edge of incident.slice(1)) {
    const nv = { id: uid(), x: v.x, y: v.y };
    fresh.push(nv);
    edges = edges.map(e => (e.id === edge.id ? { ...e, v1: e.v1 === vertexId ? nv.id : e.v1, v2: e.v2 === vertexId ? nv.id : e.v2 } : e));
  }
  return { doc: pruneFills({ ...doc, vertices: [...doc.vertices, ...fresh], edges }), ids: fresh.map(x => x.id) };
};

/** Folds `removeId` into `keepId`, dropping self-loops and duplicate edges. */
export const mergeVertexInto = (doc: VectorDoc, keepId: string, removeId: string): VectorDoc => {
  if (keepId === removeId) return doc;
  const remap = (id: string) => (id === removeId ? keepId : id);
  const seen = new Set<string>();
  const edges = doc.edges
    .map(e => ({ ...e, v1: remap(e.v1), v2: remap(e.v2) }))
    .filter(e => {
      if (e.v1 === e.v2) return false;
      const key = edgeKey(e.v1, e.v2);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return pruneFills({
    ...doc,
    vertices: doc.vertices.filter(v => v.id !== removeId),
    edges,
    texts: doc.texts.map(t => ({ ...t, v1: remap(t.v1), v2: remap(t.v2), v3: remap(t.v3), v4: remap(t.v4) })),
    groups: doc.groups.map(g => ({ ...g, vertexIds: [...new Set(g.vertexIds.map(remap))] })).filter(g => g.vertexIds.length > 1),
  });
};

/** Merges any of `ids` that now sit exactly on another vertex. */
export const mergeCoincidentVertices = (doc: VectorDoc, ids: Iterable<string>): VectorDoc => {
  let next = doc;
  for (const id of ids) {
    const v = next.vertices.find(x => x.id === id);
    if (!v) continue;
    const dupe = next.vertices.find(x => x.id !== id && Math.abs(x.x - v.x) < 0.01 && Math.abs(x.y - v.y) < 0.01);
    if (dupe) next = mergeVertexInto(next, dupe.id, id);
  }
  return next;
};

/** Drops fills whose boundary references a vertex/edge that no longer exists. */
export const pruneFills = (doc: VectorDoc): VectorDoc => {
  const vIds = new Set(doc.vertices.map(v => v.id));
  const eIds = new Set(doc.edges.map(e => e.id));
  const fills = doc.fills.filter(f => boundaryReferencesOnly(f.boundary, vIds, eIds));
  return fills.length === doc.fills.length ? doc : { ...doc, fills };
};

/** Deletes vertices and everything that depended on them (edges, texts, fills). */
export const deleteVertices = (doc: VectorDoc, ids: Set<string>): VectorDoc => {
  if (!ids.size) return doc;
  const { adj } = buildVertexAdjacency(doc.vertices, doc.edges);
  const doomed = new Set<string>();
  for (const id of ids) for (const he of adj.get(id) || []) doomed.add(he.edgeId);
  return pruneFills({
    ...doc,
    vertices: doc.vertices.filter(v => !ids.has(v.id)),
    edges: doc.edges.filter(e => !doomed.has(e.id)),
    texts: doc.texts.filter(t => ![t.v1, t.v2, t.v3, t.v4].some(id => ids.has(id))),
    groups: doc.groups.map(g => ({ ...g, vertexIds: g.vertexIds.filter(id => !ids.has(id)) })).filter(g => g.vertexIds.length > 1),
  });
};

export interface ItemIds { edgeIds?: Set<string>; circleIds?: Set<string>; fillIds?: Set<string>; textIds?: Set<string>; vertexIds?: Set<string>; axisIds?: Set<string> }

/** Deletes a mixed selection in one step. */
export const deleteItems = (doc: VectorDoc, ids: ItemIds): VectorDoc => {
  let next = doc;
  if (ids.edgeIds?.size) next = pruneFills({ ...next, edges: next.edges.filter(e => !ids.edgeIds!.has(e.id)) });
  if (ids.circleIds?.size) next = { ...next, circles: next.circles.filter(c => !ids.circleIds!.has(c.id)) };
  if (ids.fillIds?.size) next = { ...next, fills: next.fills.filter(f => !ids.fillIds!.has(f.id)) };
  if (ids.axisIds?.size) next = { ...next, snapAxes: next.snapAxes.filter(a => !ids.axisIds!.has(a.id)) };
  const vertexIds = new Set(ids.vertexIds || []);
  for (const t of next.texts) if (ids.textIds?.has(t.id)) [t.v1, t.v2, t.v3, t.v4].forEach(id => vertexIds.add(id));
  return deleteVertices(next, vertexIds);
};

// --- Groups ----------------------------------------------------------------------

/** A vertex belongs to at most one group, so grouping pulls it out of any other. */
export const groupVertices = (doc: VectorDoc, ids: Set<string>): VectorDoc => {
  if (ids.size < 2) return doc;
  const groups = doc.groups.map(g => ({ ...g, vertexIds: g.vertexIds.filter(id => !ids.has(id)) })).filter(g => g.vertexIds.length > 1);
  return { ...doc, groups: [...groups, { id: uid(), vertexIds: [...ids] }] };
};

export const ungroupVertices = (doc: VectorDoc, ids: Set<string>): VectorDoc =>
  ({ ...doc, groups: doc.groups.filter(g => !g.vertexIds.every(id => ids.has(id))) });

export const groupOf = (doc: VectorDoc, vertexId: string) => doc.groups.find(g => g.vertexIds.includes(vertexId)) || null;

export const isExactlyOneGroup = (doc: VectorDoc, ids: Set<string>) =>
  ids.size > 1 && doc.groups.some(g => g.vertexIds.length === ids.size && g.vertexIds.every(id => ids.has(id)));

// --- Fills ------------------------------------------------------------------------

export const isPointInFill = (p: Pt, resolved: ResolvedFill) =>
  pointInPolygon(p, resolved.outer) && !resolved.holes.some(h => pointInPolygon(p, h));

/**
 * Flood-fills the smallest region around `point`, using only the layer's own
 * edges. Re-filling the same region recolors it; filling a smaller shape that
 * sits inside a filled one adds a fill on top instead of replacing the outer.
 */
export const addFillAt = (doc: VectorDoc, point: Pt, color: string, layerId: string) => {
  const boundary = findFillBoundary(doc.vertices, doc.edges.filter(e => e.layerId === layerId), point);
  if (!boundary) return { doc, ok: false };
  const fresh = resolveBoundaryPolygon(doc.vertices, doc.edges, boundary);
  const area = fresh ? polygonArea(fresh.outer) : 0;
  const fills = doc.fills.filter(f => {
    if (f.layerId !== layerId) return true;
    const resolved = resolveBoundaryPolygon(doc.vertices, doc.edges, f.boundary);
    if (!resolved || !isPointInFill(point, resolved)) return true;
    return Math.abs(polygonArea(resolved.outer) - area) > Math.max(1, area * 0.005);
  });
  return { doc: { ...doc, fills: [...fills, { id: uid(), boundary, color, layerId }] }, ok: true };
};

// --- Text ------------------------------------------------------------------------

export const addText = (doc: VectorDoc, corners: Pt[], style: typeof DEFAULT_TEXT_STYLE, layerId: string) => {
  const vs = corners.map(p => ({ id: uid(), x: p.x, y: p.y }));
  const text: VText = { id: uid(), v1: vs[0].id, v2: vs[1].id, v3: vs[2].id, v4: vs[3].id, content: '', ...style, layerId };
  return { doc: { ...doc, vertices: [...doc.vertices, ...vs], texts: [...doc.texts, text] }, id: text.id };
};

export const textCornerIds = (t: VText) => [t.v1, t.v2, t.v3, t.v4];

export const resolveTextQuad = (vmap: Map<string, Pt>, t: VText): Pt[] | null => {
  const corners = textCornerIds(t).map(id => vmap.get(id));
  return corners.every(Boolean) ? (corners as Pt[]) : null;
};

// --- Layers ------------------------------------------------------------------------

export const addLayer = (doc: VectorDoc) => {
  const layer = newLayer(`Layer ${doc.layers.length + 1}`);
  return { doc: { ...doc, layers: [...doc.layers, layer] }, id: layer.id };
};

/** Removes a layer and its content; the last layer can't be removed. */
export const removeLayer = (doc: VectorDoc, layerId: string): VectorDoc => {
  if (doc.layers.length <= 1) return doc;
  const textIds = new Set(doc.texts.filter(t => t.layerId === layerId).map(t => t.id));
  const next = deleteItems(doc, { textIds });
  return pruneFills({
    ...next,
    layers: next.layers.filter(l => l.id !== layerId),
    edges: next.edges.filter(e => e.layerId !== layerId),
    circles: next.circles.filter(c => c.layerId !== layerId),
    fills: next.fills.filter(f => f.layerId !== layerId),
  });
};

export const updateLayer = (doc: VectorDoc, layerId: string, patch: Partial<VLayer>): VectorDoc =>
  ({ ...doc, layers: doc.layers.map(l => (l.id === layerId ? { ...l, ...patch } : l)) });

/** Swaps a layer with its neighbor; `dir` 1 = up (towards the top). */
export const reorderLayer = (doc: VectorDoc, layerId: string, dir: 1 | -1): VectorDoc => {
  const i = doc.layers.findIndex(l => l.id === layerId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= doc.layers.length) return doc;
  const layers = doc.layers.slice();
  [layers[i], layers[j]] = [layers[j], layers[i]];
  return { ...doc, layers };
};

type Layered = 'edges' | 'circles' | 'texts' | 'fills';
const LAYERED: [Layered, keyof ItemIds][] = [['edges', 'edgeIds'], ['circles', 'circleIds'], ['texts', 'textIds'], ['fills', 'fillIds']];

/** Moves each item one layer up/down from its own layer, clamped to the stack. */
export const shiftLayers = (doc: VectorDoc, ids: ItemIds, dir: 1 | -1): VectorDoc => {
  const index = new Map(doc.layers.map((l, i) => [l.id, i]));
  const last = doc.layers.length - 1;
  const target = (layerId: string) => doc.layers[Math.min(last, Math.max(0, (index.get(layerId) ?? 0) + dir))].id;
  const next = { ...doc } as any;
  for (const [key, idKey] of LAYERED) {
    next[key] = (doc[key] as { id: string; layerId: string }[]).map(o => (ids[idKey]?.has(o.id) ? { ...o, layerId: target(o.layerId) } : o));
  }
  return next as VectorDoc;
};

/** Moves items onto one specific layer. */
export const moveToLayer = (doc: VectorDoc, ids: ItemIds, layerId: string): VectorDoc => {
  const next = { ...doc } as any;
  for (const [key, idKey] of LAYERED) {
    next[key] = (doc[key] as { id: string; layerId: string }[]).map(o => (ids[idKey]?.has(o.id) ? { ...o, layerId } : o));
  }
  return next as VectorDoc;
};

export const canShiftLayers = (doc: VectorDoc, ids: ItemIds, dir: 1 | -1) => {
  const index = new Map(doc.layers.map((l, i) => [l.id, i]));
  const last = doc.layers.length - 1;
  return LAYERED.some(([key, idKey]) => (doc[key] as { id: string; layerId: string }[]).some(o => {
    const i = index.get(o.layerId) ?? 0;
    return ids[idKey]?.has(o.id) && (dir > 0 ? i < last : i > 0);
  }));
};

// --- Clipboard -------------------------------------------------------------------

export interface VectorClipboard { vertices: Vertex[]; edges: VEdge[]; circles: VCircle[]; texts: VText[]; groups: VGroup[] }

/** Edges/texts are copied only when every vertex they depend on is selected. */
export const copySelection = (doc: VectorDoc, vertexIds: Set<string>, circleIds: Set<string>): VectorClipboard => ({
  vertices: doc.vertices.filter(v => vertexIds.has(v.id)),
  edges: doc.edges.filter(e => vertexIds.has(e.v1) && vertexIds.has(e.v2)),
  circles: doc.circles.filter(c => circleIds.has(c.id)),
  texts: doc.texts.filter(t => textCornerIds(t).every(id => vertexIds.has(id))),
  groups: doc.groups.filter(g => g.vertexIds.every(id => vertexIds.has(id))),
});

/** Adds a fresh copy (new ids) of a clipboard, offset and placed on `layerId`. */
export const pasteClipboard = (doc: VectorDoc, clip: VectorClipboard, offset: Pt, layerId: string) => {
  const idMap = new Map<string, string>();
  const vertices = clip.vertices.map(v => {
    const id = uid();
    idMap.set(v.id, id);
    return { id, x: v.x + offset.x, y: v.y + offset.y };
  });
  const map = (id: string) => idMap.get(id)!;
  const circles = clip.circles.map(c => ({ ...c, id: uid(), cx: c.cx + offset.x, cy: c.cy + offset.y, layerId }));
  return {
    doc: {
      ...doc,
      vertices: [...doc.vertices, ...vertices],
      edges: [...doc.edges, ...clip.edges.map(e => ({ ...e, id: uid(), v1: map(e.v1), v2: map(e.v2), layerId }))],
      circles: [...doc.circles, ...circles],
      texts: [...doc.texts, ...clip.texts.map(t => ({ ...t, id: uid(), v1: map(t.v1), v2: map(t.v2), v3: map(t.v3), v4: map(t.v4), layerId }))],
      groups: [...doc.groups, ...clip.groups.map(g => ({ id: uid(), vertexIds: g.vertexIds.map(map) }))],
    },
    vertexIds: vertices.map(v => v.id),
    circleIds: circles.map(c => c.id),
  };
};

// --- Color helpers ---------------------------------------------------------------------

/** Splits '#rrggbb' / '#rrggbbaa' / 'transparent' into hex + opacity percent. */
export const colorAlphaParts = (color: string) => {
  if (!color || color === 'transparent' || color === 'none') return { hex6: '#000000', alphaPct: 0 };
  const raw = color.replace('#', '');
  if (raw.length === 8) return { hex6: `#${raw.slice(0, 6)}`, alphaPct: Math.round((parseInt(raw.slice(6, 8), 16) / 255) * 100) };
  if (raw.length === 6) return { hex6: `#${raw}`, alphaPct: 100 };
  if (raw.length === 3) return { hex6: `#${raw.split('').map(c => c + c).join('')}`, alphaPct: 100 };
  return { hex6: '#000000', alphaPct: 100 };
};

export const withAlpha = (hex6: string, alphaPct: number) => {
  const pct = Math.max(0, Math.min(100, Number.isFinite(alphaPct) ? alphaPct : 100));
  if (pct <= 0) return 'transparent';
  if (pct >= 100) return hex6;
  return `${hex6}${Math.round((pct / 100) * 255).toString(16).padStart(2, '0')}`;
};

/** Black or white, whichever reads better on `background` (for the dot grid). */
export const contrastColor = (background: string) => {
  const { hex6, alphaPct } = colorAlphaParts(background);
  if (alphaPct < 40) return null;
  const n = parseInt(hex6.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? '#000000' : '#ffffff';
};

// --- Export ------------------------------------------------------------------------

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const loopsToPathData = (loops: Pt[][]) =>
  loops.filter(l => l.length >= 3).map(l => `M ${l.map(p => `${p.x} ${p.y}`).join(' L ')} Z`).join(' ');

const TEXT_JUSTIFY: Record<TextValign, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

/**
 * Standalone SVG. Per visible layer, bottom to top: fills, circles, texts,
 * edges (lighter strokes first) and miter wedges. `rasterSafe` swaps the
 * HTML text boxes for plain SVG text, since a foreignObject taints a canvas.
 */
export const toSvg = (doc: VectorDoc, opts: { rasterSafe?: boolean } = {}): string => {
  const { width, height, background } = doc.canvas;
  const vmap = new Map<string, Pt>(doc.vertices.map(v => [v.id, v]));
  const parts: string[] = [];
  if (background && background !== 'transparent') parts.push(`<rect width="${width}" height="${height}" fill="${esc(background)}"/>`);
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    const edges = doc.edges.filter(e => e.layerId === layer.id);
    for (const f of doc.fills) {
      if (f.layerId !== layer.id) continue;
      const resolved = resolveBoundaryPolygon(doc.vertices, doc.edges, f.boundary);
      if (resolved) parts.push(`<path d="${loopsToPathData([resolved.outer, ...resolved.holes])}" fill="${esc(f.color)}" fill-rule="evenodd"/>`);
    }
    for (const c of doc.circles) {
      if (c.layerId !== layer.id) continue;
      parts.push(`<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${esc(c.fill || 'none')}" stroke="${esc(c.style.color)}" stroke-width="${c.style.thickness}"/>`);
    }
    for (const t of doc.texts) {
      if (t.layerId !== layer.id || !t.content) continue;
      const quad = resolveTextQuad(vmap, t);
      if (!quad) continue;
      if (opts.rasterSafe) {
        // Affine approximation of the quad (exact unless the box was skewed into a trapezoid).
        const [p0, p1, , p3] = quad;
        const m = [(p1.x - p0.x) / TEXT_BOX.width, (p1.y - p0.y) / TEXT_BOX.width, (p3.x - p0.x) / TEXT_BOX.height, (p3.y - p0.y) / TEXT_BOX.height, p0.x, p0.y];
        const lines = t.content.split('\n');
        const lh = t.fontSize * 1.25;
        const block = lines.length * lh;
        const top = t.valign === 'top' ? 0 : t.valign === 'middle' ? (TEXT_BOX.height - block) / 2 : TEXT_BOX.height - block;
        const x = t.align === 'left' ? 0 : t.align === 'center' ? TEXT_BOX.width / 2 : TEXT_BOX.width;
        const anchor = t.align === 'left' ? 'start' : t.align === 'center' ? 'middle' : 'end';
        const tspans = lines.map((line, i) => `<tspan x="${x}" y="${top + i * lh + t.fontSize}">${esc(line)}</tspan>`).join('');
        parts.push(`<g transform="matrix(${m.join(' ')})"><text font-family="sans-serif" font-size="${t.fontSize}" fill="${esc(t.color)}" text-anchor="${anchor}">${tspans}</text></g>`);
      } else {
        const matrix = computeQuadWarpMatrix3d(quad, TEXT_BOX.width, TEXT_BOX.height);
        const style = `width:${TEXT_BOX.width}px;height:${TEXT_BOX.height}px;transform:${matrix};transform-origin:0 0;color:${t.color};font-size:${t.fontSize}px;text-align:${t.align};display:flex;flex-direction:column;justify-content:${TEXT_JUSTIFY[t.valign]};white-space:pre-wrap;overflow-wrap:break-word;font-family:sans-serif;line-height:1.25;`;
        parts.push(`<foreignObject x="0" y="0" width="${width}" height="${height}" overflow="visible"><div xmlns="http://www.w3.org/1999/xhtml" style="${esc(style)}">${esc(t.content)}</div></foreignObject>`);
      }
    }
    for (const e of [...edges].sort((a, b) => a.style.thickness - b.style.thickness)) {
      const a = vmap.get(e.v1), b = vmap.get(e.v2);
      if (a && b) parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${esc(e.style.color)}" stroke-width="${e.style.thickness}"/>`);
    }
    for (const j of computeMiterJoints(doc.vertices, edges)) {
      parts.push(`<polygon points="${j.points.map(p => `${p.x},${p.y}`).join(' ')}" fill="${esc(j.color)}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
};
