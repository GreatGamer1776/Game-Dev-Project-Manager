import React, { useMemo, useRef, useState } from 'react';
import {
  Plus, Undo2, Redo2, LayoutGrid, ListTree, Copy, MoreHorizontal, Trash2, Link2, X, User, MapPin, Clapperboard, Gamepad2,
} from 'lucide-react';
import type { EditorProps, ProjectFile } from '../../types';
import {
  PlotData, PlotCard, PlotBeat, PlotLine, PlotAct, CardStatus, CARD_STATUSES, PLOT_COLORS, STRUCTURES, StructurePreset,
  applyStructure, beatsByAct, parsePlot, plotToMarkdown,
} from '../../utils/plotModel';
import { useEditorDocument } from '../../hooks/useEditorDocument';
import { uid } from '../../utils/id';
import { confirmDialog, promptDialog, toast } from '../../stores/useUiStore';
import { showMenu } from '../../stores/useMenuStore';
import type { MenuEntry } from '../../stores/useMenuStore';
import MarkdownView from '../markdown/MarkdownView';
import EntryPicker from './EntryPicker';
import { ToolbarButton, ToolbarDivider, ViewToggle, colorName, insertAtCursor } from './shared';
import { Button, Field, Input, Modal, SaveIndicator, Select, Textarea, cn } from '../ui';

const COL_W = 232;
const LINE_W = 168;

type Update = (fn: (d: PlotData) => PlotData, options?: { batch?: boolean }) => void;

/** "[[Name]]" -> "Name" for chips. */
const linkName = (value?: string) => (value || '').replace(/^\s*\[\[/, '').replace(/(\|[^\]]*)?\]\]\s*$/, '').trim();

const statusMeta = (status: CardStatus) => CARD_STATUSES.find(s => s.status === status)!;

const rename = async (title: string, current: string, label = 'Name') => {
  const next = await promptDialog({ title, label, defaultValue: current, confirmText: 'Save' });
  return next?.trim() || null;
};

