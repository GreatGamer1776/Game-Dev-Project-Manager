import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Handle,
  Position,
  NodeProps,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  MarkerType,
} from 'reactflow';
import {
  Trash2, Square, Diamond, Database,
  ArrowRightLeft, Hexagon, StickyNote, PlayCircle, StopCircle,
  Undo2, Redo2
} from 'lucide-react';
import { EditorProps } from '../types';
import { SaveIndicator } from './ui/SaveIndicator';
import { promptDialog } from '../stores/useUiStore';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { uid } from '../utils/id';

// --- CUSTOM NODE COMPONENTS ---

// Inline label editing: double-click a node (or add a new one) and type in place.
const EditCtx = React.createContext<{ editingId: string | null; finish: (id: string, label: string | null) => void }>({ editingId: null, finish: () => {} });

const NodeLabel: React.FC<{ id: string; label: string }> = ({ id, label }) => {
  const { editingId, finish } = React.useContext(EditCtx);
  const [draft, setDraft] = useState(label);
  const ref = useRef<HTMLTextAreaElement>(null);
  const editing = editingId === id;
  useEffect(() => {
    if (!editing) return;
    setDraft(label);
    // React Flow keeps a new node hidden until it's measured, so autoFocus would miss.
    const t = window.setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 60);
    return () => window.clearTimeout(t);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!editing) return <>{label}</>;
  return (
    <textarea
      ref={ref}
      value={draft}
      rows={Math.min(4, draft.split('\n').length)}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => finish(id, draft)}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(id, draft); }
        if (e.key === 'Escape') { e.preventDefault(); finish(id, null); }
      }}
      className="nodrag nopan w-full min-w-[6rem] resize-none rounded bg-bg/80 px-1 text-center text-inherit outline-none ring-1 ring-accent"
    />
  );
};

// Handle styling helper to ensure they sit on the border and don't clip
const HandleStyle = "w-3 h-3 !bg-muted border border-border z-50 transition-colors hover:!bg-accent";

// Every handle can both START and END a connection so you can link any side to
// any side (e.g. top-to-top). Without isConnectableStart, target handles can't
// begin a drag, which made many connections impossible even in loose mode.
const AnyHandle: React.FC<React.ComponentProps<typeof Handle>> = (props) => (
  <Handle isConnectableStart isConnectableEnd {...props} />
);

// 1. Terminal Node (Start/End)
const TerminalNode = ({ id, data, selected }: NodeProps) => (
  <div className={`px-6 py-3 rounded-full flex items-center justify-center min-w-[120px] bg-surface border-2 shadow-sm transition-all ${selected ? 'border-emerald-500 shadow-emerald-500/20' : 'border-emerald-500/50'}`}>
    <div className="text-center text-xs text-content font-semibold"><NodeLabel id={id} label={data.label} /></div>
    <AnyHandle type="source" position={Position.Top} id="top" className={`${HandleStyle} -mt-[2px]`} />
    <AnyHandle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-[2px]`} />
    <AnyHandle type="source" position={Position.Right} id="right" className={`${HandleStyle} -mr-[2px]`} />
    <AnyHandle type="source" position={Position.Left} id="left" className={`${HandleStyle} -ml-[2px]`} />
  </div>
);

// 2. Process Node (Action)
const ProcessNode = ({ id, data, selected }: NodeProps) => (
  <div className={`px-4 py-4 rounded-lg flex items-center justify-center min-w-[140px] bg-surface border-2 shadow-sm transition-all ${selected ? 'border-blue-500 shadow-blue-500/20' : 'border-border-strong'}`}>
    <div className="text-center text-xs text-content font-medium"><NodeLabel id={id} label={data.label} /></div>
    <AnyHandle type="source" position={Position.Top} id="top" className={`${HandleStyle} -mt-[2px]`} />
    <AnyHandle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-[2px]`} />
    <AnyHandle type="source" position={Position.Right} id="right" className={`${HandleStyle} -mr-[2px]`} />
    <AnyHandle type="source" position={Position.Left} id="left" className={`${HandleStyle} -ml-[2px]`} />
  </div>
);

