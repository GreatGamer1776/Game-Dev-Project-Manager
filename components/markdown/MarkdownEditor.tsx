import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, Compartment, EditorSelection, Extension } from '@codemirror/state';
import {
  EditorView, keymap, placeholder as placeholderExt, drawSelection, highlightActiveLine, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, selectAll } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, CompletionContext, CompletionResult, snippet } from '@codemirror/autocomplete';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { livePreview, markdownContext, MarkdownContext, refreshDecorations, sourceLinkClicks } from './livePreview';
import { formatDate, formatTime } from '../../utils/markdown';

export interface CompletionFile {
  name: string;
  /** Human label for the type ("Document", "Canvas", ...). */
  detail: string;
}

export interface EditorTemplate {
  name: string;
  content: string;
}

export interface MarkdownEditorContext extends MarkdownContext {
  files: () => CompletionFile[];
  tags: () => string[];
  templates: () => EditorTemplate[];
  /** Uploads pasted/dropped media and returns markdown to insert, or null. */
  uploadFiles: (files: File[]) => Promise<string | null>;
  /** Handles a drop carrying app data (file/task/asset links); returns markdown or null. */
  linkForDrop: (data: DataTransfer) => string | null;
}

export interface MarkdownEditorHandle {
  /** Wrap the selection (or a placeholder) in before/after markup; toggles off if already wrapped. */
  wrap: (before: string, after?: string, placeholder?: string) => void;
  /** Insert text at the cursor, replacing the selection. `block` puts it on its own lines. */
  insert: (text: string, options?: { block?: boolean }) => void;
  /** Toggle a line prefix ("# ", "- ", "> ", "- [ ] ") on every selected line. */
  toggleLinePrefix: (prefix: string) => void;
  undo: () => void;
  redo: () => void;
  focus: () => void;
  revealLine: (line: number) => void;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  livePreview: boolean;
  spellcheck: boolean;
  context: MarkdownEditorContext;
  /** Changes whenever the context's data changes, so decorations refresh. */
  contextKey: string;
  placeholder?: string;
}

// --- Theme ----------------------------------------------------------------

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'rgb(var(--color-content))', fontSize: 'var(--editor-fs)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-body)', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': {
    maxWidth: 'var(--editor-lw)',
    margin: '0 auto',
    padding: '2rem 1.5rem 40vh',
    caretColor: 'rgb(var(--color-accent))',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'rgb(var(--color-accent))', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgb(var(--color-accent) / 0.25) !important',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-placeholder': { color: 'rgb(var(--color-faint))' },
  '.cm-gutters': { display: 'none' },
  // Search panel
  '.cm-panels': { backgroundColor: 'rgb(var(--color-chrome))', color: 'rgb(var(--color-content))', borderColor: 'rgb(var(--color-border))' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid rgb(var(--color-border))' },
  '.cm-search': { fontFamily: 'var(--font-body)', fontSize: '12px', padding: '6px 10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' },
  '.cm-search input, .cm-search button': { fontFamily: 'var(--font-body)', fontSize: '12px' },
  '.cm-textfield': {
    backgroundColor: 'rgb(var(--color-bg))', border: '1px solid rgb(var(--color-border))', borderRadius: '5px',
    color: 'rgb(var(--color-content))', padding: '3px 6px',
  },
  '.cm-button': {
    backgroundImage: 'none', backgroundColor: 'rgb(var(--color-surface-raised))', border: '1px solid rgb(var(--color-border))',
    borderRadius: '5px', color: 'rgb(var(--color-content))', padding: '3px 8px',
  },
  '.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'rgb(var(--color-muted))' },
  '.cm-panel.cm-search [name=close]': { color: 'rgb(var(--color-faint))', fontSize: '16px' },
  '.cm-searchMatch': { backgroundColor: 'rgb(var(--color-warning) / 0.3)', borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgb(var(--color-warning) / 0.6)' },
  '.cm-selectionMatch': { backgroundColor: 'rgb(var(--color-accent) / 0.12)' },
  // Autocomplete
  '.cm-tooltip': {
    backgroundColor: 'rgb(var(--color-surface-raised))', border: '1px solid rgb(var(--color-border-strong))',
    borderRadius: '8px', boxShadow: '0 8px 24px rgb(0 0 0 / 0.28)', overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-body)', fontSize: '13px', maxHeight: '18rem', padding: '4px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 8px', borderRadius: '5px', color: 'rgb(var(--color-content))' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgb(var(--color-surface-hover))', color: 'rgb(var(--color-content))' },
  '.cm-completionDetail': { color: 'rgb(var(--color-faint))', fontStyle: 'normal', marginLeft: '12px', float: 'right' },
  '.cm-completionMatchedText': { color: 'rgb(var(--color-accent))', textDecoration: 'none', fontWeight: '600' },
  '.cm-completionIcon': { display: 'none' },
});

