// Vector topology engine — pure functions over the {vertices, edges} graph of
// a vector document (see vectorModel.ts). Ported from store-app's .vec editor.
//
// Adjacency and faces are rebuilt on demand rather than kept as a live
// half-edge structure: for an art document (tens to a few hundred vertices)
// an O(V log V + E) rebuild per edit is cheap and avoids pointer upkeep.

export interface Pt { x: number; y: number }
export interface GVertex extends Pt { id: string }
export interface GEdge { id: string; v1: string; v2: string }

/** One point of a fill boundary: a real vertex, or the crossing of two edges. */
export type BoundaryComponent =
  | { type: 'vertex'; id: string }
  | { type: 'crossing'; edgeA: string; edgeB: string };
export interface FillBoundary { outer: BoundaryComponent[]; holes: BoundaryComponent[][] }
export interface ResolvedFill { outer: Pt[]; holes: Pt[][] }

// --- Spatial index -----------------------------------------------------------

/** Uniform grid buckets so snapping doesn't scan every vertex per pointer move. */
export class SpatialGrid {
  private buckets = new Map<string, Set<string>>();
  constructor(private cellSize = 80) {}

  private cell(x: number, y: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)];
  }

  rebuild(vertices: GVertex[]) {
    this.buckets.clear();
    for (const v of vertices) {
      const key = this.cell(v.x, v.y).join(',');
      if (!this.buckets.has(key)) this.buckets.set(key, new Set());
      this.buckets.get(key)!.add(v.id);
    }
  }

  /** Ids in cells overlapping the circle — callers do the exact distance check. */
  queryRadius(x: number, y: number, radius: number): string[] {
    const [minCx, minCy] = this.cell(x - radius, y - radius);
    const [maxCx, maxCy] = this.cell(x + radius, y + radius);
    const out: string[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.buckets.get(`${cx},${cy}`);
        if (bucket) for (const id of bucket) out.push(id);
      }
    }
    return out;
  }
}

// --- Basic geometry ------------------------------------------------------------

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export const closestPointOnSegment = (p: Pt, a: Pt, b: Pt) => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq)) : 0;
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  return { point, t, dist: dist(p, point) };
};

export const pointInPolygon = (p: Pt, poly: Pt[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

export const polygonArea = (poly: Pt[]) => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return Math.abs(a) / 2;
};

/** Proper crossing of two segments; endpoint touches are not crossings. */
export const segmentIntersection = (a1: Pt, a2: Pt, b1: Pt, b2: Pt) => {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: a1.x + d1x * t, y: a1.y + d1y * t, t, u };
};

