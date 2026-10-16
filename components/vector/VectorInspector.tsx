import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Lock, Plus, Trash2, Unlock, X } from 'lucide-react';
import { cn } from '../ui';
import { ColorField } from './ColorField';
import { VectorDoc, addLayer, removeLayer, reorderLayer, updateLayer } from '../../utils/vectorModel';

interface Props {
  doc: VectorDoc;
  commit: (next: VectorDoc) => void;
  activeLayerId: string;
  onActiveLayer: (id: string) => void;
  selectedImageId: string | null;
  onSelectImage: (id: string | null) => void;
  onAddImage: (e: React.MouseEvent) => void;
  onFitArtboard: () => void;
  onClose: () => void;
}

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <section className="border-b border-border/70 px-3 py-3">
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

/** A number input that only commits on blur/Enter, so typing "1200" isn't four undo steps. */
const SizeInput: React.FC<{ value: number; onCommit: (v: number) => void; label: string }> = ({ value, onCommit, label }) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const done = () => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n >= 16 && n <= 20000 && n !== value) onCommit(n);
    else setText(String(value));
  };
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-bg px-2 focus-within:border-accent">
      <span className="text-[11px] text-faint">{label}</span>
      <input
        value={text}
        inputMode="numeric"
        aria-label={label === 'W' ? 'Canvas width' : 'Canvas height'}
        onChange={e => setText(e.target.value)}
        onBlur={done}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="h-7 min-w-0 flex-1 bg-transparent text-[12px] text-content outline-none"
      />
    </label>
  );
};