/** Live preview styles code + markup; markdown structure is styled by decorations. */
const liveHighlight = HighlightStyle.define([
  { tag: [t.processingInstruction, t.meta], color: 'rgb(var(--color-faint))' },
  { tag: t.url, color: 'rgb(var(--color-faint))' },
  { tag: t.keyword, color: 'rgb(var(--color-accent))' },
  { tag: [t.string, t.special(t.string)], color: 'rgb(var(--color-success))' },
  { tag: [t.number, t.bool, t.atom], color: 'rgb(var(--color-warning))' },
  { tag: t.comment, color: 'rgb(var(--color-faint))', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.definition(t.variableName)], color: 'rgb(var(--color-info))' },
  { tag: [t.typeName, t.className], color: 'rgb(var(--color-warning))' },
]);

/** Source mode: classic highlighted markdown, monospace. */
const sourceHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700', color: 'rgb(var(--color-content))' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'rgb(var(--color-accent))' },
  { tag: t.monospace, color: 'rgb(var(--color-danger))' },
  { tag: t.quote, color: 'rgb(var(--color-muted))' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'rgb(var(--color-faint))' },
  { tag: t.keyword, color: 'rgb(var(--color-accent))' },
  { tag: t.string, color: 'rgb(var(--color-success))' },
  { tag: t.comment, color: 'rgb(var(--color-faint))', fontStyle: 'italic' },
]);

const sourceTheme = EditorView.theme({ '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' } });

// --- Commands ---------------------------------------------------------------

const wrapSelection = (view: EditorView, before: string, after = before, placeholder = '') => {
  const { state } = view;
  view.dispatch(state.changeByRange(range => {
    const selected = state.sliceDoc(range.from, range.to);
    // Toggle off when the selection is already wrapped.
    const outerFrom = range.from - before.length;
    const outerTo = range.to + after.length;
    if (outerFrom >= 0 && state.sliceDoc(outerFrom, range.from) === before && state.sliceDoc(range.to, outerTo) === after) {
      return {
        changes: [{ from: outerFrom, to: range.from }, { from: range.to, to: outerTo }],
        range: EditorSelection.range(outerFrom, range.to - before.length),
      };
    }
    if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
      const inner = selected.slice(before.length, selected.length - after.length);
      return { changes: { from: range.from, to: range.to, insert: inner }, range: EditorSelection.range(range.from, range.from + inner.length) };
    }
    const text = selected || placeholder;
    return {
      changes: { from: range.from, to: range.to, insert: `${before}${text}${after}` },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
    };
  }));
  view.focus();
  return true;
};

const LINE_PREFIX_RE = /^(\s*)(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+[.)] |> )?/;

const toggleLinePrefix = (view: EditorView, prefix: string) => {
  const { state } = view;
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n);
  }
  const all = Array.from(lines).map(n => state.doc.line(n));
  const allHave = all.every(line => (LINE_PREFIX_RE.exec(line.text)?.[2] || '') === prefix);
  const changes = all.map(line => {
    const m = LINE_PREFIX_RE.exec(line.text)!;
    const from = line.from + m[1].length;
    const to = from + (m[2]?.length || 0);
    return { from, to, insert: allHave ? '' : prefix };
  });
  view.dispatch({ changes });
  view.focus();
  return true;
};

const insertText = (view: EditorView, text: string, block = false) => {
  const { state } = view;
  view.dispatch(state.changeByRange(range => {
    let insert = text;
    if (block) {
      const line = state.doc.lineAt(range.from);
      const before = state.sliceDoc(line.from, range.from);
      if (before.trim()) insert = `\n${insert}`;
      if (!insert.endsWith('\n') && state.sliceDoc(range.to, state.doc.lineAt(range.to).to).trim()) insert += '\n';
    }
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + insert.length) };
  }));
  view.focus();
};

const toggleTaskOnLine = (view: EditorView) => {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const m = /^(\s*)([-*+] )\[([ xX])\]/.exec(line.text);
  if (m) {
    const pos = line.from + m[1].length + m[2].length + 1;
    view.dispatch({ changes: { from: pos, to: pos + 1, insert: m[3] === ' ' ? 'x' : ' ' } });
    return true;
  }
  return toggleLinePrefix(view, '- [ ] ');
};

// --- Completion -------------------------------------------------------------