/** Intersection of two infinite lines, or null when parallel. */
export const lineIntersection = (p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null => {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
};

const projectOntoLine = (point: Pt, p1: Pt, p2: Pt) => {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return null;
  const t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lenSq;
  const proj = { x: p1.x + t * dx, y: p1.y + t * dy };
  return { point: proj, distance: dist(point, proj) };
};

// --- Adjacency & faces ---------------------------------------------------------

export interface HalfEdge { to: string; edgeId: string }

/** Neighbors of every vertex, sorted by angle — the basis of face tracing. */
export const buildVertexAdjacency = (vertices: GVertex[], edges: GEdge[]) => {
  const vmap = new Map(vertices.map(v => [v.id, v]));
  const adj = new Map<string, HalfEdge[]>();
  for (const v of vertices) adj.set(v.id, []);
  for (const e of edges) {
    if (!adj.has(e.v1) || !adj.has(e.v2)) continue;
    adj.get(e.v1)!.push({ to: e.v2, edgeId: e.id });
    adj.get(e.v2)!.push({ to: e.v1, edgeId: e.id });
  }
  for (const [id, list] of adj) {
    const v = vmap.get(id)!;
    const angle = (he: HalfEdge) => { const o = vmap.get(he.to)!; return Math.atan2(o.y - v.y, o.x - v.x); };
    list.sort((a, b) => angle(a) - angle(b));
  }
  return { vmap, adj };
};

/** Walks every directed half-edge once, yielding every face (inner and outer). */
const traceFaces = (vertices: GVertex[], edges: GEdge[]) => {
  const { vmap, adj } = buildVertexAdjacency(vertices, edges);
  const visited = new Set<string>();
  const faces: { vertexIds: string[]; points: Pt[] }[] = [];
  const guardLimit = vertices.length + edges.length * 2 + 8;
  for (const e of edges) {
    for (const [u0, v0] of [[e.v1, e.v2], [e.v2, e.v1]]) {
      if (visited.has(`${u0}->${v0}`)) continue;
      const vertexIds: string[] = [];
      let u = u0, v = v0;
      for (let steps = 0; steps < guardLimit; steps++) {
        const key = `${u}->${v}`;
        if (visited.has(key)) break;
        visited.add(key);
        vertexIds.push(v);
        const list = adj.get(v) || [];
        const twin = list.findIndex(he => he.to === u);
        if (twin === -1) break;
        u = v;
        v = list[(twin + 1) % list.length].to;
        if (u === u0 && v === v0) break;
      }
      if (vertexIds.length >= 3) faces.push({ vertexIds, points: vertexIds.map(id => vmap.get(id)!) });
    }
  }
  return faces;
};

/**
 * Edges that visually cross without sharing a vertex count as connected for
 * fills only: this builds a throwaway graph split at every crossing.
 */
const planarizeForFill = (vertices: GVertex[], edges: GEdge[]) => {
  const vmap = new Map(vertices.map(v => [v.id, v]));
  const crossingsByEdge = new Map<string, { t: number; synId: number }[]>(edges.map(e => [e.id, []]));
  const synPoints: Pt[] = [];
  const synSources: [string, string][] = [];
  const findOrAdd = (pt: Pt, a: string, b: string) => {
    const i = synPoints.findIndex(p => Math.abs(p.x - pt.x) < 0.5 && Math.abs(p.y - pt.y) < 0.5);
    if (i >= 0) return i;
    synPoints.push({ x: pt.x, y: pt.y });
    synSources.push([a, b]);
    return synPoints.length - 1;
  };
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const ea = edges[i], eb = edges[j];
      if (ea.v1 === eb.v1 || ea.v1 === eb.v2 || ea.v2 === eb.v1 || ea.v2 === eb.v2) continue;
      const a1 = vmap.get(ea.v1), a2 = vmap.get(ea.v2), b1 = vmap.get(eb.v1), b2 = vmap.get(eb.v2);
      if (!a1 || !a2 || !b1 || !b2) continue;
      const hit = segmentIntersection(a1, a2, b1, b2);
      if (!hit) continue;
      const synId = findOrAdd(hit, ea.id, eb.id);
      crossingsByEdge.get(ea.id)!.push({ t: hit.t, synId });
      crossingsByEdge.get(eb.id)!.push({ t: hit.u, synId });
    }
  }
  const sourceEdges = new Map<string, [string, string]>();
  if (!synPoints.length) return { vertices, edges, sourceEdges };

  const pVertices = vertices.slice();
  const synIds = synPoints.map((pt, i) => {
    const id = `__syn_${i}`;
    pVertices.push({ id, ...pt });
    sourceEdges.set(id, synSources[i]);
    return id;
  });
  const pEdges: GEdge[] = [];
  let n = 0;
  for (const e of edges) {
    const crossings = crossingsByEdge.get(e.id)!;
    if (!crossings.length) { pEdges.push(e); continue; }
    crossings.sort((a, b) => a.t - b.t);
    let prev = e.v1;
    for (const c of crossings) {
      const id = synIds[c.synId];
      if (id !== prev) pEdges.push({ id: `__split_${n++}`, v1: prev, v2: id });
      prev = id;
    }
    if (prev !== e.v2) pEdges.push({ id: `__split_${n++}`, v1: prev, v2: e.v2 });
  }
  return { vertices: pVertices, edges: pEdges, sourceEdges };
};

