// remark plugin for Obsidian-flavoured syntax the GFM parser doesn't know:
//   [[Target#Heading|Alias]]  -> link with a `wikilink:` URL
//   ![[Target]]               -> <md-embed target="Target"> (transclusion)
//   ==highlight==             -> <mark>
//   #tag                      -> <md-tag>
//   > [!type]+ Title          -> <md-callout kind=type fold=+ title=Title>
// Code is never touched: inline/fenced code are separate node types.

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const INLINE_RE = /(!?)\[\[([^\]\n|#]*)(?:#([^\]\n|]*))?(?:\|([^\]\n]*))?\]\]|==([^=\n]+)==|(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

const text = (value: string): MdNode => ({ type: 'text', value });

const splitText = (value: string): MdNode[] | null => {
  const out: MdNode[] = [];
  let last = 0;
  let changed = false;
  for (const m of value.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    if (m[2] !== undefined && m[0].includes('[[')) {
      const target = m[2].trim();
      if (!target) continue;
      if (index > last) out.push(text(value.slice(last, index)));
      const heading = m[3]?.trim();
      if (m[1] === '!') {
        out.push({ type: 'wikiEmbed', children: [], data: { hName: 'md-embed', hProperties: { target, heading } } });
      } else {
        const label = m[4]?.trim() || (heading ? `${target} › ${heading}` : target);
        out.push({ type: 'link', url: `wikilink:${encodeURIComponent(target)}${heading ? `#${encodeURIComponent(heading)}` : ''}`, children: [text(label)] });
      }
      last = index + m[0].length;
      changed = true;
    } else if (m[5] !== undefined) {
      if (index > last) out.push(text(value.slice(last, index)));
      out.push({ type: 'highlight', children: [text(m[5])], data: { hName: 'mark' } });
      last = index + m[0].length;
      changed = true;
    } else if (m[7] !== undefined) {
      const tagStart = index + m[6].length;
      if (tagStart > last) out.push(text(value.slice(last, tagStart)));
      out.push({ type: 'tag', children: [text(`#${m[7]}`)], data: { hName: 'md-tag' } });
      last = tagStart + m[7].length + 1;
      changed = true;
    }
  }
  if (!changed) return null;
  if (last < value.length) out.push(text(value.slice(last)));
  return out;
};

const CALLOUT_HEAD_RE = /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)\n?/;

const transformCallout = (node: MdNode) => {
  const first = node.children?.[0];
  const firstText = first?.type === 'paragraph' ? first.children?.[0] : undefined;
  if (!first || firstText?.type !== 'text' || !firstText.value) return;
  const head = CALLOUT_HEAD_RE.exec(firstText.value);
  if (!head) return;
  firstText.value = firstText.value.slice(head[0].length);
  // Drop the title paragraph if the title line was all it held.
  if (!firstText.value && first.children!.length === 1) node.children!.shift();
  else if (!firstText.value) first.children!.shift();
  node.type = 'callout';
  node.data = {
    hName: 'md-callout',
    hProperties: { kind: head[1].toLowerCase(), fold: head[2], title: head[3].trim() },
  };
};

const SKIP = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'html', 'link', 'linkReference', 'definition']);

const walk = (node: MdNode) => {
  if (!node.children) return;
  if (node.type === 'blockquote') transformCallout(node);
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.value) {
      const parts = splitText(child.value);
      if (parts) {
        next.push(...parts);
        continue;
      }
    } else if (!SKIP.has(child.type)) {
      walk(child);
    }
    next.push(child);
  }
  node.children = next;
};

export default function remarkObsidian() {
  return (tree: MdNode) => walk(tree);
}