const SLASH_COMMANDS: { label: string; detail: string; template: string }[] = [
  { label: 'Heading 1', detail: '#', template: '# ${}' },
  { label: 'Heading 2', detail: '##', template: '## ${}' },
  { label: 'Heading 3', detail: '###', template: '### ${}' },
  { label: 'Bullet list', detail: '-', template: '- ${}' },
  { label: 'Numbered list', detail: '1.', template: '1. ${}' },
  { label: 'Task', detail: '- [ ]', template: '- [ ] ${}' },
  { label: 'Quote', detail: '>', template: '> ${}' },
  { label: 'Callout: note', detail: '[!note]', template: '> [!note] ${Title}\n> ${}' },
  { label: 'Callout: tip', detail: '[!tip]', template: '> [!tip] ${Title}\n> ${}' },
  { label: 'Callout: warning', detail: '[!warning]', template: '> [!warning] ${Title}\n> ${}' },
  { label: 'Callout: bug', detail: '[!bug]', template: '> [!bug] ${Title}\n> ${}' },
  { label: 'Code block', detail: '```', template: '```${lang}\n${}\n```' },
  { label: 'Math block', detail: '$$', template: '$$\n${}\n$$' },
  { label: 'Mermaid diagram', detail: 'mermaid', template: '```mermaid\nflowchart LR\n  A[${Start}] --> B[End]\n```' },
  { label: 'Table', detail: '| |', template: '| ${Column} | Column |\n| --- | --- |\n|  |  |' },
  { label: 'Divider', detail: '---', template: '---\n${}' },
  { label: 'Link to file', detail: '[[ ]]', template: '[[${}]]' },
  { label: 'Embed file', detail: '![[ ]]', template: '![[${}]]' },
  { label: 'Properties', detail: '---', template: '---\ntags: ${}\n---\n' },
];

