import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Save, Eraser, Pen, Highlighter, Trash2, Loader2, Check, AlertCircle, Image as ImageIcon, X, Maximize2, Undo2, Redo2, Type as TypeIcon, Upload } from 'lucide-react';
import { EditorProps } from '../types';

type ToolType = 'pen' | 'highlighter' | 'eraser' | 'text';
type MediaType = 'image' | 'video' | 'audio';
type SelectedElement = { kind: 'text' | 'media'; id: string } | null;

interface ToolSettings {
  color: string;
  width: number;
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

interface TextElement {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
}

interface MediaElement {
  id: string;
  type: MediaType;
  src: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WhiteboardSnapshot {
  baseData: string;
  highlighterStrokes: HighlighterStroke[];
  highlighterOpacity: number;
  textElements: TextElement[];
  mediaElements: MediaElement[];
  signature: string;
}

const HISTORY_LIMIT = 200;
const CANVAS_SIZE = 2000;
const DEFAULT_HIGHLIGHTER_LAYER_ALPHA = 0.2;

const cloneHighlighterStrokes = (strokes: HighlighterStroke[]): HighlighterStroke[] =>
  strokes.map(stroke => ({
    ...stroke,
    points: stroke.points.map(point => ({ ...point }))
  }));

const cloneTextElements = (elements: TextElement[]): TextElement[] => elements.map(element => ({ ...element }));
const cloneMediaElements = (elements: MediaElement[]): MediaElement[] => elements.map(element => ({ ...element }));

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

const sanitizeTextElements = (value: unknown): TextElement[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): TextElement | null => {
      if (!Number.isFinite((raw as any)?.x) || !Number.isFinite((raw as any)?.y)) return null;
      if (typeof (raw as any)?.text !== 'string') return null;
      return {
        id: typeof (raw as any)?.id === 'string' ? (raw as any).id : crypto.randomUUID(),
        x: Number((raw as any).x),
        y: Number((raw as any).y),
        text: (raw as any).text,
        color: typeof (raw as any)?.color === 'string' ? (raw as any).color : '#ffffff',
        fontSize: Number.isFinite((raw as any)?.fontSize) ? Math.max(8, Number((raw as any).fontSize)) : 28,
        fontWeight: (raw as any)?.fontWeight === 'bold' ? 'bold' : 'normal',
        fontStyle: (raw as any)?.fontStyle === 'italic' ? 'italic' : 'normal'
      };
    })
    .filter((element): element is TextElement => element !== null);
};

const sanitizeMediaElements = (value: unknown): MediaElement[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): MediaElement | null => {
      const type = (raw as any)?.type;
      if (type !== 'image' && type !== 'video' && type !== 'audio') return null;
      if (typeof (raw as any)?.src !== 'string') return null;
      if (!Number.isFinite((raw as any)?.x) || !Number.isFinite((raw as any)?.y)) return null;
      if (!Number.isFinite((raw as any)?.width) || !Number.isFinite((raw as any)?.height)) return null;
      return {
        id: typeof (raw as any)?.id === 'string' ? (raw as any).id : crypto.randomUUID(),
        type,
        src: (raw as any).src,
        name: typeof (raw as any)?.name === 'string' ? (raw as any).name : `${type}-${Date.now()}`,
        x: Number((raw as any).x),
        y: Number((raw as any).y),
        width: Math.max(40, Number((raw as any).width)),
        height: Math.max(30, Number((raw as any).height))
      };
    })
    .filter((element): element is MediaElement => element !== null);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        resolve(e.target.result);
        return;
      }
      reject(new Error('Failed to read file data'));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.onabort = () => reject(new Error('Read aborted'));
    reader.readAsDataURL(file);
  });

const detectMediaTypeFromFile = (file: File): MediaType | null => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(file.name)) return 'image';
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(file.name)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)) return 'audio';
  return null;
};

const WhiteboardEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, assets = {} }) => {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const highlighterCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const dragStateRef = useRef<{ kind: 'text' | 'media'; id: string; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const resizeStateRef = useRef<{ id: string; originX: number; originY: number; startWidth: number; startHeight: number; moved: boolean } | null>(null);

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
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<SelectedElement>(null);
  const [mediaUploadStatus, setMediaUploadStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const lastSavedData = useRef<string>('');
  const historyRef = useRef<WhiteboardSnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [historyState, setHistoryState] = useState({ index: -1, length: 0 });

  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [mediaElements, setMediaElements] = useState<MediaElement[]>([]);
  const textElementsRef = useRef<TextElement[]>([]);
  const mediaElementsRef = useRef<MediaElement[]>([]);

  // Highlighter model
  const highlighterStrokesRef = useRef<HighlighterStroke[]>([]);
  const activeHighlighterStrokeRef = useRef<HighlighterStroke | null>(null);

  const getCanvasContexts = () => {
    const baseCanvas = baseCanvasRef.current;
    const highlighterCanvas = highlighterCanvasRef.current;
    if (!baseCanvas || !highlighterCanvas) return null;

    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    const highlighterCtx = highlighterCanvas.getContext('2d', { willReadFrequently: true });
    if (!baseCtx || !highlighterCtx) return null;

    return { baseCanvas, highlighterCanvas, baseCtx, highlighterCtx };
  };

  const updateTextElements = (updater: (prev: TextElement[]) => TextElement[]) => {
    setTextElements(prev => {
      const next = updater(prev);
      textElementsRef.current = next;
      return next;
    });
  };

  const updateMediaElements = (updater: (prev: MediaElement[]) => MediaElement[]) => {
    setMediaElements(prev => {
      const next = updater(prev);
      mediaElementsRef.current = next;
      return next;
    });
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

  const buildPersistedContent = (baseData: string) => ({
    version: 2 as const,
    baseData,
    highlighterStrokes: cloneHighlighterStrokes(highlighterStrokesRef.current),
    highlighterOpacity,
    textElements: cloneTextElements(textElementsRef.current),
    mediaElements: cloneMediaElements(mediaElementsRef.current)
  });

  const captureSnapshot = (): WhiteboardSnapshot | null => {
    const refs = getCanvasContexts();
    if (!refs) return null;
    const baseData = refs.baseCanvas.toDataURL('image/png');
    if (!baseData) return null;
    const persisted = buildPersistedContent(baseData);
    return { ...persisted, signature: JSON.stringify(persisted) };
  };

  const syncHistoryState = () => {
    setHistoryState({ index: historyIndexRef.current, length: historyRef.current.length });
  };

  const pushHistorySnapshot = (snapshot: WhiteboardSnapshot) => {
    const base = historyRef.current.slice(0, historyIndexRef.current + 1);
    if (base[base.length - 1]?.signature === snapshot.signature) return false;
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
    textElementsRef.current = cloneTextElements(snapshot.textElements);
    mediaElementsRef.current = cloneMediaElements(snapshot.mediaElements);
    setTextElements(textElementsRef.current);
    setMediaElements(mediaElementsRef.current);
    setSelectedElement(null);
    setEditingTextId(null);
    renderHighlighterLayer();
    historyIndexRef.current = nextIndex;
    syncHistoryState();
    setSaveStatus('unsaved');
    setTimeout(() => handleManualSave(), 150);
  };

  const handleUndo = async () => {
    if (historyIndexRef.current <= 0) return;
    setEditingTextId(null);
    setSelectedElement(null);
    await restoreHistoryIndex(historyIndexRef.current - 1);
  };

  const handleRedo = async () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    setEditingTextId(null);
    setSelectedElement(null);
    await restoreHistoryIndex(historyIndexRef.current + 1);
  };

  // Initialize Canvas + History
  useEffect(() => {
    const init = async () => {
      let initialBaseData: string | null = null;
      let initialHighlighterStrokes: HighlighterStroke[] = [];
      let initialOpacity = DEFAULT_HIGHLIGHTER_LAYER_ALPHA;
      let initialTextElements: TextElement[] = [];
      let initialMediaElements: MediaElement[] = [];

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
        initialTextElements = sanitizeTextElements((initialContent as any).textElements);
        initialMediaElements = sanitizeMediaElements((initialContent as any).mediaElements);
        const rawOpacity = (initialContent as any).highlighterOpacity;
        if (Number.isFinite(rawOpacity)) {
          initialOpacity = Math.min(1, Math.max(0.05, Number(rawOpacity)));
        }
      }

      await loadBaseCanvasFromData(initialBaseData);
      setHighlighterOpacity(initialOpacity);
      highlighterStrokesRef.current = initialHighlighterStrokes;
      textElementsRef.current = initialTextElements;
      mediaElementsRef.current = initialMediaElements;
      setTextElements(initialTextElements);
      setMediaElements(initialMediaElements);
      renderHighlighterLayer();

      const snapshot = captureSnapshot();
      historyRef.current = snapshot ? [snapshot] : [];
      historyIndexRef.current = historyRef.current.length - 1;
      syncHistoryState();
      if (snapshot) {
        lastSavedData.current = snapshot.signature;
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!editingTextId) return;
    const timer = setTimeout(() => textAreaRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [editingTextId]);

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

  const getCanvasPosFromClient = (clientX: number, clientY: number) => {
    const canvas = highlighterCanvasRef.current || baseCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const getCenteredPlacement = (width: number, height: number) => {
    const container = containerRef.current;
    if (!container) return { x: 50, y: 50 };
    const rect = container.getBoundingClientRect();
    const x = container.scrollLeft + (rect.width / 2) - (width / 2);
    const y = container.scrollTop + (rect.height / 2) - (height / 2);
    return {
      x: clamp(x, 0, CANVAS_SIZE - width),
      y: clamp(y, 0, CANVAS_SIZE - height)
    };
  };

  const beginTextAt = (x: number, y: number) => {
    const id = crypto.randomUUID();
    const next: TextElement = {
      id,
      x,
      y,
      text: '',
      color: settings.text.color,
      fontSize: settings.text.width,
      fontWeight: 'normal',
      fontStyle: 'normal'
    };
    updateTextElements(prev => [...prev, next]);
    setSelectedElement({ kind: 'text', id });
    setEditingTextId(id);
    setSaveStatus('unsaved');
  };

  const finishTextEditing = (id: string, shouldCommit: boolean) => {
    let changed = false;
    updateTextElements(prev => {
      const target = prev.find(element => element.id === id);
      if (!target) return prev;
      changed = true;
      if (!target.text.trim()) {
        return prev.filter(element => element.id !== id);
      }
      return prev;
    });
    setEditingTextId(null);
    if (shouldCommit && changed) {
      commitCanvasSnapshot(true);
    }
  };

  const updateTextById = (id: string, updater: (prev: TextElement) => TextElement) => {
    updateTextElements(prev => prev.map(element => (element.id === id ? updater(element) : element)));
  };

  const addMediaElement = async (type: MediaType, src: string, name: string) => {
    let width = type === 'audio' ? 360 : 360;
    let height = type === 'audio' ? 72 : 220;

    if (type === 'image') {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
          const maxWidth = 480;
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          width = Math.max(80, Math.round(img.width * scale));
          height = Math.max(60, Math.round(img.height * scale));
          resolve();
        };
        img.onerror = () => resolve();
      });
    }
    if (type === 'video') {
      await new Promise<void>((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = src;
        video.onloadedmetadata = () => {
          const vw = Number.isFinite(video.videoWidth) && video.videoWidth > 0 ? video.videoWidth : 640;
          const vh = Number.isFinite(video.videoHeight) && video.videoHeight > 0 ? video.videoHeight : 360;
          const maxWidth = 560;
          const scale = vw > maxWidth ? maxWidth / vw : 1;
          width = Math.max(220, Math.round(vw * scale));
          height = Math.max(140, Math.round(vh * scale));
          resolve();
        };
        video.onerror = () => resolve();
      });
    }

    const pos = getCenteredPlacement(width, height);
    const media: MediaElement = {
      id: crypto.randomUUID(),
      type,
      src,
      name,
      x: pos.x,
      y: pos.y,
      width,
      height
    };
    updateMediaElements(prev => [...prev, media]);
    setSelectedElement({ kind: 'media', id: media.id });
    commitCanvasSnapshot(true);
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
    if (isAssetMenuOpen) {
      setIsAssetMenuOpen(false);
    }

    const refs = getCanvasContexts();
    if (!refs) return;

    const { x, y } = getMousePos(e);
    const currentSettings = settings[activeTool];

    if (activeTool === 'text') {
      beginTextAt(x, y);
      return;
    }
    if (editingTextId) {
      finishTextEditing(editingTextId, true);
    }
    setSelectedElement(null);

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

  // --- MEDIA + ELEMENT INTERACTION ---

  const handleInitImport = async (base64: string) => {
    await addMediaElement('image', base64, 'asset-image');
    setIsAssetMenuOpen(false);
  };

  const launchMediaUploadPicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,audio/*';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.onchange = async (e) => {
      const selected = (e.target as HTMLInputElement).files;
      if (!selected || selected.length === 0) {
        input.remove();
        return;
      }
      let success = 0;
      const failed: string[] = [];
      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        const mediaType = detectMediaTypeFromFile(file);
        if (!mediaType) {
          failed.push(file.name);
          continue;
        }
        try {
          const src = await readFileAsDataUrl(file);
          await addMediaElement(mediaType, src, file.name);
          success++;
        } catch (error) {
          console.error('Failed adding media', file.name, error);
          failed.push(file.name);
        }
      }
      if (failed.length === 0) {
        setMediaUploadStatus(`Added ${success} media file${success === 1 ? '' : 's'}.`);
      } else if (success === 0) {
        setMediaUploadStatus(`Failed to add ${failed.length} file${failed.length === 1 ? '' : 's'}.`);
      } else {
        setMediaUploadStatus(`Added ${success}/${selected.length}. Failed ${failed.length}.`);
      }
      setTimeout(() => setMediaUploadStatus(''), 3200);
      input.remove();
    };
    (input as HTMLInputElement & { oncancel?: () => void }).oncancel = () => input.remove();
    input.click();
  };

  const handleTextDragStart = (e: React.MouseEvent, id: string) => {
    if (editingTextId === id) return;
    e.stopPropagation();
    const pos = getCanvasPosFromClient(e.clientX, e.clientY);
    const target = textElementsRef.current.find(element => element.id === id);
    if (!target) return;
    dragStateRef.current = {
      kind: 'text',
      id,
      offsetX: pos.x - target.x,
      offsetY: pos.y - target.y,
      moved: false
    };
    setSelectedElement({ kind: 'text', id });
  };

  const handleMediaDragStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const pos = getCanvasPosFromClient(e.clientX, e.clientY);
    const target = mediaElementsRef.current.find(element => element.id === id);
    if (!target) return;
    dragStateRef.current = {
      kind: 'media',
      id,
      offsetX: pos.x - target.x,
      offsetY: pos.y - target.y,
      moved: false
    };
    setSelectedElement({ kind: 'media', id });
  };

  const handleMediaResizeStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const pos = getCanvasPosFromClient(e.clientX, e.clientY);
    const target = mediaElementsRef.current.find(element => element.id === id);
    if (!target) return;
    resizeStateRef.current = {
      id,
      originX: pos.x,
      originY: pos.y,
      startWidth: target.width,
      startHeight: target.height,
      moved: false
    };
    setSelectedElement({ kind: 'media', id });
  };

  const handleWindowMouseMove = (e: React.MouseEvent) => {
    const pos = getCanvasPosFromClient(e.clientX, e.clientY);
    const resizeState = resizeStateRef.current;
    if (resizeState) {
      const dx = pos.x - resizeState.originX;
      const dy = pos.y - resizeState.originY;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) resizeState.moved = true;
      updateMediaElements(prev => prev.map(element => {
        if (element.id !== resizeState.id) return element;
        const nextWidth = clamp(resizeState.startWidth + dx, 40, CANVAS_SIZE - element.x);
        const nextHeight = clamp(resizeState.startHeight + dy, 30, CANVAS_SIZE - element.y);
        return { ...element, width: nextWidth, height: nextHeight };
      }));
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState) return;
    if (dragState.kind === 'text') {
      updateTextElements(prev => prev.map(element => {
        if (element.id !== dragState.id) return element;
        const nextX = clamp(pos.x - dragState.offsetX, 0, CANVAS_SIZE - 30);
        const nextY = clamp(pos.y - dragState.offsetY, 0, CANVAS_SIZE - 20);
        if (Math.abs(nextX - element.x) > 0.5 || Math.abs(nextY - element.y) > 0.5) dragState.moved = true;
        return { ...element, x: nextX, y: nextY };
      }));
      return;
    }
    updateMediaElements(prev => prev.map(element => {
      if (element.id !== dragState.id) return element;
      const nextX = clamp(pos.x - dragState.offsetX, 0, CANVAS_SIZE - element.width);
      const nextY = clamp(pos.y - dragState.offsetY, 0, CANVAS_SIZE - element.height);
      if (Math.abs(nextX - element.x) > 0.5 || Math.abs(nextY - element.y) > 0.5) dragState.moved = true;
      return { ...element, x: nextX, y: nextY };
    }));
  };

  const handleWindowMouseUp = () => {
    const moved = Boolean(dragStateRef.current?.moved || resizeStateRef.current?.moved);
    dragStateRef.current = null;
    resizeStateRef.current = null;
    if (moved) {
      setSaveStatus('unsaved');
      commitCanvasSnapshot(true);
    }
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
      const snapshot = captureSnapshot();
      if (!snapshot) return;
      if (snapshot.signature !== lastSavedData.current) {
        setSaveStatus('saving');
        onSave({
          version: 2,
          baseData: snapshot.baseData,
          highlighterStrokes: snapshot.highlighterStrokes,
          highlighterOpacity: snapshot.highlighterOpacity,
          textElements: snapshot.textElements,
          mediaElements: snapshot.mediaElements
        });
        lastSavedData.current = snapshot.signature;
        setTimeout(() => setSaveStatus('saved'), 500);
      }
    } catch (e) {
      console.error('Canvas save blocked', e);
      setSaveStatus('unsaved');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
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
        return;
      }
      if (!isTypingTarget && (e.key === 'Delete' || e.key === 'Backspace') && selectedElement) {
        e.preventDefault();
        if (selectedElement.kind === 'text') {
          updateTextElements(prev => prev.filter(element => element.id !== selectedElement.id));
          if (editingTextId === selectedElement.id) setEditingTextId(null);
        } else {
          updateMediaElements(prev => prev.filter(element => element.id !== selectedElement.id));
        }
        setSelectedElement(null);
        commitCanvasSnapshot(true);
        return;
      }
      if (e.key === 'Escape') {
        if (editingTextId) {
          finishTextEditing(editingTextId, true);
        } else {
          setSelectedElement(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, editingTextId]);

  const clearCanvas = () => {
    if (!confirm('Clear whiteboard? This cannot be undone.')) return;
    const refs = getCanvasContexts();
    if (!refs) return;
    fillCanvasBackground(refs.baseCtx, refs.baseCanvas);
    setEditingTextId(null);
    setSelectedElement(null);
    textElementsRef.current = [];
    mediaElementsRef.current = [];
    setTextElements([]);
    setMediaElements([]);
    highlighterStrokesRef.current = [];
    activeHighlighterStrokeRef.current = null;
    clearHighlighterLayer();
    commitCanvasSnapshot(true);
  };

  const assetList = Object.entries(assets);
  const canUndo = historyState.index > 0;
  const canRedo = historyState.index >= 0 && historyState.index < historyState.length - 1;
  const selectedText = useMemo(
    () => (selectedElement?.kind === 'text' ? textElements.find(element => element.id === selectedElement.id) || null : null),
    [selectedElement, textElements]
  );
  const selectedMedia = useMemo(
    () => (selectedElement?.kind === 'media' ? mediaElements.find(element => element.id === selectedElement.id) || null : null),
    [selectedElement, mediaElements]
  );

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
            <button
              onClick={launchMediaUploadPicker}
              className="p-2 rounded transition-all text-zinc-400 hover:text-zinc-200"
              title="Upload Image / Video / Audio"
            >
              <Upload className="w-4 h-4" />
            </button>
          </div>

          {/* Settings */}
          <div className="flex items-center gap-3 bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-800 hidden md:flex">
            {(activeTool === 'pen' || activeTool === 'highlighter' || activeTool === 'text') && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={activeTool === 'text' ? (selectedText?.color || settings.text.color) : settings[activeTool].color}
                  onChange={(e) => {
                    if (activeTool === 'text') {
                      setSettings(prev => ({ ...prev, text: { ...prev.text, color: e.target.value } }));
                      if (selectedText) {
                        updateTextById(selectedText.id, prev => ({ ...prev, color: e.target.value }));
                        commitCanvasSnapshot(true);
                      }
                    } else {
                      updateSetting('color', e.target.value);
                    }
                  }}
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
                value={activeTool === 'text' ? (selectedText?.fontSize || settings.text.width) : settings[activeTool].width}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10);
                  if (activeTool === 'text') {
                    setSettings(prev => ({ ...prev, text: { ...prev.text, width: next } }));
                    if (selectedText) {
                      updateTextById(selectedText.id, prev => ({ ...prev, fontSize: next }));
                      commitCanvasSnapshot(true);
                    }
                  } else {
                    updateSetting('width', next);
                  }
                }}
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

            {activeTool === 'text' && selectedText && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    updateTextById(selectedText.id, prev => ({ ...prev, fontWeight: prev.fontWeight === 'bold' ? 'normal' : 'bold' }));
                    commitCanvasSnapshot(true);
                  }}
                  className={`px-2 py-1 text-xs rounded ${selectedText.fontWeight === 'bold' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                  title="Toggle Bold"
                >
                  B
                </button>
                <button
                  onClick={() => {
                    updateTextById(selectedText.id, prev => ({ ...prev, fontStyle: prev.fontStyle === 'italic' ? 'normal' : 'italic' }));
                    commitCanvasSnapshot(true);
                  }}
                  className={`px-2 py-1 text-xs rounded ${selectedText.fontStyle === 'italic' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                  title="Toggle Italic"
                >
                  I
                </button>
              </div>
            )}

            {selectedMedia && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500">W</span>
                <input
                  type="range"
                  min="40"
                  max="1200"
                  value={selectedMedia.width}
                  onChange={(e) => updateMediaElements(prev => prev.map(element => element.id === selectedMedia.id ? { ...element, width: parseInt(e.target.value, 10) } : element))}
                  onMouseUp={() => commitCanvasSnapshot(true)}
                  className="w-16 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <span className="text-[11px] text-zinc-500">H</span>
                <input
                  type="range"
                  min="30"
                  max="900"
                  value={selectedMedia.height}
                  onChange={(e) => updateMediaElements(prev => prev.map(element => element.id === selectedMedia.id ? { ...element, height: parseInt(e.target.value, 10) } : element))}
                  onMouseUp={() => commitCanvasSnapshot(true)}
                  className="w-16 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
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

      {mediaUploadStatus && (
        <div className="px-4 py-2 text-xs text-zinc-300 border-b border-zinc-800 bg-zinc-900/70">
          {mediaUploadStatus}
        </div>
      )}

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

            {textElements.map((text) => {
              const isSelected = selectedElement?.kind === 'text' && selectedElement.id === text.id;
              const isEditing = editingTextId === text.id;
              const lineHeight = Math.max(10, Math.round(text.fontSize * 1.3));

              if (isEditing) {
                return (
                  <textarea
                    key={text.id}
                    ref={textAreaRef}
                    value={text.text}
                    onChange={(e) => updateTextById(text.id, prev => ({ ...prev, text: e.target.value }))}
                    onBlur={() => finishTextEditing(text.id, true)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        finishTextEditing(text.id, true);
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        finishTextEditing(text.id, true);
                      }
                    }}
                    className="absolute z-20 min-w-[220px] max-w-[500px] min-h-[90px] bg-zinc-900/95 border border-blue-500 rounded-md p-2 text-zinc-100 resize-y focus:outline-none"
                    style={{ left: text.x, top: text.y, color: text.color, fontSize: `${text.fontSize}px`, fontWeight: text.fontWeight, fontStyle: text.fontStyle, lineHeight: `${lineHeight}px` }}
                  />
                );
              }

              return (
                <div
                  key={text.id}
                  className={`absolute z-20 px-1 py-0.5 rounded cursor-move whitespace-pre-wrap ${isSelected ? 'ring-1 ring-blue-500 bg-blue-500/10' : ''}`}
                  style={{ left: text.x, top: text.y, color: text.color, fontSize: `${text.fontSize}px`, fontWeight: text.fontWeight, fontStyle: text.fontStyle, lineHeight: `${lineHeight}px`, userSelect: 'none' }}
                  onMouseDown={(e) => handleTextDragStart(e, text.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedElement({ kind: 'text', id: text.id });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setActiveTool('text');
                    setSelectedElement({ kind: 'text', id: text.id });
                    setEditingTextId(text.id);
                  }}
                >
                  {text.text || 'Text'}
                </div>
              );
            })}

            {mediaElements.map((media) => {
              const isSelected = selectedElement?.kind === 'media' && selectedElement.id === media.id;
              const contentHeight = Math.max(10, media.height - 24);
              return (
                <div
                  key={media.id}
                  className={`absolute z-20 overflow-hidden rounded-md border ${isSelected ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,.4)]' : 'border-zinc-700'}`}
                  style={{ left: media.x, top: media.y, width: media.width, height: media.height, background: '#0a0a0a' }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedElement({ kind: 'media', id: media.id });
                  }}
                >
                  <div className="h-6 px-2 flex items-center justify-between text-[11px] text-zinc-200 bg-zinc-900/90 border-b border-zinc-700 cursor-move" onMouseDown={(e) => handleMediaDragStart(e, media.id)}>
                    <span className="truncate">{media.name}</span>
                    <button
                      className="text-zinc-400 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateMediaElements(prev => prev.filter(element => element.id !== media.id));
                        if (selectedElement?.kind === 'media' && selectedElement.id === media.id) {
                          setSelectedElement(null);
                        }
                        commitCanvasSnapshot(true);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="w-full" style={{ height: contentHeight }}>
                    {media.type === 'image' && (
                      <img src={media.src} alt={media.name} className="w-full h-full object-contain" draggable={false} onMouseDown={(e) => handleMediaDragStart(e, media.id)} />
                    )}
                    {media.type === 'video' && (
                      <video src={media.src} controls className="w-full h-full object-contain bg-black" />
                    )}
                    {media.type === 'audio' && (
                      <div className="w-full h-full flex items-center justify-center px-2">
                        <audio src={media.src} controls className="w-full" />
                      </div>
                    )}
                  </div>
                  <div className="absolute right-0 bottom-0 w-4 h-4 bg-blue-500 cursor-nwse-resize" onMouseDown={(e) => handleMediaResizeStart(e, media.id)} title="Resize">
                    <Maximize2 className="w-3 h-3 text-white" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhiteboardEditor;
