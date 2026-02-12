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
  ConnectionMode, // NEW: Import ConnectionMode
} from 'reactflow';
import { Save, MousePointer2, Square, Circle, Diamond, Database, PlayCircle, Trash2, Check, Loader2, AlertCircle } from 'lucide-react';
import { EditorProps } from '../types';

// --- Custom Node Components ---

// Updated DiamondNode (Decision)
// - Larger handles
// - Handles pushed slightly outward with negative margins for easier clicking
// - Z-Index increased
const DiamondNode = ({ data, selected }: NodeProps) => (
  <div className="w-24 h-24 relative flex items-center justify-center">
    <div className={`absolute w-[4.25rem] h-[4.25rem] transform rotate-45 bg-zinc-900 border-2 transition-colors shadow-lg z-0 ${selected ? 'border-blue-500 shadow-blue-500/20' : 'border-purple-500/50'}`}></div>
    <div className="relative z-10 p-1 text-xs text-white font-medium break-words text-center pointer-events-none max-w-[90%]">
      {data.label}
    </div>
    {/* Tips of the diamond touch the edges of the w-24 h-24 container. We push handles out slightly. */}
    <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-zinc-400 z-50 -mt-2 border border-zinc-900" />
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-zinc-400 z-50 -mb-2 border border-zinc-900" />
    <Handle type="source" position={Position.Left} className="w-3 h-3 !bg-zinc-400 z-50 -ml-2 border border-zinc-900" />
    <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-zinc-400 z-50 -mr-2 border border-zinc-900" />
  </div>
);

// Updated DatabaseNode
const DatabaseNode = ({ data, selected }: NodeProps) => (
  <div className={`w-24 h-32 relative flex flex-col items-center justify-center bg-zinc-900 border-x-2 border-zinc-600 rounded-lg ${selected ? 'ring-2 ring-blue-500' : ''}`}>
    <div className="absolute top-0 w-full h-8 bg-zinc-800 border-2 border-zinc-600 rounded-[50%] -mt-4 z-10"></div>
    <div className="text-xs text-white text-center p-2 z-0 mt-2">{data.label}</div>
    <div className="absolute bottom-0 w-full h-8 bg-zinc-900 border-b-2 border-x-2 border-zinc-600 rounded-[50%] -mb-4 z-0"></div>
    <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-zinc-400 z-50 -mt-3" />
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-zinc-400 z-50 -mb-3" />
  </div>
);

// Updated CircleNode (Start/End)
// - Mixed Source/Target handles for better flow flexibility (Top/Left = In, Bottom/Right = Out)
// - Larger handles
const CircleNode = ({ data, selected }: NodeProps) => (
  <div className={`w-24 h-24 rounded-full flex items-center justify-center bg-zinc-900 border-2 ${selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-emerald-500/50'}`}>
    <div className="text-center text-xs text-white font-medium p-2">{data.label}</div>
    <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-zinc-400 z-50 -mt-1" />
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-zinc-400 z-50 -mb-1" />
    {/* Left is now Target (Input) and Right is Source (Output) for L-R flows */}
    <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-zinc-400 z-50 -mr-1" />
    <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-zinc-400 z-50 -ml-1" />
  </div>
);

// --- Editor Component ---

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
    const timer = setTimeout(() => {
      handleManualSave();
    }, 2000);

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

  // Define custom node types
  const nodeTypes = useMemo(() => ({
    diamond: DiamondNode,
    database: DatabaseNode,
    circle: CircleNode,
  }), []);

  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    lastSavedData.current = JSON.stringify({ nodes: initialNodes, edges: initialEdges });
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#71717a' } }, eds)),
    [setEdges]
  );

  const addNode = (type: string, label: string) => {
    const id = crypto.randomUUID();
    const position = { 
      x: Math.random() * 300 + 100, 
      y: Math.random() * 300 + 100 
    };
    
    let newNode: Node = {
      id,
      position,
      data: { label },
      type: type === 'rect' ? 'default' : type,
    };

    if (type === 'rect') {
      newNode.style = { 
        background: '#18181b', 
        color: '#fff', 
        border: '1px solid #3f3f46', 
        borderRadius: '8px', 
        width: 150,
        padding: '10px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      };
    }

    setNodes((nds) => nds.concat(newNode));
  };

  const handleDeleteSelected = () => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    deleteElements({ nodes: selectedNodes, edges: selectedEdges });
  };

  const handleNodeDoubleClick = (event: React.MouseEvent, node: Node) => {
    const newLabel = prompt("Enter new name for this node:", node.data.label);
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

  return (
    <div className="h-full w-full flex flex-col bg-zinc-900">
      <div className="h-16 border-b border-zinc-800 flex items-center px-4 justify-between bg-zinc-900/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
          <h3 className="text-zinc-200 font-medium ml-2">{fileName}</h3>
          <div className="h-6 w-px bg-zinc-700"></div>
          
          <div className="flex items-center gap-1">
             <span className="text-xs text-zinc-500 uppercase font-bold mr-2">Widgets:</span>
             <button onClick={() => addNode('circle', 'Start')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-emerald-400 transition-colors" title="Start/End">
                <Circle className="w-5 h-5" />
             </button>
             <button onClick={() => addNode('rect', 'Process')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-blue-400 transition-colors" title="Process">
                <Square className="w-5 h-5" />
             </button>
             <button onClick={() => addNode('diamond', 'Decision')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-purple-400 transition-colors" title="Decision">
                <Diamond className="w-5 h-5" />
             </button>
             <button onClick={() => addNode('database', 'DB')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-orange-400 transition-colors" title="Database">
                <Database className="w-5 h-5" />
             </button>
          </div>

          <div className="h-6 w-px bg-zinc-700 mx-2"></div>
          
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

      <div className="flex-1 h-full w-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={handleNodeDoubleClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-zinc-950"
          deleteKeyCode={['Backspace', 'Delete']}
          // IMPORTANT: Loose connection mode allows connecting any handle to any handle
          // This prevents frustration when users try to connect "Source to Source" visually
          connectionMode={ConnectionMode.Loose}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#27272a" />
          <Controls className="bg-zinc-800 border-zinc-700 fill-zinc-200 text-zinc-200 [&>button]:border-zinc-700 [&>button:hover]:bg-zinc-700" />
          <MiniMap 
            nodeStrokeColor="#52525b" 
            nodeColor="#18181b" 
            maskColor="rgba(9, 9, 11, 0.6)"
            className="bg-zinc-900 border border-zinc-800"
          />
        </ReactFlow>
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