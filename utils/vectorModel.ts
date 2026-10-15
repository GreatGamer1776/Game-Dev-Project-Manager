import { uid } from './id';

// Vector art document — a vertex/edge graph (like store-app's .vec files):
// edges always join two vertices, fills reference the *vertices* of a closed
// region so they follow the shape as it's edited, and circles/text are
// free-standing primitives.

export interface Vertex { id: string; x: number; y: number }
export interface VEdge { id: string; v1: string; v2: string; color: string; thickness: number }
export interface VFill { id: string; boundary: string[]; color: string; opacity: number }
export interface VCircle { id: string; cx: number; cy: number; r: number; color: string; thickness: number; fill: string }
export interface VText { id: string; x: number; y: number; text: string; size: number; color: string }

export interface VectorDoc {
  width: number;
  height: number;
  background: string;
  vertices: Vertex[];
  edges: VEdge[];
  fills: VFill[];
  circles: VCircle[];
  texts: VText[];
}

export const VECTOR_COLORS = ['#e0555a', '#e0a63d', '#d8c34a', '#6fcf97', '#4fb0c6', '#8a6cef', '#dcddde', '#1f1f1f'];
export const VECTOR_THICKNESSES = [0, 1, 2, 3, 5, 8, 12];

export const parseVector = (raw: unknown): VectorDoc => {
  const d = raw && typeof raw === 'object' ? raw as Partial<VectorDoc> : {};
  const vertices = Array.isArray(d.vertices) ? d.vertices.filter(v => v && typeof v.id === 'string') : [];
  const ids = new Set(vertices.map(v => v.id));
  const edges = (Array.isArray(d.edges) ? d.edges : []).filter(e => e && ids.has(e.v1) && ids.has(e.v2));
  return {
    width: Number(d.width) > 0 ? Number(d.width) : 800,
    height: Number(d.height) > 0 ? Number(d.height) : 600,
    background: typeof d.background === 'string' ? d.background : 'transparent',
    vertices,
    edges,
    fills: (Array.isArray(d.fills) ? d.fills : []).filter(f => f && Array.isArray(f.boundary) && f.boundary.every(id => ids.has(id))),
    circles: Array.isArray(d.circles) ? d.circles : [],
    texts: Array.isArray(d.texts) ? d.texts : [],
  };
};

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Adds an edge unless it would be a self-loop or duplicate. */
export const addEdge = (doc: VectorDoc, v1: string, v2: string, color: string, thickness: number): VectorDoc => {
  if (v1 === v2) return doc;
  const key = edgeKey(v1, v2);
  if (doc.edges.some(e => edgeKey(e.v1, e.v2) === key)) return doc;
  return { ...doc, edges: [...doc.edges, { id: uid(), v1, v2, color, thickness }] };
};

/** Drops fills whose boundary lost a vertex or an edge. */
export const pruneFills = (doc: VectorDoc): VectorDoc => {
  const ids = new Set(doc.vertices.map(v => v.id));
  const keys = new Set(doc.edges.map(e => edgeKey(e.v1, e.v2)));
  const fills = doc.fills.filter(f => f.boundary.every((id, i) => ids.has(id) && keys.has(edgeKey(id, f.boundary[(i + 1) % f.boundary.length]))));
  return fills.length === doc.fills.length ? doc : { ...doc, fills };
};

export const signedArea = (pts: { x: number; y: number }[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

export const pointInPolygon = (pt: { x: number; y: number }, poly: { x: number; y: number }[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/**
 * Enumerates the faces of the (assumed planar) vertex/edge graph by walking
 * half-edges, always taking the next edge clockwise. Bounded faces come out
 * with positive signed area; each component's outer face is negative.
 */
export const enumerateFaces = (doc: VectorDoc): string[][] => {
  const pos = new Map(doc.vertices.map(v => [v.id, v]));
  const neighbors = new Map<string, string[]>();
  for (const e of doc.edges) {
    neighbors.set(e.v1, [...(neighbors.get(e.v1) || []), e.v2]);
    neighbors.set(e.v2, [...(neighbors.get(e.v2) || []), e.v1]);
  }
  const angle = (from: string, to: string) => {
    const a = pos.get(from)!;
    const b = pos.get(to)!;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  for (const [v, ns] of neighbors) ns.sort((a, b) => angle(v, a) - angle(v, b));

  const visited = new Set<string>();
  const faces: string[][] = [];
  for (const [u, ns] of neighbors) {
    for (const v of ns) {
      if (visited.has(`${u}>${v}`)) continue;
      const face: string[] = [];
      let a = u;
      let b = v;
      for (let guard = 0; guard < 10000 && !visited.has(`${a}>${b}`); guard++) {
        visited.add(`${a}>${b}`);
        face.push(a);
        const around = neighbors.get(b)!;
        const i = around.indexOf(a);
        // Predecessor of `a` in b's angular order = next edge turning clockwise.
        const next = around[(i - 1 + around.length) % around.length];
        a = b;
        b = next;
      }
      if (face.length >= 3) faces.push(face);
    }
  }
  return faces;
};

/** The smallest bounded face containing `pt`, as vertex ids. */
export const faceAt = (doc: VectorDoc, pt: { x: number; y: number }): string[] | null => {
  const pos = new Map(doc.vertices.map(v => [v.id, v]));
  let best: { face: string[]; area: number } | null = null;
  for (const face of enumerateFaces(doc)) {
    const poly = face.map(id => pos.get(id)!);
    const area = signedArea(poly);
    if (area <= 0 || !pointInPolygon(pt, poly)) continue;
    if (!best || area < best.area) best = { face, area };
  }
  return best?.face ?? null;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Standalone SVG for export. */
export const toSvg = (doc: VectorDoc): string => {
  const pos = new Map(doc.vertices.map(v => [v.id, v]));
  const parts: string[] = [];
  if (doc.background && doc.background !== 'transparent') parts.push(`<rect width="100%" height="100%" fill="${esc(doc.background)}"/>`);
  for (const f of doc.fills) {
    const pts = f.boundary.map(id => pos.get(id)).filter(Boolean).map(p => `${p!.x},${p!.y}`).join(' ');
    parts.push(`<polygon points="${pts}" fill="${esc(f.color)}" fill-opacity="${f.opacity}"/>`);
  }
  for (const e of doc.edges) {
    const a = pos.get(e.v1)!;
    const b = pos.get(e.v2)!;
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${esc(e.color)}" stroke-width="${e.thickness}" stroke-linecap="round"/>`);
  }
  for (const c of doc.circles) {
    parts.push(`<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${esc(c.fill)}" stroke="${esc(c.color)}" stroke-width="${c.thickness}"/>`);
  }
  for (const t of doc.texts) {
    parts.push(`<text x="${t.x}" y="${t.y}" font-family="Inter, sans-serif" font-size="${t.size}" fill="${esc(t.color)}">${esc(t.text)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">${parts.join('')}</svg>`;
};