const connectedComponents = (vertices: GVertex[], edges: GEdge[]) => {
  const parent = new Map(vertices.map(v => [v.id, v.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (const e of edges) {
    if (!parent.has(e.v1) || !parent.has(e.v2)) continue;
    const a = find(e.v1), b = find(e.v2);
    if (a !== b) parent.set(a, b);
  }
  const byRoot = new Map<string, Set<string>>();
  for (const v of vertices) {
    const r = find(v.id);
    if (!byRoot.has(r)) byRoot.set(r, new Set());
    byRoot.get(r)!.add(v.id);
  }
  return [...byRoot.values()];
};

/**
 * The smallest face containing `point`, as a structural boundary (vertex ids
 * and edge-crossing pairs) so the fill tracks the shape as it's edited. Any
 * disconnected shape fully inside becomes a hole (a ring's cutout, an "O").
 */
export const findFillBoundary = (vertices: GVertex[], edges: GEdge[], point: Pt): FillBoundary | null => {
  const { vertices: pv, edges: pe, sourceEdges } = planarizeForFill(vertices, edges);
  const faces = traceFaces(pv, pe);
  let best: (typeof faces)[number] | null = null;
  let bestArea = Infinity;
  for (const f of faces) {
    if (!pointInPolygon(point, f.points)) continue;
    const area = polygonArea(f.points);
    if (area < bestArea) { bestArea = area; best = f; }
  }
  if (!best) return null;
  const outerFace = best;
  const toSpec = (f: { vertexIds: string[] }): BoundaryComponent[] => f.vertexIds.map(id => {
    const crossing = sourceEdges.get(id);
    return crossing ? { type: 'crossing', edgeA: crossing[0], edgeB: crossing[1] } : { type: 'vertex', id };
  });

  const pvMap = new Map(pv.map(v => [v.id, v]));
  const components = connectedComponents(pv, pe);
  const own = components.find(c => outerFace.vertexIds.some(id => c.has(id)));
  const holes: BoundaryComponent[][] = [];
  for (const comp of components) {
    if (comp === own) continue;
    const pts = [...comp].map(id => pvMap.get(id)).filter((p): p is GVertex => !!p);
    if (!pts.length || !pts.every(p => pointInPolygon(p, outerFace.points))) continue;
    let hole: (typeof faces)[number] | null = null;
    let holeArea = Infinity;
    for (const f of faces) {
      if (!f.vertexIds.every(id => comp.has(id))) continue;
      const area = polygonArea(f.points);
      if (area < holeArea) { holeArea = area; hole = f; }
    }
    if (hole) holes.push(toSpec(hole));
  }
  return { outer: toSpec(outerFace), holes };
};

const resolveLoop = (vmap: Map<string, Pt>, emap: Map<string, GEdge>, loop: BoundaryComponent[]): Pt[] | null => {
  const points: Pt[] = [];
  for (const c of loop) {
    if (c.type === 'vertex') {
      const v = vmap.get(c.id);
      if (!v) return null;
      points.push({ x: v.x, y: v.y });
    } else {
      const ea = emap.get(c.edgeA), eb = emap.get(c.edgeB);
      if (!ea || !eb) return null;
      const a1 = vmap.get(ea.v1), a2 = vmap.get(ea.v2), b1 = vmap.get(eb.v1), b2 = vmap.get(eb.v2);
      if (!a1 || !a2 || !b1 || !b2) return null;
      const hit = segmentIntersection(a1, a2, b1, b2);
      if (!hit) return null;
      points.push({ x: hit.x, y: hit.y });
    }
  }
  return points;
};

/** Concrete polygons for a boundary from the current geometry; null if the outer loop is gone. */
export const resolveBoundaryPolygon = (vertices: GVertex[], edges: GEdge[], boundary: FillBoundary): ResolvedFill | null => {
  const vmap = new Map<string, Pt>(vertices.map(v => [v.id, v]));
  const emap = new Map(edges.map(e => [e.id, e]));
  const outer = resolveLoop(vmap, emap, boundary.outer);
  if (!outer) return null;
  const holes = boundary.holes.map(h => resolveLoop(vmap, emap, h)).filter((h): h is Pt[] => !!h);
  return { outer, holes };
};

/** True if every vertex/edge the boundary depends on still exists. */
export const boundaryReferencesOnly = (boundary: FillBoundary, vertexIds: Set<string>, edgeIds: Set<string>) => {
  const ok = (loop: BoundaryComponent[]) =>
    loop.every(c => (c.type === 'vertex' ? vertexIds.has(c.id) : edgeIds.has(c.edgeA) && edgeIds.has(c.edgeB)));
  return ok(boundary.outer) && boundary.holes.every(ok);
};

// --- Rendering helpers -----------------------------------------------------------

interface StyledEdge extends GEdge { style: { color: string; thickness: number } }

/**
 * Bevel wedges that plug the butt-cap notch where exactly two equal-weight
 * edges meet, so the corner reads as one continuous stroke.
 */
export const computeMiterJoints = (vertices: GVertex[], edges: StyledEdge[]) => {
  const vmap = new Map(vertices.map(v => [v.id, v]));
  const byVertex = new Map<string, StyledEdge[]>();
  for (const e of edges) {
    for (const id of [e.v1, e.v2]) {
      if (!byVertex.has(id)) byVertex.set(id, []);
      byVertex.get(id)!.push(e);
    }
  }
  const joints: { vertexId: string; points: Pt[]; color: string }[] = [];
  for (const [vertexId, incident] of byVertex) {
    if (incident.length !== 2) continue;
    const [e1, e2] = incident;
    if (e1.style.thickness !== e2.style.thickness || e1.style.thickness === 0) continue;
    const v = vmap.get(vertexId);
    const o1 = vmap.get(e1.v1 === vertexId ? e1.v2 : e1.v1);
    const o2 = vmap.get(e2.v1 === vertexId ? e2.v2 : e2.v1);
    if (!v || !o1 || !o2) continue;
    const len1 = dist(v, o1), len2 = dist(v, o2);
    if (len1 < 1e-6 || len2 < 1e-6) continue;
    const d1 = { x: (o1.x - v.x) / len1, y: (o1.y - v.y) / len1 };
    const d2 = { x: (o2.x - v.x) / len2, y: (o2.y - v.y) / len2 };
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(cross) < 1e-6) continue;
    const w = e1.style.thickness / 2;
    const n1 = { x: -d1.y, y: d1.x };
    const n2 = { x: -d2.y, y: d2.x };
    const s = cross > 0 ? 1 : -1;
    const gapA = { x: v.x - s * w * n1.x, y: v.y - s * w * n1.y };
    const gapB = { x: v.x + s * w * n2.x, y: v.y + s * w * n2.y };
    const winner = edges.indexOf(e2) > edges.indexOf(e1) ? e2 : e1;
    joints.push({ vertexId, points: [v, gapA, gapB], color: winner.style.color });
  }
  return joints;
};

/**
 * CSS matrix3d homography mapping a width×height box onto four corners
 * (TL, TR, BR, BL) — lets a text box be skewed into any quadrilateral.
 */
export const computeQuadWarpMatrix3d = (corners: Pt[], width: number, height: number) => {
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, sx = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, sy = p0.y - p1.y + p2.y - p3.y;
  let a, b, d, e, g, h;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = p1.x - p0.x; b = p2.x - p1.x;
    d = p1.y - p0.y; e = p2.y - p1.y;
    g = 0; h = 0;
  } else {
    const denom = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / denom;
    h = (dx1 * sy - sx * dy1) / denom;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
  }
  return `matrix3d(${a / width},${d / width},0,${g / width}, ${b / height},${e / height},0,${h / height}, 0,0,1,0, ${p0.x},${p0.y},0,1)`;
};

// --- Snapping ------------------------------------------------------------------------

export interface SnapLine { p1: Pt; p2: Pt }

/** Lines through `anchor` parallel and perpendicular to each reference edge (deduped by angle). */
export const perpendicularParallelLines = (anchor: Pt, referenceEdges: SnapLine[]): SnapLine[] => {
  const seen: number[] = [];
  const lines: SnapLine[] = [];
  for (const { p1, p2 } of referenceEdges) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
    for (const [ex, ey] of [[dx, dy], [-dy, dx]]) {
      const angle = ((Math.atan2(ey, ex) % Math.PI) + Math.PI) % Math.PI;
      if (seen.some(a => Math.abs(a - angle) < 1e-6)) continue;
      seen.push(angle);
      lines.push({ p1: anchor, p2: { x: anchor.x + ex, y: anchor.y + ey } });
    }
  }
  return lines;
};