/** Plot board: story beats as columns, plot lines as rows, scene cards in the cells. */
const PlotBoardEditor: React.FC<EditorProps> = ({ initialContent, onSave, fileName, projectFiles = [], activeFileId, onOpenHref, assets }) => {
  const doc = useEditorDocument<PlotData>(() => parsePlot(initialContent), onSave);
  const { data, update } = doc;
  const [editing, setEditing] = useState<{ card: PlotCard; isNew: boolean } | null>(null);

  const newCard = (beatId: string, lineId: string) =>
    setEditing({ isNew: true, card: { id: uid(), beatId, lineId, title: '', summary: '', status: 'idea' } });

  const saveCard = (card: PlotCard) => {
    update(d => {
      const exists = d.cards.some(c => c.id === card.id);
      return { ...d, cards: exists ? d.cards.map(c => (c.id === card.id ? card : c)) : [...d.cards, card] };
    });
    setEditing(null);
  };

  const addBeat = (actId?: string, afterBeatId?: string) => update(d => {
    const lastAct = actId ?? d.beats[d.beats.length - 1]?.actId;
    const beat: PlotBeat = { id: uid(), title: `Beat ${d.beats.length + 1}`, ...(lastAct ? { actId: lastAct } : {}) };
    const beats = [...d.beats];
    let index = afterBeatId ? beats.findIndex(b => b.id === afterBeatId) + 1 : -1;
    if (index <= 0 && actId) {
      // End of that act's run of beats.
      const lastInAct = beats.map(b => b.actId).lastIndexOf(actId);
      index = lastInAct >= 0 ? lastInAct + 1 : beats.length;
    }
    if (index <= 0) index = beats.length;
    beats.splice(index, 0, beat);
    return { ...d, beats, started: true };
  });

  const addLine = () => update(d => ({ ...d, lines: [...d.lines, { id: uid(), name: `Plot line ${d.lines.length + 1}`, color: PLOT_COLORS[d.lines.length % PLOT_COLORS.length] }] }));

  const addAct = () => update(d => {
    const act: PlotAct = { id: uid(), title: `Act ${d.acts.length + 1}`, color: PLOT_COLORS[d.acts.length % PLOT_COLORS.length] };
    return { ...d, acts: [...d.acts, act], beats: [...d.beats, { id: uid(), title: `Beat ${d.beats.length + 1}`, actId: act.id }], started: true };
  });

  const structureMenu = (e: React.MouseEvent) => showMenu(e, [
    { kind: 'heading', label: 'Add beats from a structure' },
    ...STRUCTURES.map(s => ({ label: s.name, hint: `${s.acts.reduce((n, a) => n + a.beats.length, 0)} beats`, icon: s.game ? Gamepad2 : undefined, onSelect: () => update(d => applyStructure(d, s)) })),
  ], 'below');

  const copyMarkdown = () => {
    void navigator.clipboard?.writeText(plotToMarkdown(data, fileName)).then(
      () => toast.success('Outline copied as markdown.'),
      () => toast.error('Could not copy to the clipboard.'),
    );
  };

  if (!data.started) {
    return (
      <StructurePicker
        onPick={preset => update(d => applyStructure(d, preset))}
        onBlank={() => update(d => ({ ...d, started: true, beats: d.beats.length ? d.beats : [1, 2, 3].map(n => ({ id: uid(), title: `Beat ${n}` })) }))}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/70 px-2 [scrollbar-width:none]">
        <ViewToggle
          value={data.view}
          onChange={view => update(d => ({ ...d, view }))}
          options={[
            { id: 'grid', label: 'Board', icon: LayoutGrid },
            { id: 'outline', label: 'Outline', icon: ListTree },
          ]}
        />
        <ToolbarDivider />
        <ToolbarButton icon={Plus} title="Add a beat at the end" label="Beat" onClick={() => addBeat()} />
        <ToolbarButton icon={Plus} title="Add a plot line" label="Plot line" onClick={addLine} />
        <ToolbarButton icon={Plus} title="Add an act" label="Act" onClick={addAct} />
        <ToolbarButton icon={Clapperboard} title="Add beats from a story structure" label="Structure" onClick={structureMenu} />
        <ToolbarDivider />
        <ToolbarButton icon={Undo2} title="Undo (Ctrl+Z)" onClick={doc.undo} disabled={!doc.canUndo} />
        <ToolbarButton icon={Redo2} title="Redo (Ctrl+Y)" onClick={doc.redo} disabled={!doc.canRedo} />
        <ToolbarButton icon={Copy} title="Copy the outline as markdown" onClick={copyMarkdown} />
        <div className="ml-auto pl-2">
          <SaveIndicator status={doc.saveStatus} onSaveNow={doc.flushSave} />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {data.view === 'grid'
          ? <Board data={data} update={update} onAddBeat={addBeat} onAddLine={addLine} onNewCard={newCard} onEditCard={card => setEditing({ card, isNew: false })} />
          : <Outline data={data} files={projectFiles} assets={assets} onOpenHref={(href, newTab) => onOpenHref?.(href, newTab)} onEditCard={card => setEditing({ card, isNew: false })} />}
      </div>

      {editing && (
        <CardDialog
          key={editing.card.id}
          data={data}
          card={editing.card}
          isNew={editing.isNew}
          files={projectFiles}
          activeFileId={activeFileId}
          onSave={saveCard}
          onDelete={() => { update(d => ({ ...d, cards: d.cards.filter(c => c.id !== editing.card.id) })); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

// --- Structure picker (empty board) -------------------------------------------

const StructurePicker: React.FC<{ onPick: (preset: StructurePreset) => void; onBlank: () => void }> = ({ onPick, onBlank }) => (
  <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h2 className="font-display text-lg font-medium text-content">Pick a structure</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        A structure lays out the beats of your story as columns, each with a note on what it should do.
        Plot lines run across as rows. You can rename, add, and reorder everything afterwards.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STRUCTURES.map(preset => {
          const beats = preset.acts.reduce((n, a) => n + a.beats.length, 0);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPick(preset)}
              className="flex flex-col rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-raised"
            >
              <div className="flex items-center gap-2">
                <span className="text-[0.875rem] font-medium text-content">{preset.name}</span>
                {preset.game && <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"><Gamepad2 className="h-3 w-3" />Games</span>}
              </div>
              <p className="mt-1 text-xs text-muted">{preset.blurb}</p>
              <p className="mt-3 text-[11px] text-faint">{beats} beats · {preset.acts.map(a => a.title).join(' → ')}</p>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onBlank}
          className="flex flex-col items-start justify-center rounded-lg border border-dashed border-border-strong p-4 text-left text-muted transition-colors hover:text-content"
        >
          <span className="text-[0.875rem] font-medium">Blank board</span>
          <span className="mt-1 text-xs text-faint">Three empty beats to start from.</span>
        </button>
      </div>
    </div>
  </div>
);

// --- Board ----------------------------------------------------------------------

type Drag = { kind: 'card' | 'beat' | 'line'; id: string } | null;

const Board: React.FC<{
  data: PlotData;
  update: Update;
  onAddBeat: (actId?: string, afterBeatId?: string) => void;
  onAddLine: () => void;
  onNewCard: (beatId: string, lineId: string) => void;
  onEditCard: (card: PlotCard) => void;
}> = ({ data, update, onAddBeat, onAddLine, onNewCard, onEditCard }) => {
  const drag = useRef<Drag>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const groups = useMemo(() => beatsByAct(data), [data]);
  const cardsByCell = useMemo(() => {
    const map = new Map<string, PlotCard[]>();
    for (const card of data.cards) {
      const key = `${card.beatId}:${card.lineId}`;
      const list = map.get(key);
      if (list) list.push(card); else map.set(key, [card]);
    }
    return map;
  }, [data.cards]);

  const endDrag = () => { drag.current = null; setDropKey(null); };

  const moveCard = (cardId: string, beatId: string, lineId: string, beforeId?: string) => update(d => {
    const card = d.cards.find(c => c.id === cardId);
    if (!card || cardId === beforeId) return d;
    const rest = d.cards.filter(c => c.id !== cardId);
    const moved = { ...card, beatId, lineId };
    let index = beforeId ? rest.findIndex(c => c.id === beforeId) : -1;
    if (index < 0) {
      // After the last card already in that cell, else at the end.
      const lastInCell = rest.map(c => `${c.beatId}:${c.lineId}`).lastIndexOf(`${beatId}:${lineId}`);
      index = lastInCell >= 0 ? lastInCell + 1 : rest.length;
    }
    rest.splice(index, 0, moved);
    return { ...d, cards: rest };
  });

  const moveBeat = (beatId: string, beforeBeatId: string) => update(d => {
    if (beatId === beforeBeatId) return d;
    const beat = d.beats.find(b => b.id === beatId);
    const target = d.beats.find(b => b.id === beforeBeatId);
    if (!beat || !target) return d;
    const rest = d.beats.filter(b => b.id !== beatId);
    const moved: PlotBeat = { ...beat, actId: target.actId };
    if (!moved.actId) delete moved.actId;
    rest.splice(rest.findIndex(b => b.id === beforeBeatId), 0, moved);
    return { ...d, beats: rest };
  });

  /** One step left/right; at an act boundary the beat first crosses into the neighbouring act. */
  const moveBeatBy = (beatId: string, dir: -1 | 1) => update(d => {
    const i = d.beats.findIndex(b => b.id === beatId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.beats.length) return d;
    const beats = [...d.beats];
    const beat = beats[i];
    const neighbour = beats[j];
    if (neighbour.actId !== beat.actId) {
      const moved: PlotBeat = { ...beat, actId: neighbour.actId };
      if (!moved.actId) delete moved.actId;
      beats[i] = moved;
    } else {
      beats[i] = neighbour;
      beats[j] = beat;
    }
    return { ...d, beats };
  });

  const moveLine = (lineId: string, beforeLineId: string) => update(d => {
    if (lineId === beforeLineId) return d;
    const line = d.lines.find(l => l.id === lineId);
    if (!line) return d;
    const rest = d.lines.filter(l => l.id !== lineId);
    rest.splice(rest.findIndex(l => l.id === beforeLineId), 0, line);
    return { ...d, lines: rest };
  });

  const deleteBeat = (beat: PlotBeat) => {
    const count = data.cards.filter(c => c.beatId === beat.id).length;
    const run = () => update(d => ({ ...d, beats: d.beats.filter(b => b.id !== beat.id), cards: d.cards.filter(c => c.beatId !== beat.id) }));
    if (!count) run();
    else void confirmDialog({ title: `Delete “${beat.title}”?`, message: `Its ${count} ${count === 1 ? 'card is' : 'cards are'} deleted too.`, confirmText: 'Delete beat', danger: true }).then(ok => ok && run());
  };

  const deleteLine = (line: PlotLine) => {
    const count = data.cards.filter(c => c.lineId === line.id).length;
    const run = () => update(d => ({ ...d, lines: d.lines.filter(l => l.id !== line.id), cards: d.cards.filter(c => c.lineId !== line.id) }));
    if (!count) run();
    else void confirmDialog({ title: `Delete “${line.name}”?`, message: `Its ${count} ${count === 1 ? 'card is' : 'cards are'} deleted too.`, confirmText: 'Delete plot line', danger: true }).then(ok => ok && run());
  };

  const actMenu = (e: React.MouseEvent, act: PlotAct) => showMenu(e, [
    { label: 'Rename act', onSelect: () => void rename('Rename act', act.title, 'Act name').then(t => t && update(d => ({ ...d, acts: d.acts.map(a => (a.id === act.id ? { ...a, title: t } : a)) }))) },
    { label: 'Add a beat to this act', icon: Plus, onSelect: () => onAddBeat(act.id) },
    { kind: 'heading', label: 'Color' },
    ...PLOT_COLORS.map(c => ({ label: colorName(c), icon: dot(c), checked: c === act.color, onSelect: () => update(d => ({ ...d, acts: d.acts.map(a => (a.id === act.id ? { ...a, color: c } : a)) })) })),
    { kind: 'separator' },
    { label: 'Remove act (keep its beats)', icon: Trash2, danger: true, onSelect: () => update(d => ({ ...d, acts: d.acts.filter(a => a.id !== act.id), beats: d.beats.map(b => (b.actId === act.id ? { id: b.id, title: b.title, ...(b.guidance ? { guidance: b.guidance } : {}) } : b)) })) },
  ], 'below');

  const beatMenu = (e: React.MouseEvent, beat: PlotBeat) => {
    const index = data.beats.findIndex(b => b.id === beat.id);
    const entries: MenuEntry[] = [
      { label: 'Rename beat', onSelect: () => void rename('Rename beat', beat.title, 'Beat name').then(t => t && update(d => ({ ...d, beats: d.beats.map(b => (b.id === beat.id ? { ...b, title: t } : b)) }))) },
      {
        label: beat.guidance ? 'Edit note' : 'Add note',
        onSelect: () => void promptDialog({ title: 'Beat note', label: 'What should this beat accomplish?', defaultValue: beat.guidance || '', confirmText: 'Save', allowEmpty: true })
          .then(t => t !== null && update(d => ({ ...d, beats: d.beats.map(b => (b.id === beat.id ? { ...b, guidance: t.trim() || undefined } : b)) }))),
      },
      { label: 'Insert beat after', icon: Plus, onSelect: () => onAddBeat(beat.actId, beat.id) },
      { label: 'Move left', disabled: index <= 0, onSelect: () => moveBeatBy(beat.id, -1) },
      { label: 'Move right', disabled: index >= data.beats.length - 1, onSelect: () => moveBeatBy(beat.id, 1) },
    ];
    if (data.acts.length) {
      entries.push({ kind: 'heading', label: 'Act' }, ...data.acts.map(a => ({
        label: a.title, checked: a.id === beat.actId,
        onSelect: () => update(d => {
          // Re-file the beat at the end of that act's run so acts stay contiguous.
          const rest = d.beats.filter(b => b.id !== beat.id);
          const lastInAct = rest.map(b => b.actId).lastIndexOf(a.id);
          rest.splice(lastInAct >= 0 ? lastInAct + 1 : rest.length, 0, { ...beat, actId: a.id });
          return { ...d, beats: rest };
        }),
      })));
    }
    entries.push({ kind: 'separator' }, { label: 'Delete beat', icon: Trash2, danger: true, onSelect: () => deleteBeat(beat) });
    showMenu(e, entries, 'below');
  };

  const lineMenu = (e: React.MouseEvent, line: PlotLine) => {
    const index = data.lines.findIndex(l => l.id === line.id);
    showMenu(e, [
      { label: 'Rename plot line', onSelect: () => void rename('Rename plot line', line.name, 'Plot line name').then(t => t && update(d => ({ ...d, lines: d.lines.map(l => (l.id === line.id ? { ...l, name: t } : l)) }))) },
      { label: 'Move up', disabled: index <= 0, onSelect: () => moveLine(line.id, data.lines[index - 1].id) },
      { label: 'Move down', disabled: index >= data.lines.length - 1, onSelect: () => moveLine(data.lines[index + 1].id, line.id) },
      { kind: 'heading', label: 'Color' },
      ...PLOT_COLORS.map(c => ({ label: colorName(c), icon: dot(c), checked: c === line.color, onSelect: () => update(d => ({ ...d, lines: d.lines.map(l => (l.id === line.id ? { ...l, color: c } : l)) })) })),
      { kind: 'separator' },
      { label: 'Delete plot line', icon: Trash2, danger: true, disabled: data.lines.length === 1, onSelect: () => deleteLine(line) },
    ], 'below');
  };

  const allowDrop = (kind: 'card' | 'beat' | 'line', key: string) => (e: React.DragEvent) => {
    if (drag.current?.kind !== kind) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropKey !== key) setDropKey(key);
  };

  const totalW = LINE_W + data.beats.length * COL_W + 140;

  return (
    <div className="h-full overflow-auto" onDragEnd={endDrag}>
      <div style={{ width: totalW }} className="pb-10">
        {/* Act row */}
        {data.acts.length > 0 && (
          <div className="sticky top-0 z-20 flex h-8 bg-bg">
            <div className="sticky left-0 z-10 shrink-0 bg-bg" style={{ width: LINE_W }} />
            {groups.map((group, i) => (
              <div key={`${group.act?.id ?? 'none'}-${i}`} className="shrink-0 px-1 pt-1.5" style={{ width: group.beats.length * COL_W }}>
                {group.act ? (
                  <button
                    type="button"
                    onClick={e => actMenu(e, group.act!)}
                    className="flex h-6 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold text-content hover:brightness-110"
                    style={{ background: `${group.act.color}22` }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: group.act.color }} />
                    <span className="truncate">{group.act.title}</span>
                  </button>
                ) : <div className="h-6" />}
              </div>
            ))}
          </div>
        )}

        {/* Beat header row */}
        <div className={cn('sticky z-20 flex border-b border-border bg-bg', data.acts.length ? 'top-8' : 'top-0')}>
          <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-border bg-bg px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-faint" style={{ width: LINE_W }}>
            Plot lines
          </div>
          {data.beats.map((beat, i) => (
            <div
              key={beat.id}
              draggable
              onDragStart={e => { drag.current = { kind: 'beat', id: beat.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', beat.title); }}
              onDragOver={allowDrop('beat', `beat:${beat.id}`)}
              onDrop={e => { e.preventDefault(); if (drag.current?.kind === 'beat') moveBeat(drag.current.id, beat.id); endDrag(); }}
              className={cn('group relative shrink-0 cursor-grab border-r border-border/60 px-3 py-2', dropKey === `beat:${beat.id}` && 'shadow-[inset_3px_0_0_rgb(var(--color-accent))]')}
              style={{ width: COL_W }}
            >
              <div className="flex items-center gap-1">
                <span className="text-[11px] tabular-nums text-faint">{i + 1}</span>
                <button
                  type="button"
                  onDoubleClick={() => void rename('Rename beat', beat.title, 'Beat name').then(t => t && update(d => ({ ...d, beats: d.beats.map(b => (b.id === beat.id ? { ...b, title: t } : b)) })))}
                  className="min-w-0 flex-1 truncate text-left text-[0.8125rem] font-medium text-content"
                  title="Double-click to rename"
                >
                  {beat.title}
                </button>
                <button type="button" onClick={e => beatMenu(e, beat)} className="icon-btn h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`${beat.title} options`}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-[11px] leading-4 text-faint" title={beat.guidance}>{beat.guidance || ' '}</p>
            </div>
          ))}
          <div className="flex shrink-0 items-center px-2">
            <button type="button" onClick={() => onAddBeat()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-faint hover:bg-surface-hover hover:text-content">
              <Plus className="h-3.5 w-3.5" /> Beat
            </button>
          </div>
        </div>

        {/* Plot line rows */}
        {data.lines.map(line => (
          <div key={line.id} className="flex border-b border-border/70">
            <div
              draggable
              onDragStart={e => { drag.current = { kind: 'line', id: line.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', line.name); }}
              onDragOver={allowDrop('line', `line:${line.id}`)}
              onDrop={e => { e.preventDefault(); if (drag.current?.kind === 'line') moveLine(drag.current.id, line.id); endDrag(); }}
              className={cn('group sticky left-0 z-10 flex shrink-0 cursor-grab items-start gap-2 border-r border-border bg-bg px-3 py-2.5', dropKey === `line:${line.id}` && 'shadow-[inset_0_3px_0_rgb(var(--color-accent))]')}
              style={{ width: LINE_W }}
            >
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: line.color }} />
              <button
                type="button"
                onDoubleClick={() => void rename('Rename plot line', line.name, 'Plot line name').then(t => t && update(d => ({ ...d, lines: d.lines.map(l => (l.id === line.id ? { ...l, name: t } : l)) })))}
                className="min-w-0 flex-1 text-left text-[0.8125rem] font-medium leading-5 text-content"
                title="Double-click to rename"
              >
                {line.name}
              </button>
              <button type="button" onClick={e => lineMenu(e, line)} className="icon-btn h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`${line.name} options`}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
            {data.beats.map(beat => {
              const key = `${beat.id}:${line.id}`;
              const cards = cardsByCell.get(key) || [];
              return (
                <div
                  key={beat.id}
                  onDragOver={allowDrop('card', `cell:${key}`)}
                  onDrop={e => { e.preventDefault(); if (drag.current?.kind === 'card') moveCard(drag.current.id, beat.id, line.id); endDrag(); }}
                  className={cn('group/cell flex min-h-[5.5rem] shrink-0 flex-col gap-1.5 border-r border-border/60 p-1.5 transition-colors', dropKey === `cell:${key}` && 'bg-accent/5')}
                  style={{ width: COL_W }}
                >
                  {cards.map(card => (
                    <CardTile
                      key={card.id}
                      card={card}
                      color={line.color}
                      dropBefore={dropKey === `card:${card.id}`}
                      onDragStart={() => { drag.current = { kind: 'card', id: card.id }; }}
                      onDragOver={allowDrop('card', `card:${card.id}`)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); if (drag.current?.kind === 'card') moveCard(drag.current.id, beat.id, line.id, card.id); endDrag(); }}
                      onOpen={() => onEditCard(card)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => onNewCard(beat.id, line.id)}
                    className={cn(
                      'flex items-center justify-center gap-1 rounded-md py-1 text-xs text-faint transition-opacity hover:bg-surface-hover hover:text-content',
                      cards.length ? 'opacity-0 group-hover/cell:opacity-100 focus:opacity-100' : 'flex-1 opacity-0 group-hover/cell:opacity-100 focus:opacity-100',
                    )}
                    aria-label={`Add a card to ${beat.title}, ${line.name}`}
                  >
                    <Plus className="h-3.5 w-3.5" /> Card
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        <div className="sticky left-0 px-2 py-2" style={{ width: LINE_W }}>
          <button type="button" onClick={onAddLine} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-faint hover:bg-surface-hover hover:text-content">
            <Plus className="h-3.5 w-3.5" /> Plot line
          </button>
        </div>
      </div>
    </div>
  );
};

const dot = (color: string): React.ComponentType<{ className?: string }> => {
  const Dot = ({ className }: { className?: string }) => <span className={cn('rounded-full', className)} style={{ background: color }} />;
  return Dot;
};

const CardTile: React.FC<{
  card: PlotCard;
  color: string;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onOpen: () => void;
}> = ({ card, color, dropBefore, onDragStart, onDragOver, onDrop, onOpen }) => {
  const status = statusMeta(card.status);
  const pov = linkName(card.pov);
  const place = linkName(card.location);
  const firstLine = card.summary.split('\n').find(l => l.trim())?.replace(/\[\[([^\]|]*)(\|([^\]]*))?\]\]/g, (_m, t: string, _a, alias?: string) => alias || t).replace(/[*_~=`#>]/g, '').trim();
  return (
    <button
      type="button"
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.title); onDragStart(); }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onOpen}
      className={cn(
        'relative w-full cursor-grab rounded-md border border-border bg-surface px-2.5 py-1.5 text-left shadow-soft transition-colors hover:border-border-strong active:cursor-grabbing',
        dropBefore && 'shadow-[0_-3px_0_rgb(var(--color-accent))]',
      )}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-[0.8125rem] leading-5 text-content">{card.title || 'Untitled scene'}</span>
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: status.color }} title={status.label} />
      </div>
      {firstLine && <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted">{firstLine}</p>}
      {(pov || place) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {pov && <span className="inline-flex max-w-full items-center gap-0.5 truncate rounded bg-surface-hover px-1 text-[10px] text-muted"><User className="h-2.5 w-2.5" />{pov}</span>}
          {place && <span className="inline-flex max-w-full items-center gap-0.5 truncate rounded bg-surface-hover px-1 text-[10px] text-muted"><MapPin className="h-2.5 w-2.5" />{place}</span>}
        </div>
      )}
    </button>
  );
};

// --- Outline ---------------------------------------------------------------------

const Outline: React.FC<{
  data: PlotData;
  files: ProjectFile[];
  assets?: Record<string, string>;
  onOpenHref: (href: string, newTab: boolean) => void;
  onEditCard: (card: PlotCard) => void;
}> = ({ data, files, assets, onOpenHref, onEditCard }) => {
  const lineById = new Map(data.lines.map(l => [l.id, l]));
  const lineOrder = new Map(data.lines.map((l, i) => [l.id, i]));
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        {beatsByAct(data).map((group, gi) => (
          <section key={`${group.act?.id ?? 'none'}-${gi}`} className="mb-8">
            {group.act && (
              <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-content">
                <span className="h-3 w-1 rounded-full" style={{ background: group.act.color }} />
                {group.act.title}
              </h2>
            )}
            {group.beats.map(beat => {
              const cards = data.cards
                .filter(c => c.beatId === beat.id)
                .sort((a, b) => (lineOrder.get(a.lineId) ?? 0) - (lineOrder.get(b.lineId) ?? 0));
              return (
                <div key={beat.id} className="mb-5 border-l border-border pl-4">
                  <h3 className="text-[0.875rem] font-medium text-content">{beat.title}</h3>
                  {beat.guidance && <p className="text-xs text-faint">{beat.guidance}</p>}
                  {cards.length === 0 ? (
                    <p className="mt-1 text-xs italic text-faint">No scenes yet.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-2">
                      {cards.map(card => {
                        const line = lineById.get(card.lineId);
                        return (
                          <li key={card.id}>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={e => { if (!(e.target as HTMLElement).closest('a, button')) onEditCard(card); }}
                              onKeyDown={e => { if (e.key === 'Enter') onEditCard(card); }}
                              className="cursor-pointer rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-surface"
                            >
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
                                {line && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: line.color }} />{line.name}</span>}
                                <span>{statusMeta(card.status).label}</span>
                                {card.pov && <span className="inline-flex items-center gap-0.5"><User className="h-3 w-3" />{linkName(card.pov)}</span>}
                                {card.location && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{linkName(card.location)}</span>}
                              </div>
                              <div className="text-[0.8125rem] font-medium text-content">{card.title || 'Untitled scene'}</div>
                              {card.summary.trim() && (
                                <div className="mt-1 text-[0.8125rem]">
                                  <MarkdownView source={card.summary} files={files} assets={assets} onOpenHref={onOpenHref} hideProperties className="md-compact" />
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
};

// --- Card dialog -------------------------------------------------------------------

const LinkField: React.FC<{
  label: string;
  value?: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
  onOpenPicker: (anchor: HTMLElement) => void;
  onClear: () => void;
}> = ({ label, value, icon: Icon, emptyLabel, onOpenPicker, onClear }) => (
  <Field label={label} className="flex-1">
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={e => onOpenPicker(e.currentTarget)}
        className="flex h-[var(--ctl-h)] min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-strong/80 px-3 text-left text-[0.8125rem] hover:border-border-strong"
      >
        <Icon className="h-4 w-4 shrink-0 text-faint" />
        <span className={cn('truncate', value ? 'text-content' : 'text-faint')}>{linkName(value) || emptyLabel}</span>
      </button>
      {value && (
        <button type="button" className="icon-btn" onClick={onClear} aria-label={`Clear ${label.toLowerCase()}`}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  </Field>
);

const CardDialog: React.FC<{
  data: PlotData;
  card: PlotCard;
  isNew: boolean;
  files: ProjectFile[];
  activeFileId?: string | null;
  onSave: (card: PlotCard) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ data, card, isNew, files, activeFileId, onSave, onDelete, onClose }) => {
  const [draft, setDraft] = useState(card);
  const [picker, setPicker] = useState<{ field: 'pov' | 'location' | 'summary'; anchor: HTMLElement } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<PlotCard>) => setDraft(d => ({ ...d, ...patch }));

  const submit = () => {
    const next: PlotCard = { ...draft, title: draft.title.trim() || 'Untitled scene' };
    if (!next.pov) delete next.pov;
    if (!next.location) delete next.location;
    onSave(next);
  };

  const pick = (name: string) => {
    if (!picker) return;
    if (picker.field === 'summary') {
      const { value, caret } = insertAtCursor(textRef.current, draft.summary, `[[${name}]]`);
      set({ summary: value });
      requestAnimationFrame(() => { textRef.current?.focus(); textRef.current?.setSelectionRange(caret, caret); });
    } else {
      set({ [picker.field]: `[[${name}]]` });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'New card' : 'Edit card'}
      footer={(
        <>
          {!isNew && (
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              className="mr-auto"
              onClick={() => void confirmDialog({ title: 'Delete this card?', message: `“${card.title || 'Untitled scene'}” will be removed from the board.`, confirmText: 'Delete', danger: true }).then(ok => ok && onDelete())}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit}>{isNew ? 'Add card' : 'Save'}</Button>
        </>
      )}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={e => { e.preventDefault(); submit(); }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
      >
        <Field label="Title">
          <Input autoFocus value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="The ambush at Greywater Ford" />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Field label="Beat" className="min-w-[10rem] flex-1">
            <Select value={draft.beatId} onChange={e => set({ beatId: e.target.value })}>
              {data.beats.map((b, i) => <option key={b.id} value={b.id}>{i + 1}. {b.title}</option>)}
            </Select>
          </Field>
          <Field label="Plot line" className="min-w-[10rem] flex-1">
            <Select value={draft.lineId} onChange={e => set({ lineId: e.target.value })}>
              {data.lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <div className="flex h-[var(--ctl-h)] rounded-lg border border-border-strong/80 p-0.5" role="radiogroup" aria-label="Status">
              {CARD_STATUSES.map(s => (
                <button
                  key={s.status}
                  type="button"
                  role="radio"
                  aria-checked={draft.status === s.status}
                  onClick={() => set({ status: s.status })}
                  className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 text-xs', draft.status === s.status ? 'bg-surface-hover text-content' : 'text-faint hover:text-content')}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <LinkField label="Point of view" icon={User} value={draft.pov} emptyLabel="Choose a character" onOpenPicker={anchor => setPicker({ field: 'pov', anchor })} onClear={() => set({ pov: undefined })} />
          <LinkField label="Location" icon={MapPin} value={draft.location} emptyLabel="Choose a location" onOpenPicker={anchor => setPicker({ field: 'location', anchor })} onClear={() => set({ location: undefined })} />
        </div>
        <Field label="Summary">
          <Textarea
            ref={textRef}
            rows={6}
            value={draft.summary}
            onChange={e => set({ summary: e.target.value })}
            placeholder="What happens, what the player does, what changes. Markdown and [[links]] work here."
          />
          <div>
            <button
              type="button"
              onClick={e => setPicker(picker?.field === 'summary' ? null : { field: 'summary', anchor: e.currentTarget })}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-hover hover:text-content"
            >
              <Link2 className="h-3.5 w-3.5" /> Link an entry or file
            </button>
          </div>
        </Field>
        <button type="submit" hidden />
      </form>
      <EntryPicker
        anchor={picker?.anchor ?? null}
        files={files}
        kinds={picker?.field === 'pov' ? ['character'] : picker?.field === 'location' ? ['location'] : undefined}
        includeFiles={picker?.field === 'summary'}
        excludeFileId={activeFileId}
        onPick={pick}
        onClose={() => setPicker(null)}
      />
    </Modal>
  );
};

export default PlotBoardEditor;
