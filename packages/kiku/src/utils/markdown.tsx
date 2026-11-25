import React from 'react';
import { lineDirection } from './textDirection';
import { writingSlow, reducedMotion } from './writing';

const SPACING_DOUBLE_REGEX = /[ \t]{2,}/g;
const SPACING_PUNCT_REGEX = / ([.,!?:;])/g;
const SPACING_OPEN_PAREN_REGEX = /\(([ \t]+)/g;
const SPACING_CLOSE_PAREN_REGEX = /([ \t]+)\)/g;
const SPACING_UNIT_REGEX = /(\d+)\s+(MP|mAh|W|GB|MB|KHz|Hz|KSh|KES|USD|EUR)\b/gi;

const TOKEN_SPLIT_REGEX = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
const IMAGE_PARSE_REGEX = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const LINK_PARSE_REGEX = /^\[([^\]]+)\]\(([^)]+)\)$/;
const LOCAL_IMG_REGEX = /^(data:image|blob):/i;
const SAFE_LINK_REGEX = /^(https?|mailto|tel):/i;

// Only web, mail and phone links, or paths on this site: a javascript: address would run in the host page.
export function safeHref(url: unknown): string | undefined {
  const u = String(url ?? '').trim();
  return SAFE_LINK_REGEX.test(u) || (u.startsWith('/') && !u.startsWith('//')) ? u : undefined;
}
let imageHosts: ReadonlySet<string> | null = null;

// A reply's image loads only from this site or a host the caller names: any other address could carry the chat out.
function safeImage(url: string): boolean {
  if (LOCAL_IMG_REGEX.test(url)) return true;
  if (typeof location === 'undefined') return false;
  try {
    const u = new URL(url, location.href);
    return /^https?:$/.test(u.protocol) && (u.host === location.host || !!imageHosts?.has(u.host));
  } catch {
    return false;
  }
}
const MEMORY_LINK_FILTER_REGEX = /memory|mimi/i;
const MEMORY_URL_FILTER_REGEX = /mimi\.akropolys/i;

const normalizeSpacing = (text: string): string => {
  if (!text) return text;
  return text
    .replace(SPACING_DOUBLE_REGEX, ' ')
    .replace(SPACING_PUNCT_REGEX, '$1')
    .replace(SPACING_OPEN_PAREN_REGEX, '(')
    .replace(SPACING_CLOSE_PAREN_REGEX, ')')
    .replace(SPACING_UNIT_REGEX, '$1 $2');
};

const parseInline = (text: string, keyPrefix: string): React.ReactNode => {
  const normalizedText = normalizeSpacing(text);
  const parts = normalizedText.split(TOKEN_SPLIT_REGEX);

  return parts.map((part, index) => {
    if (!part) return null;
    const key = `${keyPrefix}-inline-${index}`;

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="hsk-markdown-code">
          {fxText(part.slice(1, -1), key)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{parseInline(part.slice(2, -2), key)}</strong>;
    }

    const imageMatch = part.match(IMAGE_PARSE_REGEX);
    if (imageMatch) {
      const alt = imageMatch[1];
      const url = imageMatch[2];
      if (safeImage(url)) {
        return (
          <img
            key={key}
            src={url}
            alt={alt || 'Product image'}
            className="hsk-markdown-img"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        );
      }
      return null;
    }

    const linkMatch = part.match(LINK_PARSE_REGEX);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const url = linkMatch[2];
      if (MEMORY_LINK_FILTER_REGEX.test(linkText) || MEMORY_URL_FILTER_REGEX.test(url)) {
        return null;
      }
      // safeHref also refuses //other-site.com, which would pass a "/" test.
      const href = safeHref(url);
      if (href) {
        return (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="hsk-markdown-link">
            {parseInline(linkText, key)}
          </a>
        );
      }
      return <span key={key}>{parseInline(linkText, key)}</span>;
    }

    return markNames(part, key);
  });
};

// The names of the things an answer is about (its products), longest first,
// set for the length of one render; plain-text mentions of them get a faint
// pill so the thing being discussed stands out from the sentence around it.
let entityNames: RegExp | null = null;

