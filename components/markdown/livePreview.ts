import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { Facet, Range, StateEffect, EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import katex from 'katex';
import { WIKILINK_RE } from '../../utils/markdown';

// Obsidian-style "Live Preview" for CodeMirror 6: markdown renders in place,
// and the raw markup reappears only on the line(s) holding the cursor.

/** What the editor needs to know about the rest of the project. */
export interface MarkdownContext {
  resolveAsset: (id: string) => string | undefined;
  wikilinkExists: (target: string) => boolean;
  openHref: (href: string, newTab: boolean) => void;
}

/** Holds a ref so the plugin always reads the latest context. */
export const markdownContext = Facet.define<{ current: MarkdownContext }, { current: MarkdownContext } | null>({
  combine: values => values[values.length - 1] ?? null,
});

/** Dispatched when the context changes (files renamed, assets added). */
export const refreshDecorations = StateEffect.define<null>();

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly from: number) { super(); }
  eq(other: CheckboxWidget) { return other.checked === this.checked && other.from === this.from; }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.className = 'cm-md-checkbox';
    box.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete');
    box.addEventListener('mousedown', e => {
      e.preventDefault();
      // TaskMarker is "[ ]" / "[x]" — flip the middle character.
      view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: this.checked ? ' ' : 'x' } });
    });
    return box;
  }
}

class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-md-bullet';
    el.textContent = '•';
    return el;
  }
}

class RuleWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-md-hr';
    return el;
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  eq(other: ImageWidget) { return other.src === this.src && other.alt === this.alt; }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-md-image';
    if (this.src.startsWith('data:video')) {
      const video = document.createElement('video');
      video.src = this.src;
      video.controls = true;
      wrap.appendChild(video);
    } else if (this.src.startsWith('data:audio')) {
      const audio = document.createElement('audio');
      audio.src = this.src;
      audio.controls = true;
      wrap.appendChild(audio);
    } else {
      const img = document.createElement('img');
      img.src = this.src;
      img.alt = this.alt;
      wrap.appendChild(img);
    }
    return wrap;
  }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });

/** Line numbers (1-based) touched by any selection range. */
const activeLines = (state: EditorState): Set<number> => {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  return lines;
};

/** End offset of a leading `---` frontmatter block, or -1. */
const frontmatterEnd = (state: EditorState): number => {
  const doc = state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return -1;
  for (let n = 2; n <= Math.min(doc.lines, 200); n++) {
    if (doc.line(n).text.trim() === '---') return doc.line(n).to;
  }
  return -1;
};

const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1, ATXHeading2: 2, ATXHeading3: 3, ATXHeading4: 4, ATXHeading5: 5, ATXHeading6: 6,
  SetextHeading1: 1, SetextHeading2: 2,
};

const CALLOUT_RE = /^\s*>\s*\[!([\w-]+)\]([+-]?)/;
const CALLOUT_MARK_RE = /(^|\n)[ \t]*>[ \t]*(\[![\w-]+\][+-]?)/g;
// $$display$$ (one line) or $inline$ — the inline form needs a non-space after
// the opening $ and before the closing $, so prices like "$5 and $6" don't match.
const MATH_RE = /\$\$([^$\n]+)\$\$|(?<![\\$\w])\$([^\s$](?:[^$\n]*[^\s$\\])?)\$(?![\w$])/g;

class LabelWidget extends WidgetType {
  constructor(readonly label: string) { super(); }
  eq(other: LabelWidget) { return other.label === this.label; }
  toDOM() {
    const el = document.createElement('span');
    el.textContent = this.label;
    return el;
  }
}

