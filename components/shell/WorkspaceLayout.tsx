import React, { useRef, useState } from 'react';
import { LayoutNode, Edge } from '../../hooks/useWorkspace';
import { cn } from '../ui';

export const TAB_DRAG_MIME = 'application/x-gdpm-tab';
const FILE_DRAG_MIME = 'application/x-gdpm-file-id';
/** Outer share of a pane that counts as an edge (split) drop zone. */
const EDGE_FRACTION = 0.22;
const MIN_PANE_PERCENT = 12;

export interface TabDragPayload {
  paneId: string;
  leafId: string;
}

export const readTabDrag = (data: DataTransfer): TabDragPayload | null => {
  const raw = data.getData(TAB_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TabDragPayload;
    return parsed.paneId && parsed.leafId ? parsed : null;
  } catch {
    return null;
  }
};

export const readFileDrag = (data: DataTransfer): string | null => {
  const raw = data.getData(FILE_DRAG_MIME);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { id?: string }).id || null;
  } catch {
    return raw;
  }
};

type Zone = Edge | 'center';

interface WorkspaceLayoutProps {
  layout: LayoutNode;
  activePaneId: string;
  multiPane: boolean;
  renderPane: (paneId: string) => React.ReactNode;
  onFocusPane: (paneId: string) => void;
  onResize: (splitId: string, sizes: number[]) => void;
  /** A tab dropped on a pane edge (split) or its centre (move into the pane). */
  onDropTab: (from: TabDragPayload, toPaneId: string, edge?: Edge) => void;
  /** A sidebar file dropped on a pane edge (open in a new split). */
  onDropFile: (fileId: string, toPaneId: string, edge: Edge) => void;
}

/** Thin draggable divider between two siblings of a split. */
const SplitResizer: React.FC<{ dir: 'row' | 'column'; onDrag: (deltaPercent: number) => void; containerRef: React.RefObject<HTMLDivElement> }> = ({ dir, onDrag, containerRef }) => {
  const last = useRef<number | null>(null);
  return (
    <div
      role="separator"
      aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
      title="Drag to resize"
      className={cn(
        'group relative z-10 shrink-0 bg-border',
        dir === 'row' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
      )}
      onPointerDown={e => {
        e.preventDefault();
        try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        last.current = dir === 'row' ? e.clientX : e.clientY;
        document.body.style.cursor = dir === 'row' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
      }}
      onPointerMove={e => {
        if (last.current === null || !containerRef.current) return;
        const pos = dir === 'row' ? e.clientX : e.clientY;
        const rect = containerRef.current.getBoundingClientRect();
        const total = dir === 'row' ? rect.width : rect.height;
        if (total > 0) onDrag(((pos - last.current) / total) * 100);
        last.current = pos;
      }}
      onPointerUp={() => {
        last.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }}
    >
      {/* Wider invisible hit area + hover highlight */}
      <span className={cn('absolute transition-colors group-hover:bg-accent/50', dir === 'row' ? '-left-[3px] top-0 h-full w-[7px]' : '-top-[3px] left-0 h-[7px] w-full')} />
    </div>
  );
};

