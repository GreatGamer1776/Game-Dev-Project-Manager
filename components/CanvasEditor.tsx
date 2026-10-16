import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap, Handle, Position, NodeProps, NodeResizer, NodeToolbar,
  ReactFlowProvider, useReactFlow, useNodesState, useEdgesState, addEdge, Connection, Edge, Node, ConnectionMode,
  MarkerType, EdgeProps, getBezierPath, EdgeLabelRenderer, BaseEdge, NodeDragHandler,
} from 'reactflow';
import {
  StickyNote, FileSymlink, Link2, BoxSelect, Maximize, Undo2, Redo2, Trash2, ExternalLink, Pencil, Palette, ArrowRight,
} from 'lucide-react';
import { EditorProps, ProjectFile } from '../types';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { showMenu } from '../stores/useMenuStore';
import { promptDialog } from '../stores/useUiStore';
import { uid } from '../utils/id';
import { getFileTypeMeta } from './fileTypes';
import MarkdownView from './markdown/MarkdownView';
import SearchPicker, { PickerItem } from './ui/SearchPicker';
import { cn, SaveIndicator } from './ui';
import type { SaveStatus } from './ui';

// JSON Canvas-compatible document (https://jsoncanvas.org), as Obsidian uses.
type Side = 'top' | 'right' | 'bottom' | 'left';
interface CanvasNodeData {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  color?: string;
}
interface CanvasEdgeData {
  id: string;
  fromNode: string;
  fromSide?: Side;
  toNode: string;
  toSide?: Side;
  label?: string;
  color?: string;
  toEnd?: 'arrow' | 'none';
}
interface CanvasDoc {
  nodes: CanvasNodeData[];
  edges: CanvasEdgeData[];
}

/** Obsidian's six canvas colours. */
const CANVAS_COLORS: { id: string; name: string; rgb: string }[] = [
  { id: '1', name: 'Red', rgb: '239 68 68' },
  { id: '2', name: 'Orange', rgb: '249 115 22' },
  { id: '3', name: 'Yellow', rgb: '234 179 8' },
  { id: '4', name: 'Green', rgb: '34 197 94' },
  { id: '5', name: 'Cyan', rgb: '6 182 212' },
  { id: '6', name: 'Purple', rgb: '168 85 247' },
];
const colorRgb = (color?: string) => CANVAS_COLORS.find(c => c.id === color)?.rgb;
const FILE_LINK_DRAG_MIME = 'application/x-gdpm-file-id';
const SAVE_DEBOUNCE_MS = 400;

const parseCanvas = (raw: unknown): CanvasDoc => {
  const doc = raw && typeof raw === 'object' ? raw as Partial<CanvasDoc> : {};
  const nodes = Array.isArray(doc.nodes) ? doc.nodes.filter(n => n && typeof n.id === 'string') : [];
  const ids = new Set(nodes.map(n => n.id));
  const edges = Array.isArray(doc.edges) ? doc.edges.filter(e => e && ids.has(e.fromNode) && ids.has(e.toNode)) : [];
  return { nodes, edges };
};

interface CanvasCtx {
  files: ProjectFile[];
  assets: Record<string, string>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  updateNode: (id: string, patch: Partial<CanvasNodeData>) => void;
  removeNode: (id: string) => void;
  openFile: (id: string) => void;
  openHref: (href: string, newTab?: boolean) => void;
}
const CanvasContext = createContext<CanvasCtx | null>(null);
const useCanvas = () => useContext(CanvasContext)!;

const HANDLE_CLASS = '!h-2.5 !w-2.5 !border !border-border-strong !bg-surface-raised opacity-0 transition-opacity group-hover:opacity-100 hover:!bg-accent';
const Handles = () => (
  <>
    {(['top', 'right', 'bottom', 'left'] as Side[]).map(side => (
      <Handle
        key={side}
        id={side}
        type="source"
        position={{ top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }[side]}
        className={HANDLE_CLASS}
        isConnectableStart
        isConnectableEnd
      />
    ))}
  </>
);

