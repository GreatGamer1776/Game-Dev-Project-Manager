import React, { useRef, useState, useEffect } from 'react';
import { Save, Eraser, Pen, MousePointer, Trash2, Undo, Redo, Loader2, Check, AlertCircle } from 'lucide-react';
import { EditorProps } from '../types';

const WhiteboardEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(2);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  
  // Save State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(initialContent);

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load image if exists
    if (initialContent) {
        const img = new Image();
        img.src = initialContent;
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
        };
    } else {
        // Fill black background
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []); // Run once on mount

  const handleManualSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSaveStatus('saving');
    onSave(dataUrl);
    lastSavedData.current = dataUrl;
    setTimeout(() => setSaveStatus('saved'), 500);
  };

  // Drawing Logic
  const startDrawing = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setSaveStatus('unsaved');
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.strokeStyle = tool === 'eraser' ? '#09090b' : color;
    ctx.lineWidth = tool === 'eraser' ? 20 : lineWidth;
    ctx.lineCap = 'round';
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
        setIsDrawing(false);
        // Debounced autosave could go here
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if(confirm("Clear entire whiteboard?")) {
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setSaveStatus('unsaved');
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-20">
        <h3 className="text-zinc-200 font-medium">{fileName}</h3>
        
        {/* Toolbar */}
        <div className="flex items-center gap-2 bg-zinc-800 p-1 rounded-lg border border-zinc-700">
            <button onClick={() => setTool('pen')} className={`p-2 rounded ${tool === 'pen' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`}><Pen className="w-4 h-4" /></button>
            <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-zinc-600 text-white' : 'text-zinc-400'}`}><Eraser className="w-4 h-4" /></button>
            <div className="w-px h-6 bg-zinc-700 mx-1"></div>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none" />
            <input type="range" min="1" max="20" value={lineWidth} onChange={(e) => setLineWidth(parseInt(e.target.value))} className="w-24 accent-white" />
        </div>

        <div className="flex items-center gap-3">
             <div className="flex items-center mr-2">
                {saveStatus === 'saving' && <span className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>}
                {saveStatus === 'saved' && <span className="text-xs text-zinc-500 flex items-center gap-1 opacity-50"><Check className="w-3 h-3" /> Saved</span>}
                {saveStatus === 'unsaved' && <span className="text-xs text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Unsaved</span>}
            </div>
            <button onClick={clearCanvas} className="text-zinc-500 hover:text-red-400 p-2"><Trash2 className="w-4 h-4" /></button>
            <button onClick={handleManualSave} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/20' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}>
                <Save className="w-4 h-4" /> Save
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-[#09090b] cursor-crosshair">
        <canvas
            ref={canvasRef}
            width={2000}
            height={2000}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            className="touch-none"
        />
      </div>
    </div>
  );
};

export default WhiteboardEditor;