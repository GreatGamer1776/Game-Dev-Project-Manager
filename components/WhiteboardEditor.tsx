--- FILE: Game-Dev-Project-Manager/components/WhiteboardEditor.tsx ---
import React, { useRef, useState, useEffect } from 'react';
import { Save, Eraser, Pen, Trash2, Loader2, Check, AlertCircle, Image as ImageIcon, X, Move, Maximize2 } from 'lucide-react';
import { EditorProps } from '../types';

type ToolType = 'pen' | 'eraser';

interface ToolSettings {
  color: string;
  width: number;
}

interface PendingImage {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  originalAspect: number;
}

const WhiteboardEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, assets = {} }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Tools & Settings
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [settings, setSettings] = useState<Record<ToolType, ToolSettings>>({
    pen: { color: '#ffffff', width: 2 },
    eraser: { color: '#09090b', width: 20 }
  });
  
  // State
  const [isDrawing, setIsDrawing] = useState(false);
  const [isAssetMenuOpen, setIsAssetMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef(initialContent);

  // Floating Image State (Import -> Move/Resize -> Stamp)
  const [floatingImage, setFloatingImage] = useState<PendingImage | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isResizingImage, setIsResizingImage] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Initialize Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // 1. Fill background immediately to prevent transparency glitches
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Load content
    if (initialContent) {
        const img = new Image();
        img.src = initialContent;
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
        };
    }
  }, []);

  // --- MOUSE / DRAWING LOGIC ---

  const getMousePos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e: React.MouseEvent) => {
    // If placing an image, clicking outside doesn't draw, it might confirm or just ignore.
    // We allow drawing ONLY if not hovering the floating image (handled by z-index/events on div)
    if (floatingImage || isAssetMenuOpen) {
        setIsAssetMenuOpen(false);
        return;
    }

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    const { x, y } = getMousePos(e);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    // Ensure we are using the latest settings from state closure
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
        setTimeout(handleManualSave, 1000);
    }
  };

  // --- ASSET IMPORT LOGIC ---

  const handleInitImport = (base64: string) => {
      const container = containerRef.current;
      if (!container) return;

      const img = new Image();
      img.src = base64;
      img.onload = () => {
          // Place in center of CURRENT view
          const viewRect = container.getBoundingClientRect();
          const scrollX = container.scrollLeft;
          const scrollY = container.scrollTop;
          
          // Default size (max 400px width, keep aspect)
          const maxWidth = 400;
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const width = img.width * scale;
          const height = img.height * scale;

          setFloatingImage({
              src: base64,
              x: scrollX + (viewRect.width / 2) - (width / 2),
              y: scrollY + (viewRect.height / 2) - (height / 2),
              width,
              height,
              originalAspect: img.width / img.height
          });
          setIsAssetMenuOpen(false);
      };
  };

  const handleStampImage = () => {
      if (!floatingImage) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const img = new Image();
      img.src = floatingImage.src;
      img.onload = () => {
          ctx.drawImage(img, floatingImage.x, floatingImage.y, floatingImage.width, floatingImage.height);
          setFloatingImage(null); // Clear floating state
          setSaveStatus('unsaved');
          handleManualSave();
      };
  };

  const handleDiscardImage = () => {
      setFloatingImage(null);
  };

  // --- FLOATING IMAGE INTERACTION ---

  const handleImageMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent canvas drawing
      if (!floatingImage) return;
      setIsDraggingImage(true);
      dragOffset.current = {
          x: e.clientX - floatingImage.x,
          y: e.clientY - floatingImage.y
      };
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsResizingImage(true);
      dragOffset.current = {
          x: e.clientX,
          y: e.clientY // Store initial mouse pos
      };
  };

  // Global mouse move for dragging/resizing image overlay
  const handleWindowMouseMove = (e: React.MouseEvent) => {
      if (isDraggingImage && floatingImage) {
          setFloatingImage({
              ...floatingImage,
              x: e.clientX - dragOffset.current.x,
              y: e.clientY - dragOffset.current.y
          });
      } else if (isResizingImage && floatingImage) {
          const deltaX = e.clientX - dragOffset.current.x;
          // Maintain aspect ratio logic could go here
          const newWidth = Math.max(50, floatingImage.width + deltaX);
          const newHeight = newWidth / floatingImage.originalAspect;
          
          setFloatingImage({
              ...floatingImage,
              width: newWidth,
              height: newHeight
          });
          dragOffset.current = { x: e.clientX, y: e.clientY }; // Reset for next delta
      }
  };

  const handleWindowMouseUp = () => {
      setIsDraggingImage(false);
      setIsResizingImage(false);
  };

  // --- SAVING & UTILS ---

  const updateSetting = (key: keyof ToolSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [activeTool]: { ...prev[activeTool], [key]: value }
    }));
  };

  const handleManualSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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

  const assetList = Object.entries(assets);

  return (
    <div 
        className="h-full flex flex-col bg-zinc-900 relative"
        onMouseMove={handleWindowMouseMove}
        onMouseUp={handleWindowMouseUp}
        onMouseLeave={handleWindowMouseUp}
    >
      {/* Toolbar */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 sm:px-6 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-20 shrink-0 select-none">
        <h3 className="text-zinc-200 font-medium truncate max-w-[100px] sm:max-w-none">{fileName}</h3>
        
        <div className="flex items-center gap-4">
            {/* Tools */}
            <div className="flex bg-zinc-800 p-1 rounded-lg border border-zinc-700">
                <button 
                    onClick={() => setActiveTool('pen')} 
                    className={`p-2 rounded transition-all ${activeTool === 'pen' ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
                    title="Pen"
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
                    title="Import Image"
                >
                    <ImageIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Settings */}
            <div className="flex items-center gap-3 bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-800 hidden md:flex">
                {activeTool === 'pen' && (
                    <div className="flex items-center gap-2 relative group">
                        <div className="w-6 h-6 rounded-full border border-zinc-600 cursor-pointer overflow-hidden shadow-inner relative" style={{ backgroundColor: settings.pen.color }}>
                            <input 
                                type="color" 
                                value={settings.pen.color} 
                                onInput={(e) => updateSetting('color', (e.target as HTMLInputElement).value)}
                                onChange={(e) => updateSetting('color', (e.target as HTMLInputElement).value)}
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
                    />
                </div>
            </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
             <div className="flex items-center mr-2 hidden sm:flex">
                {saveStatus === 'saving' && <span className="text-xs text-zinc-500"><Loader2 className="w-3 h-3 animate-spin" /></span>}
                {saveStatus === 'saved' && <span className="text-xs text-zinc-500 opacity-50"><Check className="w-3 h-3" /></span>}
                {saveStatus === 'unsaved' && <span className="text-xs text-orange-400"><AlertCircle className="w-3 h-3" /></span>}
            </div>
            <button onClick={clearCanvas} className="text-zinc-500 hover:text-red-400 p-2"><Trash2 className="w-4 h-4" /></button>
            <button onClick={handleManualSave} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-lg ${saveStatus === 'unsaved' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-200'}`}>
                <Save className="w-4 h-4" /> Save
            </button>
        </div>
      </div>

      {/* Asset Picker */}
      {isAssetMenuOpen && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 w-80 max-h-[400px] flex flex-col">
              <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-semibold text-zinc-200">Select Asset</h4>
                  <button onClick={() => setIsAssetMenuOpen(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 overflow-y-auto custom-scrollbar flex-1">
                  {assetList.length > 0 ? assetList.map(([id, base64]) => (
                      <button 
                        key={id} 
                        onClick={() => handleInitImport(base64)}
                        className="aspect-square bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden hover:border-purple-500 transition-colors relative"
                      >
                          <img src={base64} alt="asset" className="w-full h-full object-contain pointer-events-none" />
                      </button>
                  )) : (
                      <div className="col-span-3 text-center py-4 text-xs text-zinc-500">No assets found.</div>
                  )}
              </div>
          </div>
      )}

      {/* Canvas Container */}
      <div className="flex-1 overflow-auto bg-[#09090b] relative custom-scrollbar cursor-crosshair touch-none" ref={containerRef}>
        <div className="min-w-full min-h-full inline-block relative">
            
            <canvas
                ref={canvasRef}
                width={2000}
                height={2000}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="block"
            />

            {/* Floating Image Layer */}
            {floatingImage && (
                <div 
                    className="absolute border-2 border-blue-500 shadow-xl group cursor-move"
                    style={{
                        left: floatingImage.x,
                        top: floatingImage.y,
                        width: floatingImage.width,
                        height: floatingImage.height,
                        zIndex: 10
                    }}
                    onMouseDown={handleImageMouseDown}
                    onDoubleClick={handleStampImage}
                >
                    <img 
                        src={floatingImage.src} 
                        className="w-full h-full object-fill pointer-events-none" 
                        alt="floating" 
                    />
                    
                    {/* Controls Header */}
                    <div className="absolute -top-10 left-0 right-0 h-8 flex items-center justify-center gap-2 bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-700 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={handleStampImage} className="p-1 hover:bg-emerald-500/20 text-emerald-400 rounded" title="Stamp (Double Click)"><Check className="w-4 h-4" /></button>
                        <div className="w-px h-4 bg-zinc-700"></div>
                        <button onClick={handleDiscardImage} className="p-1 hover:bg-red-500/20 text-red-400 rounded" title="Discard"><X className="w-4 h-4" /></button>
                    </div>

                    {/* Resize Handle */}
                    <div 
                        className="absolute -bottom-2 -right-2 w-6 h-6 bg-blue-500 rounded-full cursor-nwse-resize flex items-center justify-center border-2 border-white shadow-sm z-20"
                        onMouseDown={handleResizeMouseDown}
                    >
                        <Maximize2 className="w-3 h-3 text-white" />
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default WhiteboardEditor;