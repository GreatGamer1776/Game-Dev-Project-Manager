import { uid } from './id';

// Timeline: world history on a fictional calendar. Years are plain integers
// (negative years are fine); eras give them "3E 433"-style labels.

export interface TimelineDate {
  year: number;
  /** 1-based index into the calendar's months. */
  month?: number;
  day?: number;
}

export interface TimelineEra {
  id: string;
  name: string;
  /** Short label shown before the era-relative year ("3E"). Empty = show the era name. */
  abbr: string;
  /** Absolute year the era begins; that year is year 1 of the era. */
  start: number;
  color: string;
}

export interface TimelineLane {
  id: string;
  name: string;
  color: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  start: TimelineDate;
  end?: TimelineDate;
  laneId: string;
  /** Markdown; [[links]] work like in documents. */
  description: string;
  color?: string;
}

export interface TimelineMonth {
  name: string;
  days: number;
}

export interface TimelineData {
  calendar: { months: TimelineMonth[] };
  eras: TimelineEra[];
  lanes: TimelineLane[];
  events: TimelineEvent[];
  view: 'chronicle' | 'lanes';
  /** Pixels per year in the lanes view. */
  zoom: number;
}

export const TIMELINE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#71717a'];

export const DEFAULT_MONTHS: TimelineMonth[] = [
  'Deepwinter', 'Thawing', 'Sowing', 'Rains', 'Bloom', 'Highsun',
  'Midsummer', 'Harvest', 'Leaffall', 'Mists', 'Frost', 'Longnight',
].map(name => ({ name, days: 30 }));

export const ZOOM_MIN = 0.01;
export const ZOOM_MAX = 200;

export const createDefaultTimeline = (): TimelineData => ({
  calendar: { months: DEFAULT_MONTHS.map(m => ({ ...m })) },
  eras: [],
  lanes: [{ id: uid(), name: 'World', color: TIMELINE_COLORS[0] }],
  events: [],
  view: 'chronicle',
  zoom: 12,
});

const toInt = (value: unknown, fallback: number) => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
};

const parseDate = (value: unknown): TimelineDate | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (v.year === undefined || v.year === null || v.year === '') return undefined;
  const date: TimelineDate = { year: toInt(v.year, 0) };
  const month = toInt(v.month, 0);
  if (month > 0) {
    date.month = month;
    const day = toInt(v.day, 0);
    if (day > 0) date.day = day;
  }
  return date;
};

const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const color = (value: unknown, fallback: string) => (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback);

/** Normalizes stored content (or anything else) into valid timeline data. */
export const parseTimeline = (content: unknown): TimelineData => {
  const fallback = createDefaultTimeline();
  if (!content || typeof content !== 'object') return fallback;
  const c = content as Record<string, unknown>;

  const rawMonths = (c.calendar as { months?: unknown } | undefined)?.months;
  const months = Array.isArray(rawMonths)
    ? rawMonths
      .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
      .map((m, i) => ({ name: str(m.name, `Month ${i + 1}`) || `Month ${i + 1}`, days: Math.max(1, toInt(m.days, 30)) }))
    : [];

  const lanes = Array.isArray(c.lanes)
    ? c.lanes
      .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === 'object')
      .map((l, i) => ({ id: str(l.id) || uid(), name: str(l.name, 'Lane'), color: color(l.color, TIMELINE_COLORS[i % TIMELINE_COLORS.length]) }))
    : [];
  if (lanes.length === 0) lanes.push(fallback.lanes[0]);
  const laneIds = new Set(lanes.map(l => l.id));

  const eras = Array.isArray(c.eras)
    ? c.eras
      .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
      .map((e, i) => ({
        id: str(e.id) || uid(),
        name: str(e.name, 'Era'),
        abbr: str(e.abbr),
        start: toInt(e.start, 0),
        color: color(e.color, TIMELINE_COLORS[(i + 3) % TIMELINE_COLORS.length]),
      }))
    : [];

  const events = Array.isArray(c.events)
    ? c.events
      .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
      .map(e => {
        const start = parseDate(e.start) ?? { year: 0 };
        const end = parseDate(e.end);
        const laneId = laneIds.has(str(e.laneId)) ? str(e.laneId) : lanes[0].id;
        const event: TimelineEvent = { id: str(e.id) || uid(), title: str(e.title, 'Untitled event'), start, laneId, description: str(e.description) };
        if (end && dateKey(end) > dateKey(start)) event.end = end;
        const eventColor = color(e.color, '');
        if (eventColor) event.color = eventColor;
        return event;
      })
    : [];

  return {
    calendar: { months: months.length ? months : fallback.calendar.months },
    eras: sortEras(eras),
    lanes,
    events,
    view: c.view === 'lanes' ? 'lanes' : 'chronicle',
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, typeof c.zoom === 'number' && Number.isFinite(c.zoom) ? c.zoom : fallback.zoom)),
  };
};

export const sortEras = (eras: TimelineEra[]) => [...eras].sort((a, b) => a.start - b.start);

/** Sortable number: year, then month, then day (missing parts sort first). */
export const dateKey = (d: TimelineDate) => d.year * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0);

export const compareEvents = (a: TimelineEvent, b: TimelineEvent) =>
  dateKey(a.start) - dateKey(b.start) || (a.end ? dateKey(a.end) : 0) - (b.end ? dateKey(b.end) : 0) || a.title.localeCompare(b.title);

/** The era a year falls in (the last era starting at or before it). */
export const eraFor = (year: number, eras: TimelineEra[]): TimelineEra | undefined => {
  let found: TimelineEra | undefined;
  for (const era of eras) if (era.start <= year) found = era;
  return found;
};

export const formatYear = (year: number, eras: TimelineEra[]): string => {
  const era = eraFor(year, eras);
  if (!era) return `Year ${year}`;
  const relative = year - era.start + 1;
  return `${era.abbr.trim() || era.name} ${relative}`;
};

export const formatDate = (date: TimelineDate, data: Pick<TimelineData, 'eras' | 'calendar'>): string => {
  const year = formatYear(date.year, data.eras);
  if (!date.month) return year;
  const month = data.calendar.months[date.month - 1]?.name ?? `Month ${date.month}`;
  return date.day ? `${date.day} ${month}, ${year}` : `${month}, ${year}`;
};

export const formatRange = (event: TimelineEvent, data: Pick<TimelineData, 'eras' | 'calendar'>): string =>
  event.end ? `${formatDate(event.start, data)} – ${formatDate(event.end, data)}` : formatDate(event.start, data);

/** Fractional year position for the lanes view (month/day place within the year). */
export const yearPosition = (date: TimelineDate, months: TimelineMonth[]): number => {
  if (!date.month || months.length === 0) return date.year;
  const totalDays = months.reduce((sum, m) => sum + m.days, 0) || 1;
  let days = 0;
  for (let i = 0; i < date.month - 1 && i < months.length; i++) days += months[i].days;
  days += Math.max(0, (date.day ?? 1) - 1);
  return date.year + days / totalDays;
};

/** Year range covering every event and era start, padded a little. */
export const yearSpan = (data: TimelineData): { from: number; to: number } => {
  const years: number[] = [];
  for (const e of data.events) {
    years.push(e.start.year);
    if (e.end) years.push(e.end.year + 1);
  }
  for (const era of data.eras) years.push(era.start);
  if (years.length === 0) return { from: 0, to: 10 };
  const from = Math.min(...years);
  const to = Math.max(...years) + 1;
  const pad = Math.max(1, Math.ceil((to - from) * 0.05));
  return { from: from - pad, to: to + pad };
};