/** Right-hand panel: layers, canvas settings, tracing images, and notes. */
const VectorInspector: React.FC<Props> = ({ doc, commit, activeLayerId, onActiveLayer, selectedImageId, onSelectImage, onAddImage, onFitArtboard, onClose }) => {
  const [notes, setNotes] = useState(doc.notes);
  useEffect(() => setNotes(doc.notes), [doc.notes]);

  const counts = new Map<string, number>();
  for (const list of [doc.edges, doc.circles, doc.fills, doc.texts]) {
    for (const item of list) counts.set(item.layerId, (counts.get(item.layerId) || 0) + 1);
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-border bg-chrome text-[12px]" aria-label="Vector inspector">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/70 pl-3 pr-1.5">
        <span className="text-[12px] font-semibold text-content">Inspector</span>
        <button type="button" className="icon-btn" title="Close panel" aria-label="Close panel" onClick={onClose}><X className="h-4 w-4" /></button>
      </div>

      <Section
        title="Layers"
        action={
          <button
            type="button"
            className="icon-btn h-6 w-6"
            title="Add layer"
            aria-label="Add layer"
            onClick={() => { const { doc: next, id } = addLayer(doc); commit(next); onActiveLayer(id); }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        }
      >
        <p className="mb-2 text-[11px] leading-snug text-faint">New shapes go on the highlighted layer. The top of the list draws on top.</p>
        <div className="flex flex-col gap-0.5">
          {[...doc.layers].reverse().map(layer => {
            const i = doc.layers.findIndex(l => l.id === layer.id);
            const active = layer.id === activeLayerId;
            return (
              <div
                key={layer.id}
                onClick={() => onActiveLayer(layer.id)}
                className={cn('group flex h-8 cursor-pointer items-center gap-0.5 rounded-md px-1', active ? 'bg-accent/15 ring-1 ring-accent/40' : 'hover:bg-surface-hover')}
              >
                <button
                  type="button"
                  className="icon-btn h-6 w-6"
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  onClick={e => { e.stopPropagation(); commit(updateLayer(doc, layer.id, { visible: !layer.visible })); }}
                >
                  {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-faint" />}
                </button>
                <button
                  type="button"
                  className={cn('icon-btn h-6 w-6', !layer.locked && 'opacity-0 focus:opacity-100 group-hover:opacity-100')}
                  title={layer.locked ? 'Unlock layer' : 'Lock layer (stops edits)'}
                  aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                  onClick={e => { e.stopPropagation(); commit(updateLayer(doc, layer.id, { locked: !layer.locked })); }}
                >
                  {layer.locked ? <Lock className="h-3.5 w-3.5 text-warning" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>
                <input
                  value={layer.name}
                  aria-label="Layer name"
                  onClick={e => e.stopPropagation()}
                  onFocus={() => onActiveLayer(layer.id)}
                  onChange={e => commit(updateLayer(doc, layer.id, { name: e.target.value }))}
                  className={cn('h-6 min-w-0 flex-1 rounded bg-transparent px-1 text-[12px] outline-none focus:bg-bg focus:ring-1 focus:ring-accent', !layer.visible && 'text-faint')}
                />
                <span className="w-5 text-right text-[10px] tabular-nums text-faint group-hover:hidden">{counts.get(layer.id) || ''}</span>
                <div className="hidden items-center group-hover:flex">
                  <button type="button" className="icon-btn h-6 w-5" title="Move layer up" aria-label="Move layer up" disabled={i === doc.layers.length - 1} onClick={e => { e.stopPropagation(); commit(reorderLayer(doc, layer.id, 1)); }}>
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button type="button" className="icon-btn h-6 w-5" title="Move layer down" aria-label="Move layer down" disabled={i === 0} onClick={e => { e.stopPropagation(); commit(reorderLayer(doc, layer.id, -1)); }}>
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button type="button" className="icon-btn h-6 w-5 hover:!text-danger" title="Delete layer and its shapes" aria-label="Delete layer" disabled={doc.layers.length <= 1} onClick={e => { e.stopPropagation(); commit(removeLayer(doc, layer.id)); }}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Canvas">
        <div className="mb-2 flex items-center gap-1.5">
          <SizeInput label="W" value={doc.canvas.width} onCommit={width => commit({ ...doc, canvas: { ...doc.canvas, width } })} />
          <span className="text-faint">×</span>
          <SizeInput label="H" value={doc.canvas.height} onCommit={height => commit({ ...doc, canvas: { ...doc.canvas, height } })} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <ColorField
            color={doc.canvas.background === 'transparent' ? 'none' : doc.canvas.background}
            onChange={c => commit({ ...doc, canvas: { ...doc.canvas, background: c === 'none' ? 'transparent' : c } })}
            label={doc.canvas.background === 'transparent' ? 'Transparent' : 'Background'}
            title="Background color (exported with the art)"
            allowNone
          />
          <button type="button" onClick={onFitArtboard} className="rounded-md px-2 py-1 text-[12px] text-muted hover:bg-surface-hover hover:text-content" title="Resize the canvas to wrap the drawing with a small margin">
            Fit to drawing
          </button>
        </div>
      </Section>

      <Section
        title="Tracing images"
        action={
          <button type="button" className="icon-btn h-6 w-6" title="Add a faded reference image to trace over" aria-label="Add tracing image" onClick={onAddImage}>
            <ImagePlus className="h-3.5 w-3.5" />
          </button>
        }
      >
        {doc.referenceImages.length === 0 ? (
          <p className="text-[11px] leading-snug text-faint">Drop a sketch or screenshot behind your drawing to trace it. It's never exported.</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {doc.referenceImages.map(img => (
              <div
                key={img.id}
                onClick={() => onSelectImage(img.id)}
                className={cn('group flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5', selectedImageId === img.id ? 'bg-accent/15' : 'hover:bg-surface-hover')}
              >
                <span className="min-w-0 flex-1 truncate text-content">{img.name}</span>
                <button
                  type="button"
                  className="icon-btn h-6 w-6 opacity-0 focus:opacity-100 group-hover:opacity-100 hover:!text-danger"
                  title="Remove image"
                  aria-label={`Remove ${img.name}`}
                  onClick={e => {
                    e.stopPropagation();
                    commit({ ...doc, referenceImages: doc.referenceImages.filter(r => r.id !== img.id) });
                    if (selectedImageId === img.id) onSelectImage(null);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Notes">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => { if (notes !== doc.notes) commit({ ...doc, notes }); }}
          placeholder="What is this piece for? Sizes, palette, where it's used…"
          rows={5}
          className="w-full resize-y rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] leading-relaxed text-content outline-none placeholder:text-faint focus:border-accent"
        />
      </Section>
    </aside>
  );
};

export default VectorInspector;