class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean) { super(); }
  eq(other: MathWidget) { return other.tex === this.tex && other.display === this.display; }
  toDOM() {
    const el = document.createElement('span');
    el.className = this.display ? 'cm-md-math is-display' : 'cm-md-math';
    try {
      el.innerHTML = katex.renderToString(this.tex, { throwOnError: false, displayMode: this.display, output: 'html' });
    } catch {
      el.textContent = this.tex;
    }
    return el;
  }
}
const HIGHLIGHT_RE = /==([^=\n]+)==/g;
const INLINE_TAG_RE = /(^|[\s(])(#[\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

const buildDecorations = (view: EditorView): DecorationSet => {
  const { state } = view;
  const ctx = state.facet(markdownContext)?.current;
  const active = view.hasFocus ? activeLines(state) : new Set<number>();
  const fmEnd = frontmatterEnd(state);
  const decos: Range<Decoration>[] = [];
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const rangeActive = (from: number, to: number) => {
    const first = state.doc.lineAt(from).number;
    const last = state.doc.lineAt(to).number;
    for (let n = first; n <= last; n++) if (active.has(n)) return true;
    return false;
  };
  const lineDeco = (pos: number, cls: string, attrs?: Record<string, string>) =>
    decos.push(Decoration.line({ class: cls, attributes: attrs }).range(state.doc.lineAt(pos).from));

  // Frontmatter renders as a muted properties block and is otherwise left alone.
  if (fmEnd >= 0) {
    for (let pos = 0; pos <= fmEnd;) {
      const line = state.doc.lineAt(pos);
      lineDeco(line.from, 'cm-md-frontmatter');
      pos = line.to + 1;
    }
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: node => {
        if (node.from <= fmEnd) return node.to <= fmEnd ? false : undefined;
        const name = node.name;
        const level = HEADING_LEVEL[name];
        if (level) {
          lineDeco(node.from, `cm-md-h cm-md-h${level}`);
          return;
        }
        switch (name) {
          case 'HeaderMark': {
            if (isActive(node.from) || node.node.parent?.name.startsWith('Setext')) return;
            // Hide "## " (including the trailing space).
            const end = Math.min(node.to + 1, state.doc.lineAt(node.from).to);
            decos.push(hide.range(node.from, end));
            return;
          }
          case 'Emphasis': decos.push(Decoration.mark({ class: 'cm-md-em' }).range(node.from, node.to)); return;
          case 'StrongEmphasis': decos.push(Decoration.mark({ class: 'cm-md-strong' }).range(node.from, node.to)); return;
          case 'Strikethrough': decos.push(Decoration.mark({ class: 'cm-md-strike' }).range(node.from, node.to)); return;
          case 'InlineCode': decos.push(Decoration.mark({ class: 'cm-md-inline-code' }).range(node.from, node.to)); return;
          case 'EmphasisMark':
          case 'StrikethroughMark':
            if (!isActive(node.from)) decos.push(hide.range(node.from, node.to));
            return;
          case 'CodeMark':
            if (node.node.parent?.name === 'InlineCode' && !isActive(node.from)) decos.push(hide.range(node.from, node.to));
            return;
          case 'FencedCode': {
            for (let pos = node.from; pos <= node.to;) {
              const line = state.doc.lineAt(pos);
              const edge = line.from === state.doc.lineAt(node.from).from ? ' cm-md-codeblock-start'
                : line.to >= node.to ? ' cm-md-codeblock-end' : '';
              lineDeco(line.from, `cm-md-codeblock${edge}`);
              pos = line.to + 1;
            }
            return false;
          }
          case 'Blockquote': {
            for (let pos = node.from; pos <= node.to;) {
              const line = state.doc.lineAt(pos);
              const callout = CALLOUT_RE.exec(line.text);
              if (callout) lineDeco(line.from, 'cm-md-quote cm-md-callout-title', { 'data-callout': callout[1].toLowerCase() });
              else lineDeco(line.from, 'cm-md-quote');
              pos = line.to + 1;
            }
            return;
          }
          case 'QuoteMark':
            if (!isActive(node.from)) {
              const end = Math.min(node.to + 1, state.doc.lineAt(node.from).to);
              decos.push(hide.range(node.from, end));
            }
            return;
          case 'HorizontalRule':
            if (!isActive(node.from)) decos.push(rule.range(node.from, node.to));
            return;
          case 'ListMark': {
            const listName = node.node.parent?.parent?.name;
            const hasTask = node.node.parent?.getChild('Task');
            if (hasTask && listName === 'BulletList' && !isActive(node.from)) {
              // Tasks show only their checkbox, like Obsidian.
              decos.push(hide.range(node.from, Math.min(node.to + 1, state.doc.lineAt(node.from).to)));
            } else if (listName === 'BulletList' && !hasTask && !isActive(node.from)) decos.push(bullet.range(node.from, node.to));
            else decos.push(Decoration.mark({ class: 'cm-md-list-mark' }).range(node.from, node.to));
            return;
          }
          case 'TaskMarker': {
            const text = state.sliceDoc(node.from, node.to);
            const checked = /\[[xX]\]/.test(text);
            const sel = state.selection.main;
            const cursorInside = sel.from <= node.to && sel.to >= node.from && view.hasFocus;
            if (!cursorInside) decos.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));
            if (checked) {
              const line = state.doc.lineAt(node.from);
              if (node.to + 1 < line.to) decos.push(Decoration.mark({ class: 'cm-md-task-done' }).range(node.to + 1, line.to));
            }
            return;
          }
          case 'Link': {
            const marks = node.node.getChildren('LinkMark');
            const url = node.node.getChild('URL');
            if (marks.length < 2) return;
            const textFrom = marks[0].to;
            const textTo = marks[1].from;
            const href = url ? state.sliceDoc(url.from, url.to) : '';
            if (textTo > textFrom) {
              decos.push(Decoration.mark({ class: 'cm-md-link', attributes: href ? { 'data-href': href } : undefined }).range(textFrom, textTo));
            }
            if (!rangeActive(node.from, node.to) && href) {
              decos.push(hide.range(node.from, textFrom));
              decos.push(hide.range(textTo, node.to));
            }
            return false;
          }
          case 'Image': {
            const url = node.node.getChild('URL');
            if (!url || rangeActive(node.from, node.to)) return false;
            const raw = state.sliceDoc(url.from, url.to);
            const src = raw.startsWith('asset://') ? ctx?.resolveAsset(raw.slice('asset://'.length)) : /^https?:\/\//.test(raw) ? raw : undefined;
            const marks = node.node.getChildren('LinkMark');
            const alt = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : '';
            if (src) decos.push(Decoration.replace({ widget: new ImageWidget(src, alt) }).range(node.from, node.to));
            return false;
          }
          case 'URL':
            if (node.node.parent?.name !== 'Link' && node.node.parent?.name !== 'Image') {
              decos.push(Decoration.mark({ class: 'cm-md-link', attributes: { 'data-href': state.sliceDoc(node.from, node.to) } }).range(node.from, node.to));
            }
            return;
          default:
            return;
        }
      },
    });

    // Regex-based Obsidian syntax the markdown grammar doesn't know about.
    const text = state.sliceDoc(from, to);
    const inCode = (pos: number) => {
      const n = syntaxTree(state).resolveInner(pos, 1);
      for (let cur: typeof n | null = n; cur; cur = cur.parent) {
        if (cur.name === 'InlineCode' || cur.name === 'FencedCode' || cur.name === 'CodeBlock') return true;
      }
      return false;
    };

    for (const m of text.matchAll(new RegExp(WIKILINK_RE.source, 'g'))) {
      const start = from + (m.index ?? 0);
      const end = start + m[0].length;
      if (start <= fmEnd || inCode(start)) continue;
      const target = m[2].trim();
      const exists = ctx ? ctx.wikilinkExists(target) : true;
      const embed = m[1] === '!';
      const open = start + (embed ? 3 : 2);
      const close = end - 2;
      // With an alias, show only the alias: [[Target|Alias]].
      const pipe = m[0].indexOf('|');
      const visibleFrom = pipe >= 0 ? start + pipe + 1 : open;
      const href = `wikilink:${target}${m[3] ? `#${m[3].trim()}` : ''}`;
      decos.push(Decoration.mark({
        class: `cm-md-wikilink${exists ? '' : ' is-unresolved'}${embed ? ' is-embed' : ''}`,
        attributes: { 'data-href': href },
      }).range(visibleFrom, close));
      if (!rangeActive(start, end)) {
        decos.push(hide.range(start, visibleFrom));
        decos.push(hide.range(close, end));
      }
    }

    // Callout markers: "> [!tip] Title" shows just the (coloured) title; with no
    // title, the callout type stands in for it.
    for (const m of text.matchAll(CALLOUT_MARK_RE)) {
      const end = from + (m.index ?? 0) + m[0].length;
      const start = end - m[2].length;
      if (start <= fmEnd || rangeActive(start, end)) continue;
      const lineEnd = state.doc.lineAt(start).to;
      const hasTitle = state.sliceDoc(end, lineEnd).trim().length > 0;
      const label = m[2].replace(/^\[!|\][+-]?$/g, '');
      decos.push((hasTitle ? hide : Decoration.replace({ widget: new LabelWidget(label.charAt(0).toUpperCase() + label.slice(1)) })).range(start, Math.min(end + (hasTitle ? 1 : 0), lineEnd)));
    }

    // Math: $$…$$ and $…$ on a single line render with KaTeX off the cursor line.
    for (const m of text.matchAll(MATH_RE)) {
      const start = from + (m.index ?? 0);
      const end = start + m[0].length;
      if (start <= fmEnd || inCode(start) || rangeActive(start, end)) continue;
      const display = m[0].startsWith('$$');
      const tex = display ? m[1] : m[2];
      if (!tex?.trim()) continue;
      decos.push(Decoration.replace({ widget: new MathWidget(tex, display) }).range(start, end));
    }

    for (const m of text.matchAll(HIGHLIGHT_RE)) {
      const start = from + (m.index ?? 0);
      const end = start + m[0].length;
      if (start <= fmEnd || inCode(start)) continue;
      decos.push(Decoration.mark({ class: 'cm-md-highlight' }).range(start + 2, end - 2));
      if (!rangeActive(start, end)) {
        decos.push(hide.range(start, start + 2));
        decos.push(hide.range(end - 2, end));
      }
    }

    for (const m of text.matchAll(INLINE_TAG_RE)) {
      const start = from + (m.index ?? 0) + m[1].length;
      const end = start + m[2].length;
      if (start <= fmEnd || inCode(start)) continue;
      // "# Heading" never matches (space after #), but a heading line's text can contain tags.
      decos.push(Decoration.mark({ class: 'cm-md-tag', attributes: { 'data-href': `tag:${m[2]}` } }).range(start, end));
    }
  }

  return Decoration.set(decos, true);
};

