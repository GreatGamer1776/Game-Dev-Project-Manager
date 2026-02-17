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
  Save, Trash2, Check, Loader2, AlertCircle, 
  Square, Diamond, Database, 
  ArrowRightLeft, Hexagon, StickyNote, PlayCircle, StopCircle
} from 'lucide-react';
import { EditorProps } from '../types';

// --- CUSTOM NODE COMPONENTS ---

// Handle styling helper to ensure they sit on the border and don't clip
const HandleStyle = "w-3 h-3 !bg-zinc-400 border border-zinc-900 z-50 transition-colors hover:!bg-blue-400";

// 1. Terminal Node (Start/End)
const TerminalNode = ({ data, selected }: NodeProps) => (
  <div className={`px-6 py-3 rounded-full flex items-center justify-center min-w-[120px] bg-zinc-900 border-2 shadow-sm transition-all ${selected ? 'border-emerald-500 shadow-emerald-500/20' : 'border-emerald-500/50'}`}>
    <div className="text-center text-xs text-white font-semibold">{data.label}</div>
    <Handle type="target" position={Position.Top} id="top" className={`${HandleStyle} -mt-[2px]`} />
    <Handle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-[2px]`} />
    <Handle type="source" position={Position.Right} id="right" className={`${HandleStyle} -mr-[2px]`} />
    <Handle type="target" position={Position.Left} id="left" className={`${HandleStyle} -ml-[2px]`} />
  </div>
);

// 2. Process Node (Action)
const ProcessNode = ({ data, selected }: NodeProps) => (
  <div className={`px-4 py-4 rounded-lg flex items-center justify-center min-w-[140px] bg-zinc-900 border-2 shadow-sm transition-all ${selected ? 'border-blue-500 shadow-blue-500/20' : 'border-zinc-600'}`}>
    <div className="text-center text-xs text-white font-medium">{data.label}</div>
    <Handle type="target" position={Position.Top} id="top" className={`${HandleStyle} -mt-[2px]`} />
    <Handle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-[2px]`} />
    <Handle type="source" position={Position.Right} id="right" className={`${HandleStyle} -mr-[2px]`} />
    <Handle type="target" position={Position.Left} id="left" className={`${HandleStyle} -ml-[2px]`} />
  </div>
);

// 3. Decision Node - Diamond
// Handles pushed out further to prevent diagonal clipping
const DecisionNode = ({ data, selected }: NodeProps) => (
  <div className="w-28 h-28 relative flex items-center justify-center">
    <div className={`absolute inset-0 transform rotate-45 bg-zinc-900 border-2 transition-all shadow-sm ${selected ? 'border-purple-500 shadow-purple-500/20' : 'border-purple-500/60'}`}></div>
    <div className="relative z-10 p-2 text-[10px] text-white font-bold text-center leading-tight max-w-[70%]">
      {data.label}
    </div>
    <Handle type="target" position={Position.Top} id="top" className={`${HandleStyle} -mt-1`} />
    <Handle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-1`} />
    <Handle type="source" position={Position.Right} id="right" className={`${HandleStyle} -mr-1`} />
    <Handle type="source" position={Position.Left} id="left" className={`${HandleStyle} -ml-1`} />
  </div>
);

// 4. Input/Output Node
const InputOutputNode = ({ data, selected }: NodeProps) => (
  <div className="relative p-1">
    <div 
        className={`px-6 py-3 min-w-[140px] transform -skew-x-12 bg-zinc-900 border-2 transition-all shadow-sm flex items-center justify-center ${selected ? 'border-orange-500 shadow-orange-500/20' : 'border-orange-500/60'}`}
    >
        <div className="transform skew-x-12 text-center text-xs text-white font-medium">
            {data.label}
        </div>
    </div>
    <Handle type="target" position={Position.Top} id="top" className={`${HandleStyle} top-0`} />
    <Handle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} bottom-0`} />
    <Handle type="source" position={Position.Right} id="right" className={`${HandleStyle} right-1`} />
    <Handle type="target" position={Position.Left} id="left" className={`${HandleStyle} left-1`} />
  </div>
);