/** Shared node chrome: resizer, colour tint, selection toolbar. */
const NodeShell: React.FC<{ props: NodeProps<CanvasNodeData>; children: React.ReactNode; className?: string; minWidth?: number; minHeight?: number }> = ({
  props, children, className, minWidth = 120, minHeight = 60,
}) => {
  const ctx = useCanvas();
  const rgb = colorRgb(props.data.color);
  const colorMenu = (e: React.MouseEvent) => showMenu(e, [
    { label: 'No color', checked: !props.data.color, onSelect: () => ctx.updateNode(props.id, { color: undefined }) },
    ...CANVAS_COLORS.map(c => ({ label: c.name, checked: props.data.color === c.id, icon: swatch(c.rgb), onSelect: () => ctx.updateNode(props.id, { color: c.id }) })),
  ], 'below');
  return (
    <>
      <NodeResizer isVisible={props.selected} minWidth={minWidth} minHeight={minHeight} lineClassName="!border-accent" handleClassName="!h-2 !w-2 !rounded-sm !border-accent !bg-bg" />
      <NodeToolbar isVisible={props.selected && ctx.editingId !== props.id} position={Position.Top} className="flex items-center gap-0.5 rounded-md bg-surface-raised p-0.5 shadow-menu">
        {props.data.type === 'text' && (
          <button type="button" className="icon-btn" title="Edit (or double-click the card)" aria-label="Edit card" onClick={() => ctx.setEditingId(props.id)}><Pencil className="h-3.5 w-3.5" /></button>
        )}
        {props.data.type === 'file' && props.data.file && (
          <button type="button" className="icon-btn" title="Open file (or double-click the card)" aria-label="Open file" onClick={() => ctx.openFile(props.data.file!)}><ExternalLink className="h-3.5 w-3.5" /></button>
        )}
        <button type="button" className="icon-btn" title="Color" aria-label="Set color" onClick={colorMenu}><Palette className="h-3.5 w-3.5" /></button>
        <button type="button" className="icon-btn hover:!text-danger" title="Delete (Del)" aria-label="Delete" onClick={() => ctx.removeNode(props.id)}><Trash2 className="h-3.5 w-3.5" /></button>
      </NodeToolbar>
      <div
        className={cn('group h-full w-full overflow-hidden rounded-lg border-2 bg-surface shadow-soft', props.selected ? 'border-accent' : 'border-border-strong', className)}
        style={rgb ? { borderColor: `rgb(${rgb})`, backgroundColor: `color-mix(in srgb, rgb(${rgb}) 8%, rgb(var(--color-surface)))` } : undefined}
      >
        {children}
      </div>
      <Handles />
    </>
  );
};

const swatch = (rgb: string): React.ComponentType<{ className?: string }> => {
  const Swatch = ({ className }: { className?: string }) => <span className={cn('inline-block rounded-full', className)} style={{ backgroundColor: `rgb(${rgb})` }} />;
  return Swatch;
};

const TextNode: React.FC<NodeProps<CanvasNodeData>> = props => {
  const ctx = useCanvas();
  const editing = ctx.editingId === props.id;
  const [draft, setDraft] = useState(props.data.text || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing) setDraft(props.data.text || ''); }, [editing, props.data.text]);
  // React Flow keeps a new node hidden until it is measured, so autoFocus
  // alone misses it; focus once it has been shown.
  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => textareaRef.current?.focus()));
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);
  return (
    <NodeShell props={props}>
      {editing ? (
        <textarea
          ref={textareaRef}
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { ctx.updateNode(props.id, { text: draft }); ctx.setEditingId(null); }}
          onKeyDown={e => { if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur(); }}
          className="nodrag nowheel h-full w-full resize-none bg-transparent p-3 font-mono text-[13px] text-content outline-none"
          placeholder="Markdown…"
        />
      ) : (
        <div className="nowheel h-full overflow-y-auto px-4 py-3 text-[14px]" onDoubleClick={() => ctx.setEditingId(props.id)}>
          {props.data.text?.trim()
            ? <MarkdownView source={props.data.text} files={ctx.files} assets={ctx.assets} onOpenHref={ctx.openHref} hideProperties />
            : <p className="text-faint">Double-click to write…</p>}
        </div>
      )}
    </NodeShell>
  );
};