const PaneSlot: React.FC<{
  paneId: string;
  active: boolean;
  multiPane: boolean;
  children: React.ReactNode;
  onFocus: () => void;
  onDropTab: WorkspaceLayoutProps['onDropTab'];
  onDropFile: WorkspaceLayoutProps['onDropFile'];
}> = ({ paneId, active, multiPane, children, onFocus, onDropTab, onDropFile }) => {
  const [zone, setZone] = useState<Zone | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const zoneAt = (e: React.DragEvent, allowCenter: boolean): Zone | null => {
    const rect = ref.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    // The tab strip area handles its own drops.
    if (e.clientY - rect.top < 40) return null;
    const edges: [Zone, number][] = [['left', x], ['right', 1 - x], ['top', y], ['bottom', 1 - y]];
    const [nearest, dist] = edges.sort((a, b) => a[1] - b[1])[0];
    if (dist < EDGE_FRACTION) return nearest;
    return allowCenter ? 'center' : null;
  };

  const kind = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes(TAB_DRAG_MIME)) return 'tab';
    if (types.includes(FILE_DRAG_MIME)) return 'file';
    return null;
  };

  return (
    <div
      ref={ref}
      className="relative flex h-full min-h-0 w-full min-w-0 flex-col"
      onMouseDownCapture={onFocus}
      onFocusCapture={onFocus}
      // Capture phase: decide before the editor underneath (which may want
      // to insert a link for a file dropped in its middle).
      onDragOverCapture={e => {
        const k = kind(e);
        if (!k) return;
        const z = zoneAt(e, k === 'tab');
        setZone(z);
        if (z) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDragLeave={e => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setZone(null);
      }}
      onDropCapture={e => {
        const k = kind(e);
        const z = k ? zoneAt(e, k === 'tab') : null;
        setZone(null);
        if (!k || !z) return;
        e.preventDefault();
        e.stopPropagation();
        if (k === 'tab') {
          const payload = readTabDrag(e.dataTransfer);
          if (payload) onDropTab(payload, paneId, z === 'center' ? undefined : z);
        } else if (z !== 'center') {
          const fileId = readFileDrag(e.dataTransfer);
          if (fileId) onDropFile(fileId, paneId, z);
        }
      }}
    >
      {children}
      {zone && (
        <div
          className={cn(
            'pointer-events-none absolute z-30 rounded-md border-2 border-accent bg-accent/15 transition-all duration-100',
            zone === 'center' && 'inset-2 top-12',
            zone === 'left' && 'bottom-2 left-2 top-12 w-[calc(50%-0.5rem)]',
            zone === 'right' && 'bottom-2 right-2 top-12 w-[calc(50%-0.5rem)]',
            zone === 'top' && 'left-2 right-2 top-12 h-[calc(50%-3rem)]',
            zone === 'bottom' && 'bottom-2 left-2 right-2 h-[calc(50%-0.5rem)]',
          )}
        />
      )}
    </div>
  );
};

/** Renders the split-pane tree; panes come from `renderPane`. */
const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = props => {
  const renderNode = (node: LayoutNode): React.ReactNode => {
    if (node.kind === 'pane') {
      return (
        <PaneSlot
          key={node.id}
          paneId={node.id}
          active={node.id === props.activePaneId}
          multiPane={props.multiPane}
          onFocus={() => props.onFocusPane(node.id)}
          onDropTab={props.onDropTab}
          onDropFile={props.onDropFile}
        >
          {props.renderPane(node.id)}
        </PaneSlot>
      );
    }
    return <SplitView key={node.id} node={node} renderNode={renderNode} onResize={props.onResize} />;
  };
  return <div className="flex h-full min-h-0 w-full min-w-0">{renderNode(props.layout)}</div>;
};

const SplitView: React.FC<{
  node: Extract<LayoutNode, { kind: 'split' }>;
  renderNode: (node: LayoutNode) => React.ReactNode;
  onResize: (splitId: string, sizes: number[]) => void;
}> = ({ node, renderNode, onResize }) => {
  const ref = useRef<HTMLDivElement>(null);
  const sizesRef = useRef(node.sizes);
  sizesRef.current = node.sizes;
  return (
    <div ref={ref} className={cn('flex h-full min-h-0 w-full min-w-0', node.dir === 'row' ? 'flex-row' : 'flex-col')}>
      {node.children.map((child, i) => (
        <React.Fragment key={child.id}>
          {i > 0 && (
            <SplitResizer
              dir={node.dir}
              containerRef={ref}
              onDrag={delta => {
                const sizes = [...sizesRef.current];
                const a = sizes[i - 1] + delta;
                const b = sizes[i] - delta;
                if (a < MIN_PANE_PERCENT || b < MIN_PANE_PERCENT) return;
                sizes[i - 1] = a;
                sizes[i] = b;
                sizesRef.current = sizes;
                onResize(node.id, sizes);
              }}
            />
          )}
          <div className="flex min-h-0 min-w-0" style={{ flex: `${node.sizes[i]} 1 0%` }}>
            {renderNode(child)}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

export default WorkspaceLayout;