export interface SnapOptions {
  grid?: SpatialGrid;
  vertexPx: number;
  edgePx: number;
  axisPx: number;
  linePx: number;
  lines?: SnapLine[] | null;
  excludeVertexId?: string | null;
  /** Document-unit grid step; 0 disables grid snapping. */
  gridStep?: number;
}

export interface SnapResult {
  point: Pt;
  snappedVertexId?: string;
  snappedEdgeId?: string;
  lineSnapped?: boolean;
  snapLines?: SnapLine[];
  axisSnapVertexX?: string | null;
  axisSnapVertexY?: string | null;
}

/**
 * Snap priority: an existing vertex, then a point on an edge (which will
 * subdivide it), then guide lines (straighten/extend/axes/perpendicular),
 * then horizontal/vertical alignment with nearby vertices, then the grid.
 */
export const snapCandidate = (vertices: GVertex[], edges: GEdge[], raw: Pt, opts: SnapOptions): SnapResult => {
  const { grid, vertexPx, edgePx, axisPx, linePx, lines, excludeVertexId, gridStep = 0 } = opts;
  const vmap = new Map(vertices.map(v => [v.id, v]));

  if (vertexPx > 0) {
    const near = grid ? grid.queryRadius(raw.x, raw.y, vertexPx) : vertices.map(v => v.id);
    let best: GVertex | null = null;
    let bestD = vertexPx;
    for (const id of near) {
      if (id === excludeVertexId) continue;
      const v = vmap.get(id);
      if (!v) continue;
      const d = dist(raw, v);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (best) return { point: { x: best.x, y: best.y }, snappedVertexId: best.id };
  }

  if (edgePx > 0) {
    let best: { id: string; point: Pt } | null = null;
    let bestD = edgePx;
    for (const e of edges) {
      if (e.v1 === excludeVertexId || e.v2 === excludeVertexId) continue;
      const a = vmap.get(e.v1), b = vmap.get(e.v2);
      if (!a || !b) continue;
      const res = closestPointOnSegment(raw, a, b);
      if (res.dist < bestD) { bestD = res.dist; best = { id: e.id, point: res.point }; }
    }
    if (best) return { point: best.point, snappedEdgeId: best.id };
  }

  if (lines?.length && linePx > 0) {
    const inRange = lines
      .map(line => ({ line, res: projectOntoLine(raw, line.p1, line.p2) }))
      .filter((x): x is { line: SnapLine; res: { point: Pt; distance: number } } => !!x.res && x.res.distance < linePx)
      .sort((a, b) => a.res.distance - b.res.distance);
    if (inRange.length >= 2) {
      const [first, second] = inRange;
      const crossing = lineIntersection(first.line.p1, first.line.p2, second.line.p1, second.line.p2);
      if (crossing && dist(raw, crossing) < linePx) return { point: crossing, lineSnapped: true, snapLines: [first.line, second.line] };
    }
    if (inRange.length) return { point: inRange[0].res.point, lineSnapped: true, snapLines: [inRange[0].line] };
  }

  let x = raw.x, y = raw.y;
  let axisSnapVertexX: string | null = null, axisSnapVertexY: string | null = null;
  if (axisPx > 0) {
    let bestDx = axisPx, bestDy = axisPx;
    for (const v of vertices) {
      if (v.id === excludeVertexId) continue;
      const dx = Math.abs(v.x - raw.x), dy = Math.abs(v.y - raw.y);
      if (dx < bestDx) { bestDx = dx; x = v.x; axisSnapVertexX = v.id; }
      if (dy < bestDy) { bestDy = dy; y = v.y; axisSnapVertexY = v.id; }
    }
  }
  if (gridStep > 0) {
    if (!axisSnapVertexX) x = Math.round(x / gridStep) * gridStep;
    if (!axisSnapVertexY) y = Math.round(y / gridStep) * gridStep;
  }
  return { point: { x, y }, axisSnapVertexX, axisSnapVertexY };
};