// 5. Database Node
const DatabaseNode = ({ data, selected }: NodeProps) => (
  <div className={`w-24 h-24 relative flex flex-col items-center justify-center bg-zinc-900 border-x-2 border-zinc-500 ${selected ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}>
    <div className="absolute top-0 w-full h-6 bg-zinc-800 border-2 border-zinc-500 rounded-[50%] -mt-3 z-10"></div>
    <div className="text-[10px] text-zinc-300 text-center px-1 z-0 mt-2 font-mono">{data.label}</div>
    <div className="absolute bottom-0 w-full h-6 bg-zinc-900 border-b-2 border-x-2 border-zinc-500 rounded-[50%] -mb-3 z-0"></div>
    <Handle type="target" position={Position.Top} id="top" className={`${HandleStyle} -mt-3`} />
    <Handle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-3`} />
    <Handle type="source" position={Position.Right} id="right" className={`${HandleStyle} -mr-[2px]`} />
    <Handle type="target" position={Position.Left} id="left" className={`${HandleStyle} -ml-[2px]`} />
  </div>
);

// 6. Event Node
const EventNode = ({ data, selected }: NodeProps) => (
  <div className={`w-32 h-16 relative flex items-center justify-center`}>
    <div 
        className={`absolute inset-0 bg-zinc-900 border-2 transition-all ${selected ? 'border-yellow-500 bg-yellow-500/10' : 'border-yellow-500/60'}`}
        style={{ clipPath: 'polygon(15% 0%, 85% 0%, 100% 50%, 85% 100%, 15% 100%, 0% 50%)' }}
    ></div>
    <div className="relative z-10 text-[10px] uppercase tracking-wider font-bold text-yellow-500 text-center px-6">
      {data.label}
    </div>
    <Handle type="target" position={Position.Top} id="top" className={`${HandleStyle} -mt-[2px]`} />
    <Handle type="source" position={Position.Bottom} id="bottom" className={`${HandleStyle} -mb-[2px]`} />
  </div>
);

// 7. Note Node
const NoteNode = ({ data, selected }: NodeProps) => (
  <div className={`w-40 min-h-[80px] bg-yellow-100/10 border-l-4 border-yellow-400 rounded p-2 flex flex-col relative ${selected ? 'ring-1 ring-yellow-400' : ''}`}>
    <div className="text-[9px] text-yellow-500/80 font-bold uppercase mb-1">Note</div>
    <div className="text-xs text-zinc-300 italic text-left whitespace-pre-wrap">{data.label}</div>
    <Handle type="target" position={Position.Left} id="left" className="w-2 h-2 !bg-yellow-400/50 opacity-0 hover:opacity-100" />
  </div>
);

// --- EDITOR COMPONENT ---

