import React from 'react';
import type { Pt } from '../../utils/vectorTopology';

/** World px a pointer must travel before a press counts as a drag (divided by zoom). */
export const MOVE_THRESHOLD = 3;
/** Half-length of drawn guide lines, in world units. */
export const GUIDE_SPAN = 4000;

/** Small screen-constant label drawn in world space (lengths, angles, coordinates). */
export const MeasurementLabel: React.FC<{ x: number; y: number; lines: string[]; zoom: number }> = ({ x, y, lines, zoom }) => {
  const fontSize = 11 / zoom;
  const lineHeight = fontSize * 1.35;
  const padX = 5 / zoom, padY = 4 / zoom;
  const width = Math.max(...lines.map(l => l.length)) * fontSize * 0.62 + padX * 2;
  const height = lines.length * lineHeight + padY * 2 - (lineHeight - fontSize);
  return (
    <g transform={`translate(${x - width / 2} ${y - height / 2})`} pointerEvents="none">
      <rect width={width} height={height} rx={3 / zoom} fill="rgb(var(--color-surface-raised) / 0.92)" stroke="rgb(var(--color-border-strong))" strokeWidth={1 / zoom} />
      {lines.map((line, i) => (
        <text key={i} x={width / 2} y={padY + fontSize * 0.85 + i * lineHeight} textAnchor="middle" fontSize={fontSize} fill="rgb(var(--color-content))" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {line}
        </text>
      ))}
    </g>
  );
};

/** Line direction in degrees, folded into 0–180 (a line has no direction). */
export const lineRotationDeg = (dx: number, dy: number) => {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return ((deg % 180) + 180) % 180;
};

/** Angles between consecutive edges around a vertex, with the bisector to place labels on. */
export const vertexAngles = (others: Pt[]) => {
  if (others.length < 2) return [];
  const sorted = others.map(p => Math.atan2(p.y, p.x)).sort((a, b) => a - b);
  const n = sorted.length;
  const pairs = n === 2 ? [[0, 1]] : sorted.map((_, i) => [i, (i + 1) % n]);
  return pairs.map(([i, j]) => {
    let diff = sorted[j] - sorted[i];
    while (diff < 0) diff += 2 * Math.PI;
    let angleDeg = (diff * 180) / Math.PI;
    let bisector = sorted[i] + diff / 2;
    if (n === 2 && angleDeg > 180) {
      angleDeg = 360 - angleDeg;
      bisector += Math.PI;
    }
    return { angleDeg, bisector };
  });
};

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

export const boxOf = (points: Pt[]): Box | null => {
  if (!points.length) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

export interface ScaleHandle { key: string; x: number; y: number; anchor: Pt; axisLock: 'x' | 'y' | null; cursor: string }

/** Eight scale handles; each scales away from the opposite side/corner of the real box. */
export const handleConfigsFor = (box: Box, pad: number): ScaleHandle[] => {
  const midX = (box.minX + box.maxX) / 2, midY = (box.minY + box.maxY) / 2;
  const x0 = box.minX - pad, x1 = box.maxX + pad, y0 = box.minY - pad, y1 = box.maxY + pad;
  return [
    { key: 'nw', x: x0, y: y0, anchor: { x: box.maxX, y: box.maxY }, axisLock: null, cursor: 'nwse-resize' },
    { key: 'ne', x: x1, y: y0, anchor: { x: box.minX, y: box.maxY }, axisLock: null, cursor: 'nesw-resize' },
    { key: 'sw', x: x0, y: y1, anchor: { x: box.maxX, y: box.minY }, axisLock: null, cursor: 'nesw-resize' },
    { key: 'se', x: x1, y: y1, anchor: { x: box.minX, y: box.minY }, axisLock: null, cursor: 'nwse-resize' },
    { key: 'n', x: midX, y: y0, anchor: { x: box.minX, y: box.maxY }, axisLock: 'y', cursor: 'ns-resize' },
    { key: 's', x: midX, y: y1, anchor: { x: box.minX, y: box.minY }, axisLock: 'y', cursor: 'ns-resize' },
    { key: 'w', x: x0, y: midY, anchor: { x: box.maxX, y: box.minY }, axisLock: 'x', cursor: 'ew-resize' },
    { key: 'e', x: x1, y: midY, anchor: { x: box.minX, y: box.minY }, axisLock: 'x', cursor: 'ew-resize' },
  ];
};

export const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