const FileNode: React.FC<NodeProps<CanvasNodeData>> = props => {
  const ctx = useCanvas();
  const file = ctx.files.find(f => f.id === props.data.file);
  const meta = file ? getFileTypeMeta(file.type) : null;
  const Icon = meta?.icon || FileSymlink;
  return (
    <NodeShell props={props} className="flex flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5 text-[12px]" onDoubleClick={() => file && ctx.openFile(file.id)}>
        <Icon className="h-3.5 w-3.5 text-faint" />
        <span className={cn('truncate font-medium', file ? 'text-content' : 'text-faint line-through')}>{file?.name || 'Missing file'}</span>
        <span className="ml-auto text-[10px] text-faint">{meta?.label}</span>
      </div>
      <div className="nowheel min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[13px]" onDoubleClick={() => file && ctx.openFile(file.id)}>
        {file?.type === 'doc' && typeof file.content === 'string'
          ? <MarkdownView source={file.content} files={ctx.files} assets={ctx.assets} onOpenHref={ctx.openHref} hideProperties depth={1} />
          : <p className="text-faint">{file ? `Double-click to open this ${meta?.label.toLowerCase()}.` : 'This file was deleted.'}</p>}
      </div>
    </NodeShell>
  );
};

const LinkNode: React.FC<NodeProps<CanvasNodeData>> = props => {
  const url = props.data.url || '';
  let host = url;
  try { host = new URL(url).host; } catch { /* keep raw */ }
  return (
    <NodeShell props={props} minHeight={50}>
      <a href={url} target="_blank" rel="noopener noreferrer" className="nodrag flex h-full flex-col justify-center gap-1 px-4 py-3 hover:bg-surface-hover/50">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-accent"><Link2 className="h-3.5 w-3.5" />{host}</span>
        <span className="truncate text-[11px] text-faint">{url}</span>
      </a>
    </NodeShell>
  );
};

const GroupNode: React.FC<NodeProps<CanvasNodeData>> = props => {
  const ctx = useCanvas();
  const rgb = colorRgb(props.data.color);
  return (
    <>
      <NodeResizer isVisible={props.selected} minWidth={160} minHeight={120} lineClassName="!border-accent" handleClassName="!h-2 !w-2 !rounded-sm !border-accent !bg-bg" />
      <NodeToolbar isVisible={props.selected} position={Position.Top} className="flex items-center gap-0.5 rounded-md bg-surface-raised p-0.5 shadow-menu">
        <button type="button" className="icon-btn" title="Rename group" aria-label="Rename group" onClick={async () => {
          const label = await promptDialog({ title: 'Group name', defaultValue: props.data.label || '', confirmText: 'Save', allowEmpty: true });
          if (label !== null) ctx.updateNode(props.id, { label });
        }}><Pencil className="h-3.5 w-3.5" /></button>
        <button type="button" className="icon-btn" title="Color" aria-label="Set color" onClick={e => showMenu(e, [
          { label: 'No color', checked: !props.data.color, onSelect: () => ctx.updateNode(props.id, { color: undefined }) },
          ...CANVAS_COLORS.map(c => ({ label: c.name, checked: props.data.color === c.id, icon: swatch(c.rgb), onSelect: () => ctx.updateNode(props.id, { color: c.id }) })),
        ], 'below')}><Palette className="h-3.5 w-3.5" /></button>
        <button type="button" className="icon-btn hover:!text-danger" title="Delete group (Del) — the cards inside stay" aria-label="Delete group" onClick={() => ctx.removeNode(props.id)}><Trash2 className="h-3.5 w-3.5" /></button>
      </NodeToolbar>
      <div
        className={cn('h-full w-full rounded-xl border-2', props.selected ? 'border-accent' : 'border-border-strong')}
        style={{ backgroundColor: rgb ? `rgb(${rgb} / 0.08)` : 'rgb(var(--color-surface-hover) / 0.35)', borderColor: rgb && !props.selected ? `rgb(${rgb})` : undefined }}
      >
        {props.data.label && (
          <span className="absolute -top-7 left-0 rounded-md bg-surface-raised px-2 py-0.5 text-[13px] font-semibold text-content" style={rgb ? { color: `rgb(${rgb})` } : undefined}>
            {props.data.label}
          </span>
        )}
      </div>
      <Handles />
    </>
  );
};