function namePattern(names?: readonly string[]): RegExp | null {
  const unique = [...new Set((names ?? []).map(n => n.trim()).filter(n => n.length >= 3))]
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (unique.length === 0) return null;
  // Whole names only: not inside a longer word. A browser without lookbehind
  // (Safari before 16.4) simply gets no pill rather than a broken answer.
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}])(${unique.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  } catch {
    return null;
  }
}

function markNames(text: string, key: string): React.ReactNode {
  if (!entityNames || !text) return fxText(text, key);
  const pieces = text.split(entityNames);
  if (pieces.length === 1) return fxText(text, key);
  // split() puts each matched name at the odd positions.
  return pieces.map((piece, i) => {
    if (i % 2 === 0) return <React.Fragment key={`${key}-t-${i}`}>{fxText(piece, `${key}-t-${i}`)}</React.Fragment>;
    const k = `${key}-name-${i}`;
    if (!fx) return <span key={k} className="hsk-entity-name">{piece}</span>;
    const at = fx.pos;
    const body = fxText(piece, k);
    return <Pill key={k} seen={pillSeen(fx, at)}>{body}</Pill>;
  });
}

const STAGGER_MS = 40;
const STAGGER_CAP = 14;
const BLUR_MS = 650;
const DRIFT_MS = 520;
const PILL_MS = 600;
const MAX_LIVE = 60;

export interface WritingStore {
  times: number[][];
  pills: Map<string, number>;
  cache: Map<number, { sig: string; node: React.ReactNode }>;
  ctx: string;
  seed: boolean;
}

export function createWriting(live: boolean): WritingStore {
  return { times: [], pills: new Map(), cache: new Map(), ctx: '', seed: !live };
}

interface FxFrame {
  store: WritingStore;
  now: number;
  dur: number;
  slow: boolean;
  line: number[];
  lineNo: number;
  pos: number;
  w: number;
  fresh: boolean;
  gap: boolean;
}

let fx: FxFrame | null = null;

function enterLine(lineNo: number) {
  if (!fx) return;
  fx.lineNo = lineNo;
  fx.line = fx.store.times[lineNo] ??= [];
  fx.pos = 0;
}

function pillSeen(f: FxFrame, at: number): number | null {
  const id = `${f.lineNo}:${at}`;
  let seen = f.store.pills.get(id);
  if (seen === undefined) {
    seen = f.store.seed ? -Infinity : Math.max(f.now, f.line[at] ?? f.now);
    f.store.pills.set(id, seen);
  }
  return f.now - seen < PILL_MS ? seen : null;
}

function fxText(text: string, key: string): React.ReactNode {
  const f = fx;
  if (!f || !text) return text;
  const start = f.pos;
  f.pos += text.length;
  const times = f.line;
  for (let k = 0; k < text.length; k++) {
    const space = /\s/.test(text[k]);
    if (times[start + k] === undefined) {
      if (f.store.seed) times[start + k] = -Infinity;
      else {
        if (f.fresh && !space && f.gap) f.w++;
        f.fresh = true;
        times[start + k] = f.now + Math.min(f.w, STAGGER_CAP) * STAGGER_MS;
      }
    }
    f.gap = space;
  }
  const live = (k: number) => {
    const t = times[start + k];
    return f.now - t < f.dur ? t : null;
  };
  const out: React.ReactNode[] = [];
  for (let a = 0; a < text.length;) {
    const t = live(a);
    let b = a + 1;
    while (b < text.length && live(b) === t) b++;
    const piece = text.slice(a, b);
    out.push(t === null ? piece : <Fx key={`${key}-fx-${start + a}`} t={t} slow={f.slow}>{piece}</Fx>);
    a = b;
  }
  return out.length === 1 ? out[0] : out;
}

const liveFx: Array<() => void> = [];
const useIsoLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function Fx({ t, slow, children }: { t: number; slow: boolean; children: React.ReactNode }) {
  const [delay] = React.useState(() => Math.round(t - performance.now()));
  const [on, setOn] = React.useState(true);
  useIsoLayoutEffect(() => {
    if (!on) return;
    const settle = () => setOn(false);
    liveFx.push(settle);
    while (liveFx.length > MAX_LIVE) liveFx.shift()!();
    return () => {
      const i = liveFx.indexOf(settle);
      if (i >= 0) liveFx.splice(i, 1);
    };
  }, [on]);
  if (!on) return <span>{children}</span>;
  return (
    <span
      className={slow ? 'hsk-fx-drift' : 'hsk-fx'}
      style={{ animationDelay: `${delay}ms` }}
      onAnimationEnd={e => { if (e.target === e.currentTarget) setOn(false); }}
    >
      {children}
    </span>
  );
}