/** Styling-only plugin: decorations plus click-to-follow for rendered links. */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state) ||
        update.transactions.some(tr => tr.effects.some(e => e.is(refreshDecorations)))
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: v => v.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-href]');
        if (!target || event.button !== 0) return false;
        const pos = view.posAtDOM(target);
        const lineActive = view.hasFocus && activeLines(view.state).has(view.state.doc.lineAt(pos).number);
        // Rendered links follow on click; on the line being edited, Ctrl/Cmd+click follows.
        if (lineActive && !(event.ctrlKey || event.metaKey)) return false;
        const ctx = view.state.facet(markdownContext)?.current;
        if (!ctx) return false;
        event.preventDefault();
        ctx.openHref(target.dataset.href || '', event.ctrlKey || event.metaKey);
        return true;
      },
    },
  },
);

/** Source mode keeps the clickable links (Ctrl/Cmd+click) without hiding anything. */
export const sourceLinkClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const line = view.state.doc.lineAt(pos);
    const offset = pos - line.from;
    const ctx = view.state.facet(markdownContext)?.current;
    if (!ctx) return false;
    for (const m of line.text.matchAll(new RegExp(WIKILINK_RE.source, 'g'))) {
      if ((m.index ?? 0) <= offset && offset <= (m.index ?? 0) + m[0].length) {
        event.preventDefault();
        ctx.openHref(`wikilink:${m[2].trim()}`, true);
        return true;
      }
    }
    for (const m of line.text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if ((m.index ?? 0) - 40 <= offset && offset <= (m.index ?? 0) + m[0].length) {
        event.preventDefault();
        ctx.openHref(m[1], true);
        return true;
      }
    }
    return false;
  },
});