const CanvasEdge: React.FC<EdgeProps> = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected, style }) => {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, strokeWidth: selected ? 3 : 2 }} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-bg px-1.5 py-0.5 text-[12px] text-content shadow-soft"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const NODE_TYPES = { text: TextNode, file: FileNode, link: LinkNode, group: GroupNode };
const EDGE_TYPES = { canvas: CanvasEdge };

const toFlowNode = (n: CanvasNodeData): Node<CanvasNodeData> => ({
  id: n.id,
  type: n.type,
  position: { x: n.x, y: n.y },
  data: n,
  style: { width: n.width, height: n.height },
  zIndex: n.type === 'group' ? -1 : 0,
  dragHandle: undefined,
});

const edgeStyle = (color?: string) => {
  const rgb = colorRgb(color);
  return rgb ? `rgb(${rgb})` : 'rgb(var(--color-faint))';
};

const toFlowEdge = (e: CanvasEdgeData): Edge => ({
  id: e.id,
  source: e.fromNode,
  sourceHandle: e.fromSide,
  target: e.toNode,
  targetHandle: e.toSide,
  type: 'canvas',
  data: { label: e.label, color: e.color, toEnd: e.toEnd },
  style: { stroke: edgeStyle(e.color) },
  markerEnd: e.toEnd === 'none' ? undefined : { type: MarkerType.ArrowClosed, color: edgeStyle(e.color) },
});

const fromFlow = (nodes: Node<CanvasNodeData>[], edges: Edge[]): CanvasDoc => ({
  nodes: nodes.map(n => ({
    ...n.data,
    id: n.id,
    x: Math.round(n.position.x),
    y: Math.round(n.position.y),
    width: Math.round(Number(n.width ?? n.style?.width ?? n.data.width) || 240),
    height: Math.round(Number(n.height ?? n.style?.height ?? n.data.height) || 120),
  })),
  edges: edges.map(e => ({
    id: e.id,
    fromNode: e.source,
    fromSide: (e.sourceHandle as Side) || undefined,
    toNode: e.target,
    toSide: (e.targetHandle as Side) || undefined,
    label: e.data?.label || undefined,
    color: e.data?.color || undefined,
    toEnd: e.data?.toEnd || undefined,
  })),
});