// 3. Decision Node - Diamond
// Handles pushed out further to prevent diagonal clipping
const DecisionNode = ({ id, data, selected }: NodeProps) => (
  <div className="w-28 h-28 relative flex items-center justify-center">
    <div className={`absolute inset-0 transform rotate-45 bg-surface border-2 transition-all shadow-sm ${selected ? 'border-purple-500 shadow-purple-500/20' : 'border-purple-500/60'}`}></div>
    <div className="relative z-10 p-2 text-[10px] text-content font-bold text-center leading-tight max-w-[70%]">
      <NodeLabel id={id} label={data.label} />
    </div>
    <AnyHandle type="source" position={Position.Top} id="top" className={`${HandleStyle} -mt-1`} />
    <AnyHandle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-1`} />
    <AnyHandle type="source" position={Position.Right} id="right" className={`${HandleStyle} -mr-1`} />
    <AnyHandle type="source" position={Position.Left} id="left" className={`${HandleStyle} -ml-1`} />
  </div>
);

// 4. Input/Output Node
const InputOutputNode = ({ id, data, selected }: NodeProps) => (
  <div className="relative p-1">
    <div
        className={`px-6 py-3 min-w-[140px] transform -skew-x-12 bg-surface border-2 transition-all shadow-sm flex items-center justify-center ${selected ? 'border-orange-500 shadow-orange-500/20' : 'border-orange-500/60'}`}
    >
        <div className="transform skew-x-12 text-center text-xs text-content font-medium">
            <NodeLabel id={id} label={data.label} />
        </div>
    </div>
    <AnyHandle type="source" position={Position.Top} id="top" className={`${HandleStyle} top-0`} />
    <AnyHandle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} bottom-0`} />
    <AnyHandle type="source" position={Position.Right} id="right" className={`${HandleStyle} right-1`} />
    <AnyHandle type="source" position={Position.Left} id="left" className={`${HandleStyle} left-1`} />
  </div>
);

// 5. Database Node
const DatabaseNode = ({ id, data, selected }: NodeProps) => (
  <div className={`w-24 h-24 relative flex flex-col items-center justify-center bg-surface border-x-2 border-border-strong ${selected ? 'ring-2 ring-accent border-accent' : ''}`}>
    <div className="absolute top-0 w-full h-6 bg-surface-raised border-2 border-border-strong rounded-[50%] -mt-3 z-10"></div>
    <div className="text-[10px] text-content text-center px-1 z-0 mt-2 font-mono"><NodeLabel id={id} label={data.label} /></div>
    <div className="absolute bottom-0 w-full h-6 bg-surface border-b-2 border-x-2 border-border-strong rounded-[50%] -mb-3 z-0"></div>
    <AnyHandle type="source" position={Position.Top} id="top" className={`${HandleStyle} -mt-3`} />
    <AnyHandle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-3`} />
    <AnyHandle type="source" position={Position.Right} id="right" className={`${HandleStyle} -mr-[2px]`} />
    <AnyHandle type="source" position={Position.Left} id="left" className={`${HandleStyle} -ml-[2px]`} />
  </div>
);

// 6. Event Node
const EventNode = ({ id, data, selected }: NodeProps) => (
  <div className={`w-32 h-16 relative flex items-center justify-center`}>
    <div
        className={`absolute inset-0 bg-surface border-2 transition-all ${selected ? 'border-yellow-500 bg-yellow-500/10' : 'border-yellow-500/60'}`}
        style={{ clipPath: 'polygon(15% 0%, 85% 0%, 100% 50%, 85% 100%, 15% 100%, 0% 50%)' }}
    ></div>
    <div className="relative z-10 text-[10px] uppercase tracking-wider font-bold text-yellow-500 text-center px-6">
      <NodeLabel id={id} label={data.label} />
    </div>
    <AnyHandle type="source" position={Position.Top} id="top" className={`${HandleStyle} -mt-[2px]`} />
    <AnyHandle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-[2px]`} />
    <AnyHandle type="source" position={Position.Right} id="right" className={`${HandleStyle} -mr-[2px]`} />
    <AnyHandle type="source" position={Position.Left} id="left" className={`${HandleStyle} -ml-[2px]`} />
  </div>
);