function Pill({ seen, children }: { seen: number | null; children: React.ReactNode }) {
  const [delay] = React.useState(() => (seen === null ? null : Math.round(seen - performance.now())));
  const [on, setOn] = React.useState(delay !== null);
  return (
    <span
      className={on ? 'hsk-entity-name hsk-entity-name--in' : 'hsk-entity-name'}
      style={on ? { animationDelay: `${delay}ms` } : undefined}
      onAnimationEnd={on ? e => { if (e.target === e.currentTarget) setOn(false); } : undefined}
    >
      {children}
    </span>
  );
}

function Li({ t, children }: { t: number | null; children: React.ReactNode }) {
  const [delay] = React.useState(() => (t === null ? null : Math.round(t - performance.now())));
  const [on, setOn] = React.useState(delay !== null);
  return (
    <li
      className={on ? 'hsk-li-in' : undefined}
      style={on ? { animationDelay: `${delay}ms` } : undefined}
      onAnimationEnd={on ? e => { if (e.target === e.currentTarget) setOn(false); } : undefined}
    >
      {children}
    </li>
  );
}

function listItem(lineNo: number, text: string): React.ReactNode {
  const key = `li-${lineNo}`;
  if (!fx) return <li key={key}>{parseInline(text, key)}</li>;
  enterLine(lineNo);
  const body = parseInline(text, key);
  const first = fx.line[0];
  return <Li key={key} t={first !== undefined && fx.now - first < fx.dur ? first : null}>{body}</Li>;
}

