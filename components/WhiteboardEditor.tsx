import React, { useRef, useState, useEffect } from 'react';
import { Save, Eraser, Pen, Trash2, Loader2, Check, AlertCircle, Image as ImageIcon, X } from 'lucide-react';
import { EditorProps } from '../types';

type ToolType = 'pen' | 'eraser';

interface ToolSettings {
  color: string;
  width: number;
}

const WhiteboardEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, assets = {} }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [settings, setSettings] = useState<Record<ToolType, ToolSettings>>({
    pen: { color: '#ffffff', width: 2 },
    eraser: { color: '#09090b', width: 20 }
  });
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [isAssetMenuOpen, setIsAssetMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(initialContent);

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // 1. Always fill background first to prevent transparent-pixel glitches
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Load saved content on top
    if (initialContent) {
        const img = new Image();
        img.src = initialContent;
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
        };
    }
  }, []); // Run once on mount

  const updateSetting = (key: keyof ToolSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [activeTool]: {
        ...prev[activeTool],
        [key]: value
      }
    }));
  };

  // Helper to get coordinates relative to canvas
  const getMousePos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width), // Account for CSS scaling
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e: React.MouseEvent) => {
    if (isAssetMenuOpen) setIsAssetMenuOpen(false); // Close menu if drawing starts

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    const { x, y } = getMousePos(e);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    // Explicitly set context styles from state
    const currentSettings = settings[activeTool];
    ctx.strokeStyle = activeTool === 'eraser' ? '#09090b' : currentSettings.color;
    ctx.lineWidth = currentSettings.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setIsDrawing(true);
    setSaveStatus('unsaved');
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    const { x, y } = getMousePos(e);
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
        setIsDrawing(false);
        const ctx = canvasRef.current?.getContext('2d');
        ctx?.closePath();
        // Debounce autosave
        setTimeout(handleManualSave, 2000);
    }
  };

  const handleManualSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Save as PNG
    const dataUrl = canvas.toDataURL('image/png');
    
    if (dataUrl !== lastSavedData.current) {
        setSaveStatus('saving');
        onSave(dataUrl);
        lastSavedData.current = dataUrl;
        setTimeout(() => setSaveStatus('saved'), 500);
    }
  };

  const clearCanvas = () => {
    if(!confirm("Clear whiteboard? This cannot be undone.")) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setSaveStatus('unsaved');
    handleManualSave();
  };

  const handleInsertAsset = (base64: string) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const img = new Image();
      img.src = base64;
      img.onload = () => {
          // Draw in center of current view if possible, or center of canvas
          // For simplicity in this version, we draw at 100,100 or center
          const x = (canvas.width - img.width) / 2;
          const y = (canvas.height - img.height) / 2;
          ctx.drawImage(img, x > 0 ? x : 0, y > 0 ? y : 0);
          setSaveStatus('unsaved');
          handleManualSave();
          setIsAssetMenuOpen(false);
      };
  };

  const assetList = Object.entries(assets);

  return (
    <div className="h-full flex flex-col bg-zinc-900 relative">
      {/* Toolbar Header */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 sm:px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-4">
            <h3 className="text-zinc-200 font-medium truncate max-w-[100px] sm:max-w-none">{fileName}</h3>
            
            <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>

            {/* Tool Selection */}
            <div className="flex bg-zinc-800 p-1 rounded-lg border border-zinc-700">
                <button 
                    onClick={() => setActiveTool('pen')} 
                    className={`p-2 rounded transition-all ${activeTool === 'pen' ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                    title="Pen Tool"
                >
                    <Pen className="w-4 h-4" />
                </button>
                <button 
                    onClick={() => setActiveTool('eraser')} 
                    className={`p-2 rounded transition-all ${activeTool === 'eraser' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                    title="Eraser"
                >
                    <Eraser className="w-4 h-4" />
                </button>
                <div className="w-px h-full bg-zinc-700 mx-1"></div>
                <button 
                    onClick={() => setIsAssetMenuOpen(!isAssetMenuOpen)}
                    className={`p-2 rounded transition-all ${isAssetMenuOpen ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                    title="Insert Asset"
                >
                    <ImageIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Active Tool Settings */}
            <div className="flex items-center gap-3 bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-800 hidden md:flex">
                {activeTool === 'pen' && (
                    <div className="flex items-center gap-2 relative group">
                        <div 
                            className="w-6 h-6 rounded-full border border-zinc-600 cursor-pointer overflow-hidden shadow-inner relative" 
                            style={{ backgroundColor: settings.pen.color }}
                        >
                            <input 
                                type="color" 
                                value={settings.pen.color} 
                                onChange={(e) => updateSetting('color', e.target.value)}
                                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                title="Change Color"
                            />
                        </div>
                    </div>
                )}
                
                <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${activeTool === 'eraser' ? 'bg-zinc-500' : 'bg-current'}`} style={{ color: settings[activeTool].color }}></div>
                    <input 
                        type="range" 
                        min="1" 
                        max={activeTool === 'eraser' ? "100" : "50"} 
                        value={settings[activeTool].width} 
                        onChange={(e) => updateSetting('width', parseInt(e.target.value))}
                        className="w-24 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                        title={`Size: ${settings[activeTool].width}px`}
                    />
                </div>
            </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
             <div className="flex items-center mr-2 hidden sm:flex">
                {saveStatus === 'saving' && <span className="text-xs text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /></span>}
                {saveStatus === 'saved' && <span className="text-xs text-zinc-500 flex items-center gap-1 opacity-50"><Check className="w-3 h-3" /></span>}
                {saveStatus === 'unsaved' && <span className="text-xs text-orange-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /></span>}
            </div>
            <button onClick={clearCanvas} className="text-zinc-500 hover:text-red-400 p-2 rounded hover:bg-zinc-800 transition-colors" title="Clear Canvas">
                <Trash2 className="w-4 h-4" />
            </button>
            <button 
                onClick={handleManualSave} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/20' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}
            >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Save</span>
            </button>
        </div>
      </div>

      {/* Asset Picker Dropdown */}
      {isAssetMenuOpen && (
          <div className="absolute top-16 left-20 z-30 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 w-72 max-h-[400px] flex flex-col">
              <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-semibold text-zinc-200">Assets</h4>
                  <button onClick={() => setIsAssetMenuOpen(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 overflow-y-auto custom-scrollbar flex-1">
                  {assetList.length > 0 ? assetList.map(([id, base64]) => (
                      <button 
                        key={id} 
                        onClick={() => handleInsertAsset(base64)}
                        className="aspect-square bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden hover:border-purple-500 transition-colors relative"
                        title={id}
                      >
                          <img src={base64} alt="asset" className="w-full h-full object-contain" />
                      </button>
                  )) : (
                      <div className="col-span-3 text-center py-4 text-xs text-zinc-500">
                          No assets found. Upload some in the Asset Browser.
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Canvas Area */}
      <div className="flex-1 overflow-auto bg-[#09090b] relative custom-scrollbar cursor-crosshair" ref={containerRef}>
        <div className="min-w-full min-h-full inline-block">
            <canvas
                ref={canvasRef}
                width={2000}
                height={2000}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="touch-none block"
            />
        </div>
      </div>
    </div>
  );
};

export default WhiteboardEditor;