const CanvasInner: React.FC<EditorProps> = ({ initialContent, onSave, projectFiles = [], assets = {}, onOpenFile, onOpenHref, activeFileId }) => {
  const initial = useMemo(() => parseCanvas(initialContent), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>(initial.nodes.map(toFlowNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges.map(toFlowEdge));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filePicker, setFilePicker] = useState<HTMLElement | null>(null);
  const history = useUndoRedo<CanvasDoc>(initial);
  const flow = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const restoringRef = useRef(false);
  const lastSavedRef = useRef(JSON.stringify(initial));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const groupDragRef = useRef<{ ids: string[]; start: { x: number; y: number }; origins: Map<string, { x: number; y: number }> } | null>(null);

  // Debounced save + undo snapshot whenever the serialized doc actually changes.
  const saveNow = () => {
    const doc = fromFlow(nodes, edges);
    const json = JSON.stringify(doc);
    setSaveStatus('saved');
    if (json === lastSavedRef.current) return;
    lastSavedRef.current = json;
    onSave(doc);
    if (restoringRef.current) restoringRef.current = false;
    else history.pushState(doc);
  };
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  useEffect(() => {
    if (JSON.stringify(fromFlow(nodes, edges)) !== lastSavedRef.current) setSaveStatus('unsaved');
    const timer = window.setTimeout(() => saveNowRef.current(), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [nodes, edges]);

  const restore = (doc: CanvasDoc | undefined) => {
    if (!doc) return;
    restoringRef.current = true;
    setNodes(doc.nodes.map(toFlowNode));
    setEdges(doc.edges.map(toFlowEdge));
  };

  const updateNode = useCallback((id: string, patch: Partial<CanvasNodeData>) => {
    setNodes(ns => ns.map(n => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, [setNodes]);

  const removeNode = useCallback((id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
  }, [setNodes, setEdges]);

  const openHref = useCallback((href: string, newTab?: boolean) => {
    if (onOpenHref) onOpenHref(href, newTab);
    else if (href.startsWith('file://')) onOpenFile?.(href.slice(7));
  }, [onOpenHref, onOpenFile]);

  const ctx = useMemo<CanvasCtx>(() => ({
    files: projectFiles,
    assets,
    editingId,
    setEditingId,
    updateNode,
    removeNode,
    openFile: id => onOpenFile?.(id),
    openHref,
  }), [projectFiles, assets, editingId, updateNode, removeNode, onOpenFile, openHref]);

  /** Where new nodes go: the given screen point, or the viewport centre. */
  const placeAt = (screen?: { x: number; y: number }) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const point = screen || { x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2 };
    return flow.screenToFlowPosition(point);
  };

  const addNode = (data: Omit<CanvasNodeData, 'id' | 'x' | 'y'>, screen?: { x: number; y: number }) => {
    const pos = placeAt(screen);
    const node: CanvasNodeData = { id: uid(), x: Math.round(pos.x - data.width / 2), y: Math.round(pos.y - data.height / 2), ...data };
    setNodes(ns => [...ns.map(n => ({ ...n, selected: false })), { ...toFlowNode(node), selected: true }]);
    if (node.type === 'text') setEditingId(node.id);
    return node.id;
  };

  const addLink = async () => {
    const url = await promptDialog({ title: 'Add web link', label: 'URL', placeholder: 'https://', confirmText: 'Add' });
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    addNode({ type: 'link', width: 320, height: 90, url: href });
  };

  const addGroup = () => {
    const selected = nodes.filter(n => n.selected && n.type !== 'group');
    if (selected.length > 0) {
      // Wrap the selection.
      const xs = selected.map(n => n.position.x);
      const ys = selected.map(n => n.position.y);
      const xe = selected.map(n => n.position.x + (Number(n.width ?? n.style?.width) || 240));
      const ye = selected.map(n => n.position.y + (Number(n.height ?? n.style?.height) || 120));
      const pad = 40;
      const group: CanvasNodeData = {
        id: uid(), type: 'group', label: 'Group',
        x: Math.min(...xs) - pad, y: Math.min(...ys) - pad,
        width: Math.max(...xe) - Math.min(...xs) + pad * 2, height: Math.max(...ye) - Math.min(...ys) + pad * 2,
      };
      setNodes(ns => [toFlowNode(group), ...ns]);
    } else {
      addNode({ type: 'group', width: 480, height: 320, label: 'Group' });
    }
  };

  const onConnect = useCallback((c: Connection) => {
    setEdges(es => addEdge(toFlowEdge({ id: uid(), fromNode: c.source!, fromSide: (c.sourceHandle as Side) || undefined, toNode: c.target!, toSide: (c.targetHandle as Side) || undefined }), es));
  }, [setEdges]);

  const edgeMenu = (e: React.MouseEvent, edge: Edge) => showMenu(e, [
    {
      label: edge.data?.label ? 'Edit label' : 'Add label', icon: Pencil, onSelect: async () => {
        const label = await promptDialog({ title: 'Connection label', defaultValue: edge.data?.label || '', confirmText: 'Save', allowEmpty: true });
        if (label !== null) setEdges(es => es.map(x => (x.id === edge.id ? { ...x, data: { ...x.data, label: label || undefined } } : x)));
      },
    },
    {
      label: edge.data?.toEnd === 'none' ? 'Show arrow' : 'Hide arrow', icon: ArrowRight, onSelect: () => setEdges(es => es.map(x => {
        if (x.id !== edge.id) return x;
        const toEnd = x.data?.toEnd === 'none' ? undefined : 'none';
        return toFlowEdge({ ...fromFlow([], [x]).edges[0], toEnd });
      })),
    },
    { kind: 'heading', label: 'Color' },
    { label: 'Default', checked: !edge.data?.color, onSelect: () => setEdges(es => es.map(x => (x.id === edge.id ? toFlowEdge({ ...fromFlow([], [x]).edges[0], color: undefined }) : x))) },
    ...CANVAS_COLORS.map(c => ({
      label: c.name, icon: swatch(c.rgb), checked: edge.data?.color === c.id,
      onSelect: () => setEdges(es => es.map(x => (x.id === edge.id ? toFlowEdge({ ...fromFlow([], [x]).edges[0], color: c.id }) : x))),
    })),
    { kind: 'separator' },
    { label: 'Delete connection', icon: Trash2, danger: true, onSelect: () => setEdges(es => es.filter(x => x.id !== edge.id)) },
  ]);

  // Dragging a group carries the cards inside it, like Obsidian.
  const onNodeDragStart: NodeDragHandler = (_e, node) => {
    if (node.type !== 'group') { groupDragRef.current = null; return; }
    const w = Number(node.width ?? node.style?.width) || 0;
    const h = Number(node.height ?? node.style?.height) || 0;
    const inside = nodes.filter(n => n.id !== node.id && !n.selected &&
      n.position.x >= node.position.x && n.position.y >= node.position.y &&
      n.position.x + (Number(n.width ?? n.style?.width) || 0) <= node.position.x + w &&
      n.position.y + (Number(n.height ?? n.style?.height) || 0) <= node.position.y + h);
    groupDragRef.current = { ids: inside.map(n => n.id), start: { ...node.position }, origins: new Map(inside.map(n => [n.id, { ...n.position }])) };
  };
  const onNodeDrag: NodeDragHandler = (_e, node) => {
    const drag = groupDragRef.current;
    if (!drag || node.type !== 'group') return;
    const dx = node.position.x - drag.start.x;
    const dy = node.position.y - drag.start.y;
    setNodes(ns => ns.map(n => {
      const origin = drag.origins.get(n.id);
      return origin ? { ...n, position: { x: origin.x + dx, y: origin.y + dy } } : n;
    }));
  };

  const handleDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(FILE_LINK_DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    let id = raw;
    try { id = (JSON.parse(raw) as { id?: string }).id || raw; } catch { /* plain id */ }
    if (projectFiles.some(f => f.id === id)) addNode({ type: 'file', width: 400, height: 300, file: id }, { x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!wrapperRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); return; }
      if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); restore(history.undo()); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); restore(history.redo()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <CanvasContext.Provider value={ctx}>
      <div
        ref={wrapperRef}
        className="canvas-editor relative h-full w-full bg-bg"
        onDragOver={e => { if (e.dataTransfer.types.includes(FILE_LINK_DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={handleDrop}
        onDoubleClick={e => {
          if ((e.target as HTMLElement).classList.contains('react-flow__pane')) addNode({ type: 'text', width: 260, height: 140, text: '' }, { x: e.clientX, y: e.clientY });
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onEdgeContextMenu={edgeMenu}
          onEdgeDoubleClick={edgeMenu}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={['Backspace', 'Delete']}
          zoomOnDoubleClick={false}
          minZoom={0.1}
          maxZoom={3}
          fitView={initial.nodes.length > 0}
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          snapToGrid
          snapGrid={[20, 20]}
          panOnScroll
          selectionOnDrag
          panOnDrag={[1, 2]}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="rgb(var(--color-border-strong))" />
          <MiniMap pannable zoomable className="!bg-chrome" maskColor="rgb(var(--color-bg) / 0.6)" nodeColor={n => (colorRgb(n.data?.color) ? `rgb(${colorRgb(n.data?.color)})` : 'rgb(var(--color-border-strong))')} />
          <Controls showInteractive={false} className="canvas-controls" />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center px-4">
            <div className="pointer-events-auto max-w-md rounded-lg border border-border bg-surface/95 px-4 py-3 text-[12px] text-muted shadow-raised">
              <div className="mb-1 text-[13px] font-medium text-content">Empty canvas</div>
              <p className="leading-relaxed">
                <b className="text-content">Double-click</b> anywhere to add a markdown card, or drag files in from the sidebar. Drag from the dot on a card's edge to another card to connect them; right-click a connection to label it.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => addNode({ type: 'text', width: 260, height: 140, text: '' })} className="rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-accent-content hover:bg-accent-hover">Add a card</button>
                <button type="button" onClick={e => setFilePicker(e.currentTarget)} disabled={projectFiles.length < 2} className="rounded-md px-2 py-1 text-[12px] text-muted ring-1 ring-border hover:bg-surface-hover disabled:opacity-40">Embed a file</button>
                <button type="button" onClick={() => void addLink()} className="rounded-md px-2 py-1 text-[12px] text-muted ring-1 ring-border hover:bg-surface-hover">Add a web link</button>
              </div>
            </div>
          </div>
        )}

        <SaveIndicator status={saveStatus} onSaveNow={saveNow} className="absolute right-3 top-3 z-10 bg-bg/80" />

        {/* Obsidian-style bottom toolbar */}
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-surface-raised p-1 shadow-pop">
          <button type="button" className="icon-btn h-8 w-8" title="Add card (or double-click the canvas)" aria-label="Add card" onClick={() => addNode({ type: 'text', width: 260, height: 140, text: '' })}><StickyNote className="h-4 w-4" /></button>
          <button type="button" className="icon-btn h-8 w-8" title="Embed a project file (or drag one in from the sidebar)" aria-label="Add file" onClick={e => setFilePicker(e.currentTarget)}><FileSymlink className="h-4 w-4" /></button>
          <button type="button" className="icon-btn h-8 w-8" title="Add web link" aria-label="Add web link" onClick={() => void addLink()}><Link2 className="h-4 w-4" /></button>
          <button type="button" className="icon-btn h-8 w-8" title="Add group — wraps the selected cards (drag across empty space to select several)" aria-label="Add group" onClick={addGroup}><BoxSelect className="h-4 w-4" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button type="button" className="icon-btn h-8 w-8" title="Zoom to fit" aria-label="Zoom to fit" onClick={() => flow.fitView({ padding: 0.2, duration: 250 })}><Maximize className="h-4 w-4" /></button>
          <button type="button" className="icon-btn h-8 w-8" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!history.canUndo} onClick={() => restore(history.undo())}><Undo2 className="h-4 w-4" /></button>
          <button type="button" className="icon-btn h-8 w-8" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!history.canRedo} onClick={() => restore(history.redo())}><Redo2 className="h-4 w-4" /></button>
        </div>

        <SearchPicker
          anchor={filePicker}
          items={projectFiles.filter(f => f.id !== activeFileId).map<PickerItem>(f => ({ id: f.id, label: f.name, sub: getFileTypeMeta(f.type).label, icon: getFileTypeMeta(f.type).icon }))}
          placeholder="Add a file to the canvas…"
          onPick={item => addNode({ type: 'file', width: 400, height: 300, file: item.id })}
          onClose={() => setFilePicker(null)}
        />
      </div>
    </CanvasContext.Provider>
  );
};

/** Obsidian Canvas: an infinite board of markdown cards, embedded files, links, and groups. */
const CanvasEditor: React.FC<EditorProps> = props => (
  <ReactFlowProvider>
    <CanvasInner {...props} />
  </ReactFlowProvider>
);

export default CanvasEditor;