function closeOpenMarks(line: string): string {
  let out = line;
  if ((out.match(/\*\*/g) || []).length % 2) out = /\*\*\s*$/.test(out) ? out.replace(/\*\*\s*$/, '') : `${out}**`;
  if ((out.match(/`/g) || []).length % 2) out = out.endsWith('`') ? out.slice(0, -1) : `${out}\``;
  return out;
}

const TABLE_SEPARATOR_REGEX = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

function isTableLine(line: string, inTable: boolean): boolean {
  const t = line.trim();
  if (inTable) return t.includes('|');
  return t.startsWith('|');
}

function splitTableCells(rowLine: string): string[] {
  let t = rowLine.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map(c => c.trim());
}

export function TableWrapper({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = React.useState<'left' | 'middle' | 'right' | 'none'>('none');
  const [isDragging, setIsDragging] = React.useState(false);
  const dragRef = React.useRef({ startX: 0, scrollLeft: 0, isDown: false, hasMoved: false });

  const checkScroll = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const canScroll = el.scrollWidth > el.clientWidth + 2;
    if (!canScroll) {
      setScrollState('none');
      return;
    }
    const rtl = getComputedStyle(el).direction === 'rtl';
    const travelled = Math.abs(el.scrollLeft);
    const atStart = travelled <= 4;
    const atEnd = travelled + el.clientWidth >= el.scrollWidth - 4;
    if (atStart) setScrollState(rtl ? 'right' : 'left');
    else if (atEnd) setScrollState(rtl ? 'left' : 'right');
    else setScrollState('middle');
  }, []);

  React.useEffect(() => {
    checkScroll();
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(checkScroll) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [checkScroll]);

  const onMouseDown = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if ((e.target as HTMLElement).closest('a, button, input')) return;
    dragRef.current = { startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, isDown: true, hasMoved: false };
    setIsDragging(true);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.isDown) return;
    const el = ref.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.5;
    if (Math.abs(walk) > 3) {
      dragRef.current.hasMoved = true;
      e.preventDefault();
      el.scrollLeft = dragRef.current.scrollLeft - walk;
    }
  };

  const onMouseUp = () => {
    dragRef.current.isDown = false;
    setIsDragging(false);
  };

  return (
    <div
      ref={ref}
      className={`hsk-table-wrapper hsk-table-wrapper--${scrollState}${isDragging ? ' is-dragging' : ''}`}
      onScroll={checkScroll}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {children}
    </div>
  );
}

export function renderMarkdown(content: string, streaming = false, hosts?: ReadonlySet<string>, names?: readonly string[], store?: WritingStore): React.ReactNode {
  imageHosts = hosts ?? null;
  entityNames = namePattern(names);
  if (store) {
    const ctx = `${[...(hosts ?? [])].join(',')}\n${(names ?? []).join('\n')}`;
    if (store.ctx !== ctx) { store.ctx = ctx; store.cache.clear(); }
    const slow = writingSlow();
    fx = reducedMotion() ? null : { store, now: performance.now(), dur: slow ? DRIFT_MS : BLUR_MS, slow, line: [], lineNo: -1, pos: 0, w: 0, fresh: false, gap: true };
  }
  try {
    return buildMarkdown(content, streaming, store);
  } finally {
    imageHosts = null;
    entityNames = null;
    fx = null;
    if (store) store.seed = false;
  }
}

function buildMarkdown(content: string, streaming: boolean, store?: WritingStore): React.ReactNode {
  const lines = content.split('\n');
  if (streaming && lines.length > 0) {
    if (!content.endsWith('\n') && lines[lines.length - 1].trim().startsWith('|')) {
      lines.pop();
    }
    let start = lines.length - 1;
    while (start >= 0 && lines[start].trim().startsWith('|')) start--;
    start++;
    if (start < lines.length && !lines.slice(start).some(l => TABLE_SEPARATOR_REGEX.test(l))) {
      lines.length = start;
    }
    if (lines.length > 0) lines[lines.length - 1] = closeOpenMarks(lines[lines.length - 1]);
  }

  const cached = (lineNo: number, sig: string, make: () => React.ReactNode): React.ReactNode => {
    if (!store) return make();
    const hit = store.cache.get(lineNo);
    if (hit && hit.sig === sig) return hit.node;
    enterLine(lineNo);
    const node = make();
    store.cache.set(lineNo, { sig, node });
    return node;
  };
  const sigOf = (lineNo: number) => `${streaming && lineNo === lines.length - 1 ? 1 : 0}|${lines[lineNo]}`;

  // The line still being typed keeps the chat's direction until it has enough letters to call.
  const dirOf = (text: string, at: number) => lineDirection(text, streaming && at === lines.length - 1 ? 15 : 1);
  const blocks: React.ReactNode[] = [];
  let currentTextNodes: React.ReactNode[] = [];
  let bubbleIndex = 0;

  const flushTextBubble = () => {
    if (currentTextNodes.length > 0) {
      blocks.push(
        <div key={`text-bubble-${bubbleIndex++}`} className="hsk-cb-ai-text">
          {currentTextNodes}
        </div>
      );
      currentTextNodes = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `md-line-${i}`;

    if (!line.trim()) {
      i++;
      continue;
    }

    const standaloneImageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (standaloneImageMatch) {
      flushTextBubble();
      const alt = standaloneImageMatch[1];
      const url = standaloneImageMatch[2];
      if (safeImage(url)) {
        blocks.push(
          <div key={key} className="hsk-markdown-img-block">
            <img
              src={url}
              alt={alt || 'Product image'}
              className="hsk-markdown-img"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        );
      }
      i++;
      continue;
    }

    const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const Tag = `h${level + 3}` as keyof JSX.IntrinsicElements; // Maps # to h4, ## to h5 to avoid messing up host page hierarchy
      const at = i;
      currentTextNodes.push(cached(at, `h|${sigOf(at)}`, () => <Tag key={key} className={`hsk-markdown-h${level}`} dir={dirOf(headerMatch[2], at)}>{parseInline(headerMatch[2], key)}</Tag>));
      i++;
      continue;
    }

    if (line.match(/^[\s]*[-*+•]\s+/)) {
      const listItems: React.ReactNode[] = [];
      let listText = '';
      while (i < lines.length && lines[i].match(/^[\s]*[-*+•]\s+/)) {
        const itemText = lines[i].replace(/^[\s]*[-*+•]\s+/, '');
        listText += itemText + ' ';
        const at = i;
        listItems.push(cached(at, `li|${sigOf(at)}`, () => listItem(at, itemText)));
        i++;
      }
      currentTextNodes.push(<ul key={`ul-${key}`} className="hsk-markdown-list hsk-markdown-ul" dir={dirOf(listText, i - 1)}>{listItems}</ul>);
      continue;
    }

    if (line.match(/^[\s]*\d+[\.\)]\s+/)) {
      const listItems: React.ReactNode[] = [];
      let listText = '';
      while (i < lines.length && lines[i].match(/^[\s]*\d+[\.\)]\s+/)) {
        const itemText = lines[i].replace(/^[\s]*\d+[\.\)]\s+/, '');
        listText += itemText + ' ';
        const at = i;
        listItems.push(cached(at, `li|${sigOf(at)}`, () => listItem(at, itemText)));
        i++;
      }
      currentTextNodes.push(<ol key={`ol-${key}`} className="hsk-markdown-list hsk-markdown-ol" dir={dirOf(listText, i - 1)}>{listItems}</ol>);
      continue;
    }

    if (isTableLine(line, false)) {
      flushTextBubble();

      let headerCells: string[] = [];
      const rawBodyRows: string[][] = [];
      let alignments: ('start' | 'center' | 'end')[] = [];
      let isHeader = true;

      while (i < lines.length && isTableLine(lines[i], true)) {
        const rowLine = lines[i].trim();
        if (rowLine.match(/^\|?[-:| ]+\|?$/) && rowLine.includes('-')) {
          const sepCells = splitTableCells(rowLine);
          alignments = sepCells.map(cell => {
            const trimmed = cell.trim();
            const startColon = trimmed.startsWith(':');
            const endColon = trimmed.endsWith(':');
            if (startColon && endColon) return 'center';
            if (endColon) return 'end';
            return 'start';
          });
          i++;
          isHeader = false;
          continue;
        }

        const cells = splitTableCells(rowLine);

        if (isHeader && headerCells.length === 0) {
          headerCells = cells;
        } else {
          rawBodyRows.push(cells);
        }
        i++;
      }

      const colCount = Math.max(headerCells.length, ...rawBodyRows.map(r => r.length));
      const finalAlignments: ('start' | 'center' | 'end')[] = [];
      for (let c = 0; c < colCount; c++) {
        if (alignments[c]) {
          finalAlignments[c] = alignments[c];
        } else if (c === 0) {
          finalAlignments[c] = 'start';
        } else {
          const numericCount = rawBodyRows.filter(r => {
            const val = (r[c] || '').trim();
            return /^[\$€£¥+-]?\d+([.,]\d+)?%?$/.test(val) || /^[\$€£¥+-]?\d+([.,]\d+)?\s*(bps|M|K|B)?$/i.test(val);
          }).length;
          finalAlignments[c] = numericCount >= Math.ceil(rawBodyRows.length / 2) ? 'end' : 'start';
        }
      }

      const headerRow = headerCells.length > 0 ? (
        <tr key={`tr-head-${key}`}>
          {headerCells.map((cell, cIdx) => (
            <th
              key={`th-${key}-${cIdx}`}
              style={{ textAlign: finalAlignments[cIdx] || 'start' }}
            >
              {}
              <bdi>{parseInline(cell, `th-${key}-${cIdx}`)}</bdi>
            </th>
          ))}
        </tr>
      ) : null;

      const bodyRows = rawBodyRows.map((cells, rIdx) => (
        <tr key={`tr-body-${key}-${rIdx}`}>
          {cells.map((cell, cIdx) => (
            <td
              key={`td-${key}-${rIdx}-${cIdx}`}
              className={cell.trim().startsWith('✓') ? 'hsk-md-ok' : cell.trim().startsWith('✗') ? 'hsk-md-bad' : undefined}
              style={{ textAlign: finalAlignments[cIdx] || 'start' }}
            >
              <bdi>{parseInline(cell, `td-${key}-${rIdx}-${cIdx}`)}</bdi>
            </td>
          ))}
        </tr>
      ));

      blocks.push(
        <TableWrapper key={`table-wrapper-${key}`}>
          <table className="hsk-markdown-table">
            {headerRow && <thead>{headerRow}</thead>}
            <tbody>{bodyRows}</tbody>
          </table>
        </TableWrapper>
      );
      continue;
    }

    const at = i;
    currentTextNodes.push(cached(at, `p|${sigOf(at)}`, () => (
      <p key={key} className="hsk-markdown-p" dir={dirOf(line, at)}>
        {parseInline(line, key)}
      </p>
    )));
    i++;
  }

  flushTextBubble();

  return <>{blocks}</>;
}