// 7. Note Node
const NoteNode = ({ id, data, selected }: NodeProps) => (
  <div className={`w-40 min-h-[80px] bg-yellow-100/10 border-l-4 border-yellow-400 rounded p-2 flex flex-col relative ${selected ? 'ring-1 ring-yellow-400' : ''}`}>
    <div className="text-[9px] text-yellow-500/80 font-bold uppercase mb-1">Note</div>
    <div className="text-xs text-content italic text-left whitespace-pre-wrap"><NodeLabel id={id} label={data.label} /></div>
    <AnyHandle type="source" position={Position.Left} id="left" className="w-2 h-2 !bg-yellow-400/50 opacity-0 hover:opacity-100" />
  </div>
);

// --- EDITOR COMPONENT ---

const FlowchartEditorContent: React.FC<EditorProps> = ({ initialContent, onSave, fileName }) => {
  const initialNodes = initialContent?.nodes || [];
  const initialEdges = initialContent?.edges || [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { deleteElements, screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const undoRedo = useUndoRedo<{ nodes: Node[]; edges: Edge[] }>({ nodes: initialNodes, edges: initialEdges });

  // Save State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(JSON.stringify({ nodes: initialNodes, edges: initialEdges }));
  const latestGraphRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: initialNodes, edges: initialEdges });
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSaveStatusTimer = () => {
    if (saveStatusTimerRef.current) {
      clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = null;
    }
  };

  const persistGraph = (nextGraph: { nodes: Node[]; edges: Edge[] }) => {
    onSave(nextGraph);
    lastSavedData.current = JSON.stringify(nextGraph);
    latestGraphRef.current = nextGraph;
  };

  const flushPendingSave = () => {
    const nextGraph = latestGraphRef.current;
    if (JSON.stringify(nextGraph) === lastSavedData.current) return;
    persistGraph(nextGraph);
  };

  useEffect(() => {
    latestGraphRef.current = { nodes, edges };
  }, [nodes, edges]);

  // Autosave Logic
  useEffect(() => {
    const currentData = JSON.stringify({ nodes, edges });
    if (currentData === lastSavedData.current) return;

    setSaveStatus('unsaved');
    const timer = setTimeout(() => handleManualSave(), 800);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  useEffect(() => {
    return () => {
      clearSaveStatusTimer();
      flushPendingSave();
    };
  }, []);

  // Push to undo stack when graph changes
  const lastUndoPushRef = useRef(JSON.stringify({ nodes: initialNodes, edges: initialEdges }));
  useEffect(() => {
    const serialized = JSON.stringify({ nodes, edges });
    if (serialized === lastUndoPushRef.current) return;
    lastUndoPushRef.current = serialized;
    undoRedo.pushState({ nodes, edges });
  }, [nodes, edges, undoRedo]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = undoRedo.undo();
        if (prev !== undefined) { setNodes(prev.nodes); setEdges(prev.edges); lastUndoPushRef.current = JSON.stringify(prev); }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const next = undoRedo.redo();
        if (next !== undefined) { setNodes(next.nodes); setEdges(next.edges); lastUndoPushRef.current = JSON.stringify(next); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, undoRedo]);

  const handleManualSave = () => {
    clearSaveStatusTimer();
    setSaveStatus('saving');
    persistGraph(latestGraphRef.current);
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus('saved'), 500);
  };

  const nodeTypes = useMemo(() => ({
    terminal: TerminalNode,
    process: ProcessNode,
    decision: DecisionNode,
    io: InputOutputNode,
    database: DatabaseNode,
    event: EventNode,
    note: NoteNode
  }), []);

  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    lastSavedData.current = JSON.stringify({ nodes: initialNodes, edges: initialEdges });
    latestGraphRef.current = { nodes: initialNodes, edges: initialEdges };
    clearSaveStatusTimer();
    setSaveStatus('saved');
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const finishEdit = useCallback((id: string, label: string | null) => {
    setEditingId(null);
    if (label === null) return;
    setNodes(nds => nds.map(n => (n.id === id ? { ...n, data: { ...n.data, label: label.trim() || n.data.label } } : n)));
  }, [setNodes]);
  const editCtx = useMemo(() => ({ editingId, finish: finishEdit }), [editingId, finishEdit]);

  // Connect Logic - Adds arrows by default
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
        ...params,
        animated: false,
        type: 'smoothstep',
        style: { stroke: '#a1a1aa', strokeWidth: 2 },
        markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#a1a1aa',
            width: 20,
            height: 20,
        }
    }, eds)),
    [setEdges]
  );

  /** Adds a node at a screen point (default: the middle of the view), selected and ready to rename. */
  const addNode = (type: string, label: string, at?: { x: number; y: number }) => {
    const id = uid();
    const rect = wrapperRef.current?.getBoundingClientRect();
    const screen = at || (rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 300, y: 200 });
    const p = screenToFlowPosition(screen);
    // Nudge repeated adds so they don't stack exactly on top of each other.
    const offset = at ? 0 : (nodes.length % 5) * 24;
    const newNode: Node = { id, position: { x: p.x - 60 + offset, y: p.y - 24 + offset }, data: { label }, type, selected: true };
    setNodes(nds => nds.map(n => (n.selected ? { ...n, selected: false } : n)).concat(newNode));
    setEditingId(id);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-flow-node')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-flow-node');
    if (!raw) return;
    e.preventDefault();
    const { type, label } = JSON.parse(raw);
    addNode(type, label, { x: e.clientX, y: e.clientY });
  };
  const selectedCount = nodes.filter(n => n.selected).length + edges.filter(e => e.selected).length;

  const handleDeleteSelected = () => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    deleteElements({ nodes: selectedNodes, edges: selectedEdges });
  };

  const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => setEditingId(node.id);

  // NEW: Double-click edge to add label (Yes/No/True/False)
  const handleEdgeDoubleClick = async (event: React.MouseEvent, edge: Edge) => {
      const existingLabel = typeof edge.label === 'string' ? edge.label : edge.label != null ? String(edge.label) : '';
      const newLabel = await promptDialog({
        title: 'Edit connection label',
        label: "Label (e.g., 'Yes', 'No', 'True') — empty clears it",
        defaultValue: existingLabel,
        confirmText: 'Save',
        allowEmpty: true,
      });
      if (newLabel !== null) {
          setEdges((eds) => eds.map((e) => {
              if (e.id === edge.id) {
                  return {
                      ...e,
                      label: newLabel,
                      labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 12 },
                      labelBgStyle: { fill: '#18181b', fillOpacity: 0.8 },
                      labelBgPadding: [4, 4],
                      labelBgBorderRadius: 4,
                  };
              }
              return e;
          }));
      }
  };

  const ToolButton = ({ type, defaultLabel, icon: Icon, label, colorClass }: any) => (
      <button
        onClick={() => addNode(type, defaultLabel)}
        draggable
        onDragStart={e => { e.dataTransfer.setData('application/x-flow-node', JSON.stringify({ type, label: defaultLabel })); e.dataTransfer.effectAllowed = 'copy'; }}
        className={`flex flex-col items-center justify-center p-2 rounded-lg hover:bg-surface-hover transition-colors gap-1 group w-16 h-16 border border-transparent hover:border-border-strong cursor-grab`}
        title={`Add ${label} — click, or drag onto the canvas`}
      >
         <Icon className={`w-6 h-6 ${colorClass} group-hover:scale-110 transition-transform`} />
         <span className="text-[9px] text-faint group-hover:text-content">{label}</span>
      </button>
  );

  return (
    <div className="h-full w-full flex flex-col bg-bg">
      <div className="h-10 border-b border-border flex items-center gap-1 px-3 bg-bg z-10 shrink-0">
        <button onClick={() => { const prev = undoRedo.undo(); if (prev !== undefined) { setNodes(prev.nodes); setEdges(prev.edges); lastUndoPushRef.current = JSON.stringify(prev); } }} disabled={!undoRedo.canUndo} className="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 className="w-4 h-4" /></button>
        <button onClick={() => { const next = undoRedo.redo(); if (next !== undefined) { setNodes(next.nodes); setEdges(next.edges); lastUndoPushRef.current = JSON.stringify(next); } }} disabled={!undoRedo.canRedo} className="icon-btn" title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 className="w-4 h-4" /></button>
        {selectedCount > 0 && (
          <button
            onClick={handleDeleteSelected}
            className="ml-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            title="Delete selected (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete {selectedCount} selected
          </button>
        )}
        <span className="ml-auto hidden truncate pl-2 text-[11px] text-faint md:block">
          Drag between the dots on shapes to connect · double-click to rename · double-click a connection to label it
        </span>
        <SaveIndicator status={saveStatus} onSaveNow={handleManualSave} className="ml-auto md:ml-0" />
      </div>

      <div className="flex-1 flex overflow-hidden">
         <div className="w-20 bg-bg border-r border-border flex flex-col items-center py-4 gap-2 overflow-y-auto custom-scrollbar z-10">
            <div className="text-[10px] font-bold text-faint uppercase mb-2">Flow</div>
            <ToolButton type="terminal" defaultLabel="Start" icon={PlayCircle} label="Start" colorClass="text-emerald-400" />
            <ToolButton type="terminal" defaultLabel="End" icon={StopCircle} label="End" colorClass="text-red-400" />
            <ToolButton type="process" defaultLabel="Action" icon={Square} label="Process" colorClass="text-blue-400" />
            <ToolButton type="decision" defaultLabel="Condition?" icon={Diamond} label="Decision" colorClass="text-purple-400" />

            <div className="w-10 h-px bg-surface-raised my-2"></div>
            <div className="text-[10px] font-bold text-faint uppercase mb-2">Data</div>

            <ToolButton type="io" defaultLabel="Input/Output" icon={ArrowRightLeft} label="I/O" colorClass="text-orange-400" />
            <ToolButton type="database" defaultLabel="Database" icon={Database} label="Data" colorClass="text-content" />
            <ToolButton type="event" defaultLabel="On Trigger" icon={Hexagon} label="Event" colorClass="text-yellow-400" />

            <div className="w-10 h-px bg-surface-raised my-2"></div>

            <ToolButton type="note" defaultLabel="Add comment..." icon={StickyNote} label="Note" colorClass="text-yellow-200" />
         </div>

         <div ref={wrapperRef} className="flex-1 h-full w-full relative" onDragOver={onDragOver} onDrop={onDrop}>
            <EditCtx.Provider value={editCtx}>
            <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={handleNodeDoubleClick}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
            className="bg-surface"
            deleteKeyCode={['Backspace', 'Delete']}
            connectionMode={ConnectionMode.Loose}
            >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#3f3f46" />
            <Controls className="bg-surface-raised border-border-strong fill-content text-content [&>button]:border-border-strong [&>button:hover]:bg-surface-raised" />
            <MiniMap
                nodeStrokeColor="rgb(var(--color-border-strong))"
                nodeColor="rgb(var(--color-surface-raised))"
                maskColor="rgb(0 0 0 / 0.35)"
                style={{ backgroundColor: 'rgb(var(--color-surface))' }}
                pannable
                zoomable
                className="bg-bg border border-border rounded-lg overflow-hidden"
            />
            </ReactFlow>
            </EditCtx.Provider>
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="max-w-sm rounded-lg border border-border bg-surface/95 px-4 py-3 text-center text-[12px] leading-relaxed text-muted shadow-raised">
                  <div className="mb-1 text-[13px] font-medium text-content">Empty flowchart</div>
                  Click a shape on the left (or drag it here) to add it. Then drag from the small dots on a shape's edge to another shape to connect them.
                </div>
              </div>
            )}
         </div>
      </div>
    </div>
  );
};

const FlowchartEditor: React.FC<EditorProps> = (props) => (
  <ReactFlowProvider>
    <FlowchartEditorContent {...props} />
  </ReactFlowProvider>
);

export default FlowchartEditor;
