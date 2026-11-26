import { uid } from './id';

// Plot board: story beats (columns) x plot lines (rows), with scene cards in
// the cells. Structure presets seed acts and beats with short guidance.

export type CardStatus = 'idea' | 'draft' | 'final';

export interface PlotAct {
  id: string;
  title: string;
  color: string;
}

export interface PlotBeat {
  id: string;
  title: string;
  actId?: string;
  /** What this beat should accomplish (from the structure preset, editable). */
  guidance?: string;
}

export interface PlotLine {
  id: string;
  name: string;
  color: string;
}

export interface PlotCard {
  id: string;
  beatId: string;
  lineId: string;
  title: string;
  /** Markdown; [[links]] work like in documents. */
  summary: string;
  /** "[[Character]]" link, or empty. */
  pov?: string;
  /** "[[Location]]" link, or empty. */
  location?: string;
  status: CardStatus;
}

export interface PlotData {
  acts: PlotAct[];
  beats: PlotBeat[];
  lines: PlotLine[];
  cards: PlotCard[];
  view: 'grid' | 'outline';
  /** Set once a structure (or a blank board) is chosen; hides the picker. */
  started: boolean;
}

export const PLOT_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#f97316', '#ec4899', '#eab308', '#14b8a6', '#ef4444'];

export const CARD_STATUSES: { status: CardStatus; label: string; color: string }[] = [
  { status: 'idea', label: 'Idea', color: 'rgb(var(--color-faint))' },
  { status: 'draft', label: 'Draft', color: 'rgb(var(--color-warning))' },
  { status: 'final', label: 'Final', color: 'rgb(var(--color-success))' },
];

export interface StructurePreset {
  id: string;
  name: string;
  blurb: string;
  /** Recommended for game narrative. */
  game?: boolean;
  acts: { title: string; beats: [title: string, guidance: string][] }[];
}