const FlowchartEditorContent: React.FC<EditorProps> = ({ initialContent, onSave, fileName }) => {
  const initialNodes = initialContent?.nodes || [];
  const initialEdges = initialContent?.edges || [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { deleteElements } = useReactFlow();

  // Save State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(JSON.stringify({ nodes: initialNodes, edges: initialEdges }));

  // Autosave Logic
  useEffect(() => {
    const currentData = JSON.stringify({ nodes, edges });
    if (currentData === lastSavedData.current) return;

    setSaveStatus('unsaved');
    const timer = setTimeout(() => handleManualSave(), 2000);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges]);

  const handleManualSave = () => {
    setSaveStatus('saving');
    onSave({ nodes, edges });
    lastSavedData.current = JSON.stringify({ nodes, edges });
    setTimeout(() => setSaveStatus('saved'), 500);
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
  }, [initialNodes, initialEdges, setNodes, setEdges]);

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

  const addNode = (type: string, label: string) => {
    const id = crypto.randomUUID();
    const position = { 
      x: Math.random() * 200 + 200, 
      y: Math.random() * 200 + 100 
    };
    
    const newNode: Node = {
      id,
      position,
      data: { label },
      type,
    };

    setNodes((nds) => nds.concat(newNode));
  };

  const handleDeleteSelected = () => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    deleteElements({ nodes: selectedNodes, edges: selectedEdges });
  };

  const handleNodeDoubleClick = (event: React.MouseEvent, node: Node) => {
    const newLabel = prompt("Enter text for this node:", node.data.label);
    if (newLabel !== null) {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) {
            return { ...n, data: { ...n.data, label: newLabel } };
          }
          return n;
        })
      );
    }
  };

  // NEW: Double-click edge to add label (Yes/No/True/False)
  const handleEdgeDoubleClick = (event: React.MouseEvent, edge: Edge) => {
      const newLabel = prompt("Enter label for this connection (e.g., 'Yes', 'No', 'True'):", edge.label || "");
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

  const ToolButton = ({ onClick, icon: Icon, label, colorClass }: any) => (
      <button 
        onClick={onClick} 
        className={`flex flex-col items-center justify-center p-2 rounded-lg hover:bg-zinc-800 transition-colors gap-1 group w-16 h-16 border border-transparent hover:border-zinc-700`}
        title={`Add ${label}`}
      >
         <Icon className={`w-6 h-6 ${colorClass} group-hover:scale-110 transition-transform`} />
         <span className="text-[9px] text-zinc-500 group-hover:text-zinc-300">{label}</span>
      </button>
  );

  return (
    <div className="h-full w-full flex flex-col bg-zinc-900">
      <div className="h-16 border-b border-zinc-800 flex items-center px-4 justify-between bg-zinc-900/50 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-4">
          <h3 className="text-zinc-200 font-medium ml-2">{fileName}</h3>
          <div className="h-6 w-px bg-zinc-800"></div>
          
          <button 
             onClick={handleDeleteSelected}
             className="p-2 hover:bg-red-500/10 rounded text-zinc-400 hover:text-red-400 transition-colors flex items-center gap-2"
             title="Delete Selected (Backspace)"
          >
             <Trash2 className="w-4 h-4" />
             <span className="text-xs font-medium hidden sm:inline">Delete Selected</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
             <div className="flex items-center mr-2">
                {saveStatus === 'saving' && <span className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>}
                {saveStatus === 'saved' && <span className="text-xs text-zinc-500 flex items-center gap-1 opacity-50"><Check className="w-3 h-3" /> Saved</span>}
                {saveStatus === 'unsaved' && <span className="text-xs text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Unsaved</span>}
            </div>
            
            <button
            onClick={handleManualSave}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/20' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}
            >
            <Save className="w-4 h-4" />
            Save
            </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
         <div className="w-20 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-4 gap-2 overflow-y-auto custom-scrollbar z-10">
            <div className="text-[10px] font-bold text-zinc-600 uppercase mb-2">Flow</div>
            <ToolButton onClick={() => addNode('terminal', 'Start')} icon={PlayCircle} label="Start" colorClass="text-emerald-400" />
            <ToolButton onClick={() => addNode('terminal', 'End')} icon={StopCircle} label="End" colorClass="text-red-400" />
            <ToolButton onClick={() => addNode('process', 'Action')} icon={Square} label="Process" colorClass="text-blue-400" />
            <ToolButton onClick={() => addNode('decision', 'Condition?')} icon={Diamond} label="Decision" colorClass="text-purple-400" />
            
            <div className="w-10 h-px bg-zinc-800 my-2"></div>
            <div className="text-[10px] font-bold text-zinc-600 uppercase mb-2">Data</div>
            
            <ToolButton onClick={() => addNode('io', 'Input/Output')} icon={ArrowRightLeft} label="I/O" colorClass="text-orange-400" />
            <ToolButton onClick={() => addNode('database', 'Database')} icon={Database} label="Data" colorClass="text-zinc-300" />
            <ToolButton onClick={() => addNode('event', 'On Trigger')} icon={Hexagon} label="Event" colorClass="text-yellow-400" />
            
            <div className="w-10 h-px bg-zinc-800 my-2"></div>
            
            <ToolButton onClick={() => addNode('note', 'Add comment...')} icon={StickyNote} label="Note" colorClass="text-yellow-200" />
         </div>

         <div className="flex-1 h-full w-full relative">
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
            className="bg-zinc-900"
            deleteKeyCode={['Backspace', 'Delete']}
            connectionMode={ConnectionMode.Loose}
            >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#3f3f46" />
            <Controls className="bg-zinc-800 border-zinc-700 fill-zinc-200 text-zinc-200 [&>button]:border-zinc-700 [&>button:hover]:bg-zinc-700" />
            <MiniMap 
                nodeStrokeColor="#52525b" 
                nodeColor="#18181b" 
                maskColor="rgba(9, 9, 11, 0.6)"
                className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden"
            />
            </ReactFlow>
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