const buildCompletion = (ctxRef: { current: MarkdownEditorContext }) => (context: CompletionContext): CompletionResult | null => {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);

  // [[ file links (and ![[ embeds)
  const wiki = /\[\[([^\]\n|#]*)$/.exec(before);
  if (wiki) {
    const from = context.pos - wiki[1].length;
    const closed = context.state.sliceDoc(context.pos, context.pos + 2) === ']]';
    return {
      from,
      options: ctxRef.current.files().map(file => ({
        label: file.name,
        detail: file.detail,
        apply: closed ? file.name : `${file.name}]]`,
      })),
      validFor: /^[^\]\n|#]*$/,
    };
  }

  // #tags
  const tag = /(?:^|[\s(])#([\p{L}\p{N}_\-/]*)$/u.exec(before);
  if (tag && (tag[1] || context.explicit)) {
    const tags = ctxRef.current.tags();
    if (tags.length === 0) return null;
    return { from: context.pos - tag[1].length, options: tags.map(name => ({ label: name, detail: 'tag' })), validFor: /^[\p{L}\p{N}_\-/]*$/u };
  }

  // /slash commands at the start of a line
  const slash = /^(\s*)\/([\w: -]*)$/.exec(before);
  if (slash) {
    const from = line.from + slash[1].length;
    const now = new Date();
    return {
      from,
      filter: true,
      options: [
        ...SLASH_COMMANDS.map(cmd => ({ label: `/${cmd.label}`, displayLabel: cmd.label, detail: cmd.detail, apply: snippet(cmd.template) })),
        { label: "/Today's date", displayLabel: "Today's date", detail: formatDate(now), apply: formatDate(now) },
        { label: '/Current time', displayLabel: 'Current time', detail: formatTime(now), apply: formatTime(now) },
        ...ctxRef.current.templates().map(tpl => ({ label: `/Template: ${tpl.name}`, displayLabel: `Template: ${tpl.name}`, detail: 'template', apply: tpl.content })),
      ],
    };
  }
  return null;
};

// --- Component --------------------------------------------------------------

/**
 * CodeMirror 6 markdown editor with Obsidian-style Live Preview, source mode,
 * wikilink/tag/slash completion, find & replace, and media paste/drop.
 */
const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(({
  value,
  onChange,
  onSave,
  livePreview: live,
  spellcheck,
  context,
  contextKey,
  placeholder = 'Start writing… type / for commands, [[ to link',
}, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const ctxRef = useRef(context);
  ctxRef.current = context;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const modeCompartment = useRef(new Compartment());
  const spellCompartment = useRef(new Compartment());

  const modeExtensions = (isLive: boolean): Extension =>
    isLive
      ? [livePreview, syntaxHighlighting(liveHighlight), EditorView.lineWrapping]
      : [sourceLinkClicks, syntaxHighlighting(sourceHighlight), sourceTheme, EditorView.lineWrapping];

  const spellExtension = (on: boolean): Extension =>
    EditorView.contentAttributes.of({ spellcheck: on ? 'true' : 'false', autocorrect: on ? 'on' : 'off', autocapitalize: 'sentences' });

  useEffect(() => {
    if (!hostRef.current) return;
    const handlePasteOrDrop = (files: File[], view: EditorView, pos?: number) => {
      void ctxRef.current.uploadFiles(files).then(markdownText => {
        if (!markdownText) return;
        if (pos !== undefined) view.dispatch({ selection: EditorSelection.cursor(pos) });
        insertText(view, markdownText, true);
      });
    };

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdownContext.of(ctxRef as { current: MarkdownContext }),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
        autocompletion({ override: [buildCompletion(ctxRef)], icons: false, activateOnTyping: true }),
        placeholderExt(placeholder),
        editorTheme,
        modeCompartment.current.of(modeExtensions(live)),
        spellCompartment.current.of(spellExtension(spellcheck)),
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => { onSaveRef.current?.(); return true; } },
          { key: 'Mod-b', run: v => wrapSelection(v, '**', '**', 'bold text') },
          { key: 'Mod-i', run: v => wrapSelection(v, '*', '*', 'italic text') },
          { key: 'Mod-Shift-x', run: v => wrapSelection(v, '~~', '~~', 'strikethrough') },
          { key: 'Mod-Shift-h', run: v => wrapSelection(v, '==', '==', 'highlight') },
          { key: 'Mod-e', run: v => wrapSelection(v, '`', '`', 'code') },
          { key: 'Mod-k', run: v => wrapSelection(v, '[', '](https://)', 'link text') },
          { key: 'Mod-l', preventDefault: true, run: toggleTaskOnLine },
          { key: 'Mod-a', run: selectAll },
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          paste(event, view) {
            const files = Array.from(event.clipboardData?.files || []).filter(f => /^(image|video|audio)\//.test(f.type));
            if (files.length === 0) return false;
            event.preventDefault();
            handlePasteOrDrop(files, view);
            return true;
          },
          dragover(event) {
            const types = Array.from(event.dataTransfer?.types || []);
            if (types.some(type => type.startsWith('application/x-gdpm') || type === 'Files')) {
              event.preventDefault();
              return false;
            }
            return false;
          },
          drop(event, view) {
            const data = event.dataTransfer;
            if (!data) return false;
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
            const files = Array.from(data.files || []).filter(f => /^(image|video|audio)\//.test(f.type));
            if (files.length > 0) {
              event.preventDefault();
              handlePasteOrDrop(files, view, pos);
              return true;
            }
            const link = ctxRef.current.linkForDrop(data);
            if (!link) return false;
            event.preventDefault();
            view.dispatch({ selection: EditorSelection.cursor(pos) });
            insertText(view, link);
            return true;
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is created once; props are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External edits (reading-view checkbox toggles, renamed links) flow back in.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    const head = Math.min(view.state.selection.main.head, value.length);
    view.dispatch({ changes: { from: 0, to: current.length, insert: value }, selection: EditorSelection.cursor(head) });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: modeCompartment.current.reconfigure(modeExtensions(live)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: spellCompartment.current.reconfigure(spellExtension(spellcheck)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spellcheck]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshDecorations.of(null) });
  }, [contextKey]);

  useImperativeHandle(ref, () => ({
    wrap: (before, after = before, placeholder = '') => {
      if (viewRef.current) wrapSelection(viewRef.current, before, after, placeholder);
    },
    insert: (text, options) => {
      if (viewRef.current) insertText(viewRef.current, text, options?.block);
    },
    toggleLinePrefix: prefix => {
      if (viewRef.current) toggleLinePrefix(viewRef.current, prefix);
    },
    undo: () => { if (viewRef.current) undo(viewRef.current); },
    redo: () => { if (viewRef.current) redo(viewRef.current); },
    focus: () => viewRef.current?.focus(),
    revealLine: line => {
      const view = viewRef.current;
      if (!view) return;
      const target = view.state.doc.line(Math.min(Math.max(1, line + 1), view.state.doc.lines));
      view.dispatch({
        selection: EditorSelection.cursor(target.to),
        effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 24 }),
      });
      view.focus();
    },
  }), []);

  return <div ref={hostRef} className={`md-editor h-full ${live ? 'is-live' : 'is-source'}`} />;
});

MarkdownEditor.displayName = 'MarkdownEditor';

export default MarkdownEditor;