export const STRUCTURES: StructurePreset[] = [
  {
    id: 'game-acts', name: 'Game three-act', game: true,
    blurb: 'A full game campaign, from tutorial to post-game.',
    acts: [
      { title: 'Opening', beats: [
        ['Prologue', 'A taste of the world and the core verbs before the story starts in earnest.'],
        ['Tutorial', 'Teach the controls through a story-relevant situation.'],
        ['Inciting incident', 'The event that pulls the player character out of normal life.'],
      ] },
      { title: 'Act I', beats: [
        ['First goal', 'A clear, near objective that teaches the main loop.'],
        ['Opening up', 'The world and its systems widen: new areas, companions, factions.'],
        ['First boss', 'A test of what the player has learned; a turning point in the story.'],
      ] },
      { title: 'Midgame', beats: [
        ['Exploration', 'Freedom to roam, side content, and deeper lore.'],
        ['Midpoint twist', 'A revelation that reframes the main goal.'],
        ['Rising stakes', 'The antagonist acts; losses make the threat personal.'],
      ] },
      { title: 'Act III', beats: [
        ['Low point', 'Something is lost; the player must regroup.'],
        ['Final preparation', 'Gather allies and gear; settle loose ends.'],
        ['Finale', 'The final challenge pays off every system and story thread.'],
      ] },
      { title: 'After', beats: [
        ['Ending', 'Show the consequences of the player\'s choices.'],
        ['Epilogue / post-game', 'What remains to do, and a hint of what comes next.'],
      ] },
    ],
  },
  {
    id: 'quest', name: 'Quest', game: true,
    blurb: 'One mission or side quest, start to finish.',
    acts: [
      { title: 'Setup', beats: [
        ['Hook', 'How the player hears about it: a giver, rumor, note, or event.'],
        ['Objective', 'What they are asked to do, and why it matters to the giver.'],
      ] },
      { title: 'Play', beats: [
        ['Journey', 'Getting there: travel, obstacles, and encounters.'],
        ['Complication', 'Something goes wrong or turns out to be more than it seemed.'],
        ['Twist or choice', 'New information or a decision that changes the outcome.'],
      ] },
      { title: 'Resolution', beats: [
        ['Climax', 'The main confrontation, puzzle, or boss.'],
        ['Reward and consequences', 'Loot, reputation, and how the world reacts.'],
      ] },
    ],
  },
  {
    id: 'three-act', name: 'Three-act',
    blurb: 'Setup, confrontation, resolution.',
    acts: [
      { title: 'Act I: Setup', beats: [
        ['Opening image', 'The hero\'s world before the story changes it.'],
        ['Inciting incident', 'The event that starts the story.'],
        ['Plot point 1', 'The hero commits; there is no going back.'],
      ] },
      { title: 'Act II: Confrontation', beats: [
        ['Rising action', 'Obstacles grow; allies and enemies take shape.'],
        ['Midpoint', 'A reversal or revelation that raises the stakes.'],
        ['Plot point 2', 'The worst moment; everything seems lost.'],
      ] },
      { title: 'Act III: Resolution', beats: [
        ['Climax', 'The final confrontation with the central conflict.'],
        ['Resolution', 'The new normal after the climax.'],
      ] },
    ],
  },
  {
    id: 'save-the-cat', name: 'Save the Cat',
    blurb: 'Blake Snyder\'s 15-beat sheet.',
    acts: [
      { title: 'Act 1', beats: [
        ['Opening image', 'A snapshot of the hero\'s life before change.'],
        ['Theme stated', 'Someone hints at the lesson the hero must learn.'],
        ['Setup', 'The hero\'s world, flaws, and what is missing.'],
        ['Catalyst', 'The life-changing event.'],
        ['Debate', 'The hero hesitates: should they go?'],
      ] },
      { title: 'Act 2', beats: [
        ['Break into two', 'The hero chooses to act and enters a new world.'],
        ['B story', 'A secondary story, often a relationship, that carries the theme.'],
        ['Fun and games', 'The promise of the premise: what the story is about.'],
        ['Midpoint', 'A false victory or false defeat; stakes rise.'],
        ['Bad guys close in', 'Pressure from outside and doubt from inside.'],
        ['All is lost', 'The lowest point; something or someone is lost.'],
        ['Dark night of the soul', 'The hero wallows before finding the answer.'],
      ] },
      { title: 'Act 3', beats: [
        ['Break into three', 'The solution, drawn from A and B stories.'],
        ['Finale', 'The hero applies the lesson and wins.'],
        ['Final image', 'The opposite of the opening image: proof of change.'],
      ] },
    ],
  },
  {
    id: 'heros-journey', name: 'Hero\'s Journey',
    blurb: 'The 12-stage monomyth.',
    acts: [
      { title: 'Departure', beats: [
        ['Ordinary world', 'The hero\'s normal life.'],
        ['Call to adventure', 'A challenge or quest appears.'],
        ['Refusal of the call', 'Fear or duty holds the hero back.'],
        ['Meeting the mentor', 'Guidance, training, or a gift.'],
        ['Crossing the threshold', 'The hero leaves the known world.'],
      ] },
      { title: 'Initiation', beats: [
        ['Tests, allies, enemies', 'The hero learns the rules of the new world.'],
        ['Approach to the inmost cave', 'Preparing for the central ordeal.'],
        ['The ordeal', 'A life-or-death crisis.'],
        ['Reward', 'The hero seizes the prize.'],
      ] },
      { title: 'Return', beats: [
        ['The road back', 'The journey home, often pursued.'],
        ['Resurrection', 'A final test that proves the hero has changed.'],
        ['Return with the elixir', 'The hero brings something back to share.'],
      ] },
    ],
  },
  {
    id: 'seven-point', name: 'Seven-point',
    blurb: 'Dan Wells\' structure, built backward from the resolution.',
    acts: [
      { title: 'Story', beats: [
        ['Hook', 'The starting state, opposite of the resolution.'],
        ['Plot turn 1', 'The conflict is introduced; the world changes.'],
        ['Pinch 1', 'The antagonist applies pressure; the hero must act.'],
        ['Midpoint', 'The hero moves from reacting to acting.'],
        ['Pinch 2', 'Things go wrong; the plan fails.'],
        ['Plot turn 2', 'The hero gets the last piece they need.'],
        ['Resolution', 'The climax and the end state.'],
      ] },
    ],
  },
  {
    id: 'kishotenketsu', name: 'Kishōtenketsu',
    blurb: 'Four acts built on a twist, not on conflict.',
    acts: [
      { title: 'Story', beats: [
        ['Ki (introduction)', 'Introduce the characters and setting.'],
        ['Shō (development)', 'Develop them without major change.'],
        ['Ten (twist)', 'An unexpected turn that recontextualizes everything.'],
        ['Ketsu (reconciliation)', 'Bring the threads together in a new light.'],
      ] },
    ],
  },
];

export const DEFAULT_LINES = ['Main story', 'Companion arcs', 'World events'];

