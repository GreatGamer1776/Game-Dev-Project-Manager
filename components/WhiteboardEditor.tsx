import React, { useRef, useState, useEffect } from 'react';
import { Save, Eraser, Pen, Highlighter, Trash2, Loader2, Check, AlertCircle, Image as ImageIcon, X, Maximize2, Undo2, Redo2, Type as TypeIcon } from 'lucide-react';
import { EditorProps } from '../types';

type ToolType = 'pen' | 'highlighter' | 'eraser' | 'text';

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

interface PendingText {
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

interface StrokePoint {
  x: number;
  y: number;
}

interface HighlighterStroke {
  id: string;
  color: string;
  width: number;
  opacity: number;
  points: StrokePoint[];
}

interface WhiteboardSnapshot {
  baseData: string;
  highlighterStrokes: HighlighterStroke[];
  highlighterOpacity: number;
  compositeData: string;
}

const HISTORY_LIMIT = 200;
const CANVAS_SIZE = 2000;
const DEFAULT_HIGHLIGHTER_LAYER_ALPHA = 0.2;

const cloneHighlighterStrokes = (strokes: HighlighterStroke[]): HighlighterStroke[] =>
  strokes.map(stroke => ({
    ...stroke,
    points: stroke.points.map(point => ({ ...point }))
  }));

const sanitizeHighlighterStrokes = (value: unknown): HighlighterStroke[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw): HighlighterStroke | null => {
      const points = Array.isArray((raw as any)?.points)
        ? (raw as any).points
            .filter((p: any) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
            .map((p: any) => ({ x: Number(p.x), y: Number(p.y) }))
        : [];

      if (points.length === 0) return null;
      const color = typeof (raw as any)?.color === 'string' ? (raw as any).color : '#facc15';
      const width = Number.isFinite((raw as any)?.width) ? Math.max(1, Number((raw as any).width)) : 18;
      const opacity = Number.isFinite((raw as any)?.opacity) ? Math.min(1, Math.max(0.05, Number((raw as any).opacity))) : DEFAULT_HIGHLIGHTER_LAYER_ALPHA;

      return {
        id: typeof (raw as any)?.id === 'string' ? (raw as any).id : crypto.randomUUID(),
        color,
        width,
        opacity,
        points
      };
    })
    .filter((stroke): stroke is HighlighterStroke => stroke !== null);
};

const WhiteboardEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, assets = {} }) => {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const highlighterCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Tools & Settings
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [settings, setSettings] = useState<Record<ToolType, ToolSettings>>({
    pen: { color: '#ffffff', width: 2 },
    highlighter: { color: '#facc15', width: 18 },
    eraser: { color: '#09090b', width: 20 },
    text: { color: '#ffffff', width: 28 }
  });
  const [highlighterOpacity, setHighlighterOpacity] = useState(DEFAULT_HIGHLIGHTER_LAYER_ALPHA);

  // State
  const [isDrawing, setIsDrawing] = useState(false);
  const [isAssetMenuOpen, setIsAssetMenuOpen] = useState(false);
  const [pendingText, setPendingText] = useState<PendingText | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef<string>('');
  const historyRef = useRef<WhiteboardSnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [historyState, setHistoryState] = useState({ index: -1, length: 0 });

  // Highlighter model
  const highlighterStrokesRef = useRef<HighlighterStroke[]>([]);
  const activeHighlighterStrokeRef = useRef<HighlighterStroke | null>(null);

  // Floating Image State
  const [floatingImage, setFloatingImage] = useState<PendingImage | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isResizingImage, setIsResizingImage] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const getCanvasContexts = () => {
    const baseCanvas = baseCanvasRef.current;
    const highlighterCanvas = highlighterCanvasRef.current;
    if (!baseCanvas || !highlighterCanvas) return null;

    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    const highlighterCtx = highlighterCanvas.getContext('2d', { willReadFrequently: true });
    if (!baseCtx || !highlighterCtx) return null;

    return { baseCanvas, highlighterCanvas, baseCtx, highlighterCtx };
  };

  const fillCanvasBackground = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const clearHighlighterLayer = () => {
    const refs = getCanvasContexts();
    if (!refs) return;
    const { highlighterCtx, highlighterCanvas } = refs;
    highlighterCtx.globalAlpha = 1;
    highlighterCtx.globalCompositeOperation = 'source-over';
    highlighterCtx.clearRect(0, 0, highlighterCanvas.width, highlighterCanvas.height);
  };

  const drawHighlighterStroke = (ctx: CanvasRenderingContext2D, stroke: HighlighterStroke) => {
    if (stroke.points.length === 0) return;

    // Draw behind existing highlighter pixels so overlap does not darken.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalAlpha = stroke.opacity;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.fillStyle = stroke.color;
      ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  };

  const renderHighlighterLayer = (strokes: HighlighterStroke[] = highlighterStrokesRef.current) => {
    const refs = getCanvasContexts();
    if (!refs) return;
    const { highlighterCtx, highlighterCanvas } = refs;
    highlighterCtx.globalAlpha = 1;
    highlighterCtx.globalCompositeOperation = 'source-over';
    highlighterCtx.clearRect(0, 0, highlighterCanvas.width, highlighterCanvas.height);
    strokes.forEach(stroke => drawHighlighterStroke(highlighterCtx, stroke));
    highlighterCtx.globalAlpha = 1;
    highlighterCtx.globalCompositeOperation = 'source-over';
  };

  const loadBaseCanvasFromData = async (dataUrl: string | null | undefined) => {
    const refs = getCanvasContexts();
    if (!refs) return;
    const { baseCanvas, baseCtx } = refs;
    fillCanvasBackground(baseCtx, baseCanvas);
    if (!dataUrl) return;

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        baseCtx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = () => resolve();
    });
  };

  const composeCanvasData = () => {
    const refs = getCanvasContexts();
    if (!refs) return '';
    const { baseCanvas, highlighterCanvas } = refs;
    const composite = document.createElement('canvas');
    composite.width = baseCanvas.width;
    composite.height = baseCanvas.height;
    const ctx = composite.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(baseCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(highlighterCanvas, 0, 0);
    ctx.globalAlpha = 1;
    return composite.toDataURL('image/png');
  };

  const captureSnapshot = (): WhiteboardSnapshot | null => {
    const refs = getCanvasContexts();
    if (!refs) return null;
    const baseData = refs.baseCanvas.toDataURL('image/png');
    const compositeData = composeCanvasData();
    if (!baseData || !compositeData) return null;

    return {
      baseData,
      highlighterStrokes: cloneHighlighterStrokes(highlighterStrokesRef.current),
      highlighterOpacity,
      compositeData
    };
  };

  const syncHistoryState = () => {
    setHistoryState({ index: historyIndexRef.current, length: historyRef.current.length });
  };

  const pushHistorySnapshot = (snapshot: WhiteboardSnapshot) => {
    const base = historyRef.current.slice(0, historyIndexRef.current + 1);
    if (base[base.length - 1]?.compositeData === snapshot.compositeData) return false;
    base.push(snapshot);
    if (base.length > HISTORY_LIMIT) {
      base.splice(0, base.length - HISTORY_LIMIT);
    }
    historyRef.current = base;
    historyIndexRef.current = base.length - 1;
    syncHistoryState();
    return true;
  };

  const commitCanvasSnapshot = (autoSave: boolean = true) => {
    const snapshot = captureSnapshot();
    if (!snapshot) return;
    const changed = pushHistorySnapshot(snapshot);
    if (changed) {
      setSaveStatus('unsaved');
      if (autoSave) {
        setTimeout(() => handleManualSave(), 250);
      }
    }
  };

  const restoreHistoryIndex = async (nextIndex: number) => {
    const snapshot = historyRef.current[nextIndex];
    if (!snapshot) return;
    await loadBaseCanvasFromData(snapshot.baseData);
    highlighterStrokesRef.current = cloneHighlighterStrokes(snapshot.highlighterStrokes);
    activeHighlighterStrokeRef.current = null;
    setHighlighterOpacity(typeof snapshot.highlighterOpacity === 'number' ? snapshot.highlighterOpacity : DEFAULT_HIGHLIGHTER_LAYER_ALPHA);
    renderHighlighterLayer();
    historyIndexRef.current = nextIndex;
    syncHistoryState();
    setSaveStatus('unsaved');
    setTimeout(() => handleManualSave(), 150);
  };

  const handleUndo = async () => {
    if (historyIndexRef.current <= 0) return;
    setPendingText(null);
    await restoreHistoryIndex(historyIndexRef.current - 1);
  };

  const handleRedo = async () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    setPendingText(null);
    await restoreHistoryIndex(historyIndexRef.current + 1);
  };

  // Initialize Canvas + History
  useEffect(() => {
    const init = async () => {
      let initialBaseData: string | null = null;
      let initialHighlighterStrokes: HighlighterStroke[] = [];
      let initialOpacity = DEFAULT_HIGHLIGHTER_LAYER_ALPHA;

      if (typeof initialContent === 'string') {
        initialBaseData = initialContent;
      } else if (initialContent && typeof initialContent === 'object') {
        if (typeof (initialContent as any).baseData === 'string') {
          initialBaseData = (initialContent as any).baseData;
        } else if (typeof (initialContent as any).imageData === 'string') {
          initialBaseData = (initialContent as any).imageData;
        } else if (typeof (initialContent as any).dataUrl === 'string') {
          initialBaseData = (initialContent as any).dataUrl;
        }
        initialHighlighterStrokes = sanitizeHighlighterStrokes((initialContent as any).highlighterStrokes);
        const rawOpacity = (initialContent as any).highlighterOpacity;
        if (Number.isFinite(rawOpacity)) {
          initialOpacity = Math.min(1, Math.max(0.05, Number(rawOpacity)));
        }
      }

      await loadBaseCanvasFromData(initialBaseData);
      setHighlighterOpacity(initialOpacity);
      highlighterStrokesRef.current = initialHighlighterStrokes;
      renderHighlighterLayer();

      const snapshot = captureSnapshot();
      historyRef.current = snapshot ? [snapshot] : [];
      historyIndexRef.current = historyRef.current.length - 1;
      syncHistoryState();
      if (snapshot) {
        lastSavedData.current = snapshot.compositeData;
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!pendingText) return;
    const timer = setTimeout(() => textAreaRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [pendingText]);

  // --- MOUSE / DRAWING LOGIC ---

  const getMousePos = (e: React.MouseEvent) => {
    const canvas = highlighterCanvasRef.current || baseCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const commitPendingText = () => {
    if (!pendingText) return false;
    const trimmed = pendingText.text.trim();
    setPendingText(null);
    if (!trimmed) return false;

    const refs = getCanvasContexts();
    if (!refs) return false;

    refs.baseCtx.globalAlpha = 1;
    refs.baseCtx.globalCompositeOperation = 'source-over';
    refs.baseCtx.fillStyle = pendingText.color;
    refs.baseCtx.textBaseline = 'top';
    refs.baseCtx.font = `${Math.max(8, Math.round(pendingText.fontSize))}px sans-serif`;

    const lines = pendingText.text.split(/\r?\n/);
    const lineHeight = Math.max(10, Math.round(pendingText.fontSize * 1.3));
    lines.forEach((line, index) => {
      refs.baseCtx.fillText(line, pendingText.x, pendingText.y + index * lineHeight);
    });

    commitCanvasSnapshot(true);
    return true;
  };

  const cancelPendingText = () => {
    setPendingText(null);
  };

  const flattenHighlighterToBase = () => {
    const refs = getCanvasContexts();
    if (!refs || highlighterStrokesRef.current.length === 0) return;

    refs.baseCtx.globalCompositeOperation = 'source-over';
    refs.baseCtx.globalAlpha = 1;
    refs.baseCtx.drawImage(refs.highlighterCanvas, 0, 0);
    refs.baseCtx.globalAlpha = 1;

    highlighterStrokesRef.current = [];
    activeHighlighterStrokeRef.current = null;
    clearHighlighterLayer();
  };

  const startDrawing = (e: React.MouseEvent) => {
    if (floatingImage || isAssetMenuOpen) {
      setIsAssetMenuOpen(false);
      return;
    }

    const refs = getCanvasContexts();
    if (!refs) return;

    const { x, y } = getMousePos(e);
    const currentSettings = settings[activeTool];

    if (activeTool === 'text') {
      if (pendingText) {
        commitPendingText();
      }
      setPendingText({
        x,
        y,
        text: '',
        color: settings.text.color,
        fontSize: settings.text.width
      });
      setSaveStatus('unsaved');
      return;
    }

    if (pendingText) {
      commitPendingText();
    }

    if (activeTool === 'eraser') {
      // Eraser should affect what users see, so flatten highlight layer first.
      flattenHighlighterToBase();
    }

    if (activeTool === 'highlighter') {
      const stroke: HighlighterStroke = {
        id: crypto.randomUUID(),
        color: currentSettings.color,
        width: currentSettings.width,
        opacity: highlighterOpacity,
        points: [{ x, y }]
      };
      activeHighlighterStrokeRef.current = stroke;
      refs.highlighterCtx.globalCompositeOperation = 'destination-over';
      refs.highlighterCtx.globalAlpha = stroke.opacity;
      refs.highlighterCtx.strokeStyle = stroke.color;
      refs.highlighterCtx.lineWidth = stroke.width;
      refs.highlighterCtx.lineCap = 'round';
      refs.highlighterCtx.lineJoin = 'round';
      refs.highlighterCtx.beginPath();
      refs.highlighterCtx.moveTo(x, y);
    } else {
      refs.baseCtx.globalCompositeOperation = 'source-over';
      refs.baseCtx.globalAlpha = 1;
      refs.baseCtx.strokeStyle = currentSettings.color;
      if (activeTool === 'eraser') {
        refs.baseCtx.globalCompositeOperation = 'destination-out';
        refs.baseCtx.strokeStyle = 'rgba(0,0,0,1)';
      }
      refs.baseCtx.lineWidth = currentSettings.width;
      refs.baseCtx.lineCap = 'round';
      refs.baseCtx.lineJoin = 'round';
      refs.baseCtx.beginPath();
      refs.baseCtx.moveTo(x, y);
    }

    setIsDrawing(true);
    setSaveStatus('unsaved');
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const refs = getCanvasContexts();
    if (!refs) return;

    const { x, y } = getMousePos(e);

    if (activeTool === 'highlighter') {
      const activeStroke = activeHighlighterStrokeRef.current;
      if (!activeStroke) return;
      activeStroke.points.push({ x, y });
      refs.highlighterCtx.lineTo(x, y);
      refs.highlighterCtx.stroke();
      refs.highlighterCtx.beginPath();
      refs.highlighterCtx.moveTo(x, y);
      return;
    }

    refs.baseCtx.lineTo(x, y);
    refs.baseCtx.stroke();
    refs.baseCtx.beginPath();
    refs.baseCtx.moveTo(x, y);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const refs = getCanvasContexts();
    if (!refs) return;

    if (activeTool === 'highlighter') {
      refs.highlighterCtx.closePath();
      refs.highlighterCtx.globalAlpha = 1;
      refs.highlighterCtx.globalCompositeOperation = 'source-over';

      const stroke = activeHighlighterStrokeRef.current;
      if (stroke) {
        if (stroke.points.length === 1) {
          stroke.points.push({ ...stroke.points[0] });
        }
        highlighterStrokesRef.current = [...highlighterStrokesRef.current, {
          ...stroke,
          points: stroke.points.map(point => ({ ...point }))
        }];
        activeHighlighterStrokeRef.current = null;
        renderHighlighterLayer();
      }
    } else {
      refs.baseCtx.closePath();
      refs.baseCtx.globalAlpha = 1;
      refs.baseCtx.globalCompositeOperation = 'source-over';
    }

    commitCanvasSnapshot(true);
  };

  // --- ASSET IMPORT LOGIC ---

  const handleInitImport = (base64: string) => {
    const container = containerRef.current;
    if (!container) return;

    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const viewRect = container.getBoundingClientRect();
      const scrollX = container.scrollLeft;
      const scrollY = container.scrollTop;

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
    const refs = getCanvasContexts();
    if (!refs) return;

    const img = new Image();
    img.src = floatingImage.src;
    img.onload = () => {
      refs.baseCtx.globalAlpha = 1;
      refs.baseCtx.globalCompositeOperation = 'source-over';
      refs.baseCtx.drawImage(img, floatingImage.x, floatingImage.y, floatingImage.width, floatingImage.height);
      setFloatingImage(null);
      commitCanvasSnapshot(true);
    };
  };

  const handleDiscardImage = () => {
    setFloatingImage(null);
  };

  // --- FLOATING IMAGE INTERACTION ---

  const handleImageMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
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
      y: e.clientY
    };
  };

  const handleWindowMouseMove = (e: React.MouseEvent) => {
    if (isDraggingImage && floatingImage) {
      setFloatingImage({
        ...floatingImage,
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      });
    } else if (isResizingImage && floatingImage) {
      const deltaX = e.clientX - dragOffset.current.x;
      const newWidth = Math.max(50, floatingImage.width + deltaX);
      const newHeight = newWidth / floatingImage.originalAspect;

      setFloatingImage({
        ...floatingImage,
        width: newWidth,
        height: newHeight
      });
      dragOffset.current = { x: e.clientX, y: e.clientY };
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
    // Note: LibreWolf with RFP enabled might return white noise here
    try {
      const dataUrl = composeCanvasData();
      if (!dataUrl) return;
      if (dataUrl !== lastSavedData.current) {
        setSaveStatus('saving');
        onSave(dataUrl);
        lastSavedData.current = dataUrl;
        setTimeout(() => setSaveStatus('saved'), 500);
      }
    } catch (e) {
      console.error('Canvas save blocked', e);
      setSaveStatus('unsaved');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const clearCanvas = () => {
    if (!confirm('Clear whiteboard? This cannot be undone.')) return;
    const refs = getCanvasContexts();
    if (!refs) return;
    fillCanvasBackground(refs.baseCtx, refs.baseCanvas);
    setPendingText(null);
    highlighterStrokesRef.current = [];
    activeHighlighterStrokeRef.current = null;
    clearHighlighterLayer();
    commitCanvasSnapshot(true);
  };

  const assetList = Object.entries(assets);
  const canUndo = historyState.index > 0;
  const canRedo = historyState.index >= 0 && historyState.index < historyState.length - 1;

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
              onClick={() => setActiveTool('highlighter')}
              className={`p-2 rounded transition-all ${activeTool === 'highlighter' ? 'bg-yellow-500 text-black shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Highlighter"
            >
              <Highlighter className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTool('eraser')}
              className={`p-2 rounded transition-all ${activeTool === 'eraser' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Eraser"
            >
              <Eraser className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTool('text')}
              className={`p-2 rounded transition-all ${activeTool === 'text' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Text"
            >
              <TypeIcon className="w-4 h-4" />
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
            {(activeTool === 'pen' || activeTool === 'highlighter' || activeTool === 'text') && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings[activeTool].color}
                  onChange={(e) => updateSetting('color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
                  title={activeTool === 'highlighter' ? 'Highlighter Color' : activeTool === 'text' ? 'Text Color' : 'Pen Color'}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${activeTool === 'eraser' ? 'bg-zinc-500' : 'bg-current'}`} style={{ color: settings[activeTool].color }}></div>
              <input
                type="range"
                min={activeTool === 'text' ? '8' : '1'}
                max={activeTool === 'eraser' ? '100' : activeTool === 'highlighter' ? '80' : activeTool === 'text' ? '96' : '50'}
                value={settings[activeTool].width}
                onChange={(e) => updateSetting('width', parseInt(e.target.value, 10))}
                className="w-24 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {activeTool === 'highlighter' && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">Opacity</span>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={highlighterOpacity}
                  onChange={(e) => setHighlighterOpacity(parseFloat(e.target.value))}
                  className="w-24 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                />
                <span className="text-[11px] text-zinc-400 w-8 text-right">{Math.round(highlighterOpacity * 100)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="text-zinc-500 hover:text-zinc-200 p-2 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="text-zinc-500 hover:text-zinc-200 p-2 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Redo (Ctrl/Cmd+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
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
      <div className={`flex-1 overflow-auto bg-[#09090b] relative custom-scrollbar touch-none ${activeTool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`} ref={containerRef}>
        <div className="min-w-full min-h-full inline-block relative">
          <div className="relative" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
            <canvas
              ref={baseCanvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="absolute inset-0 block"
            />

            <canvas
              ref={highlighterCanvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="absolute inset-0 block"
            />

            {pendingText && (
              <div
                className="absolute z-20 min-w-[260px] max-w-[420px] bg-zinc-900/95 border border-zinc-700 rounded-lg p-2 shadow-2xl"
                style={{ left: pendingText.x, top: pendingText.y }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <textarea
                  ref={textAreaRef}
                  value={pendingText.text}
                  onChange={(e) => setPendingText(prev => prev ? { ...prev, text: e.target.value } : prev)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      commitPendingText();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelPendingText();
                    }
                  }}
                  placeholder="Type text..."
                  rows={3}
                  className="w-full min-h-[92px] bg-zinc-950 border border-zinc-800 rounded-md p-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 resize-y"
                  style={{ color: pendingText.color, fontSize: `${pendingText.fontSize}px`, lineHeight: `${Math.max(10, Math.round(pendingText.fontSize * 1.3))}px` }}
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={cancelPendingText}
                    className="px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={commitPendingText}
                    className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Add Text
                  </button>
                </div>
              </div>
            )}

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
    </div>
  );
};

export default WhiteboardEditor;