export const createDefaultPlot = (): PlotData => ({
  acts: [],
  beats: [],
  lines: DEFAULT_LINES.map((name, i) => ({ id: uid(), name, color: PLOT_COLORS[i % PLOT_COLORS.length] })),
  cards: [],
  view: 'grid',
  started: false,
});

/** Appends a preset's acts and beats to the board. */
export const applyStructure = (data: PlotData, preset: StructurePreset): PlotData => {
  const acts: PlotAct[] = [];
  const beats: PlotBeat[] = [];
  preset.acts.forEach((act, i) => {
    const id = uid();
    acts.push({ id, title: act.title, color: PLOT_COLORS[(data.acts.length + i) % PLOT_COLORS.length] });
    for (const [title, guidance] of act.beats) beats.push({ id: uid(), title, actId: id, guidance });
  });
  return { ...data, acts: [...data.acts, ...acts], beats: [...data.beats, ...beats], started: true };
};

const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const color = (value: unknown, fallback: string) => (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback);
const records = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object') : []);

/** Normalizes stored content (or anything else) into valid plot data. */
export const parsePlot = (content: unknown): PlotData => {
  const fallback = createDefaultPlot();
  if (!content || typeof content !== 'object') return fallback;
  const c = content as Record<string, unknown>;
  const acts = records(c.acts).map((a, i) => ({ id: str(a.id) || uid(), title: str(a.title, 'Act'), color: color(a.color, PLOT_COLORS[i % PLOT_COLORS.length]) }));
  const actIds = new Set(acts.map(a => a.id));
  const beats = records(c.beats).map(b => {
    const beat: PlotBeat = { id: str(b.id) || uid(), title: str(b.title, 'Beat') };
    if (actIds.has(str(b.actId))) beat.actId = str(b.actId);
    if (str(b.guidance)) beat.guidance = str(b.guidance);
    return beat;
  });
  const lines = records(c.lines).map((l, i) => ({ id: str(l.id) || uid(), name: str(l.name, 'Plot line'), color: color(l.color, PLOT_COLORS[i % PLOT_COLORS.length]) }));
  if (lines.length === 0) lines.push(...fallback.lines);
  const beatIds = new Set(beats.map(b => b.id));
  const lineIds = new Set(lines.map(l => l.id));
  const cards = records(c.cards)
    .filter(card => beatIds.has(str(card.beatId)) && lineIds.has(str(card.lineId)))
    .map(card => ({
      id: str(card.id) || uid(),
      beatId: str(card.beatId),
      lineId: str(card.lineId),
      title: str(card.title, 'Untitled scene'),
      summary: str(card.summary),
      pov: str(card.pov) || undefined,
      location: str(card.location) || undefined,
      status: (['idea', 'draft', 'final'].includes(str(card.status)) ? str(card.status) : 'idea') as CardStatus,
    }));
  return {
    acts,
    beats,
    lines,
    cards,
    view: c.view === 'outline' ? 'outline' : 'grid',
    started: c.started === true || beats.length > 0,
  };
};

/** Beats in board order, each with its act (beats without an act group under null). */
export const beatsByAct = (data: PlotData): { act: PlotAct | null; beats: PlotBeat[] }[] => {
  const groups: { act: PlotAct | null; beats: PlotBeat[] }[] = [];
  for (const beat of data.beats) {
    const act = data.acts.find(a => a.id === beat.actId) ?? null;
    const last = groups[groups.length - 1];
    if (last && last.act?.id === act?.id) last.beats.push(beat);
    else groups.push({ act, beats: [beat] });
  }
  return groups;
};

/** The board as a markdown outline (acts > beats > cards). */
export const plotToMarkdown = (data: PlotData, title: string): string => {
  const out: string[] = [`# ${title}`, ''];
  for (const group of beatsByAct(data)) {
    if (group.act) out.push(`## ${group.act.title}`, '');
    for (const beat of group.beats) {
      out.push(`### ${beat.title}`, '');
      const cards = data.cards.filter(c => c.beatId === beat.id);
      if (cards.length === 0) {
        out.push('_No scenes yet._', '');
        continue;
      }
      for (const line of data.lines) {
        for (const card of cards.filter(c => c.lineId === line.id)) {
          const meta = [line.name, card.pov && `POV ${card.pov}`, card.location && `at ${card.location}`].filter(Boolean).join(' · ');
          out.push(`- **${card.title}** (${meta})`);
          if (card.summary.trim()) out.push(...card.summary.trim().split('\n').map(l => `  ${l}`));
        }
      }
      out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
};
