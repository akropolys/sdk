import React from 'react';

const SPACING_DOUBLE_REGEX = /[ \t]{2,}/g;
const SPACING_PUNCT_REGEX = / ([.,!?:;])/g;
const SPACING_OPEN_PAREN_REGEX = /\(([ \t]+)/g;
const SPACING_CLOSE_PAREN_REGEX = /([ \t]+)\)/g;
const SPACING_UNIT_REGEX = /(\d+)\s+(MP|mAh|W|GB|MB|KHz|Hz|KSh|KES|USD|EUR)\b/gi;

const TOKEN_SPLIT_REGEX = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
const IMAGE_PARSE_REGEX = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const LINK_PARSE_REGEX = /^\[([^\]]+)\]\(([^)]+)\)$/;
const SAFE_IMG_REGEX = /^(https?|data:image|blob):/i;
const SAFE_LINK_REGEX = /^(https?|mailto|tel):/i;
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
          {part.slice(1, -1)}
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
      const isSafeUrl = SAFE_IMG_REGEX.test(url) || url.startsWith('/');
      if (isSafeUrl) {
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
      const isSafeUrl = SAFE_LINK_REGEX.test(url) || url.startsWith('/');
      if (isSafeUrl) {
        return (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="hsk-markdown-link">
            {parseInline(linkText, key)}
          </a>
        );
      }
      return <span key={key}>{parseInline(linkText, key)}</span>;
    }

    return part;
  });
};

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

export function renderMarkdown(content: string, streaming = false): React.ReactNode {
  return buildMarkdown(content, streaming);
}

function buildMarkdown(content: string, streaming: boolean): React.ReactNode {
  const lines = content.split('\n');
  if (streaming && lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last.trim().startsWith('|') && !last.trim().endsWith('|')) {
      lines.pop();
    }
  }

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
      const isSafeUrl = /^(https?|data:image|blob):/i.test(url) || url.startsWith('/');
      if (isSafeUrl) {
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
      currentTextNodes.push(<Tag key={key} className={`hsk-markdown-h${level}`}>{parseInline(headerMatch[2], key)}</Tag>);
      i++;
      continue;
    }

    if (line.match(/^[\s]*[-*+•]\s+/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*+•]\s+/)) {
        const itemText = lines[i].replace(/^[\s]*[-*+•]\s+/, '');
        listItems.push(<li key={`li-${i}`}>{parseInline(itemText, `li-${i}`)}</li>);
        i++;
      }
      currentTextNodes.push(<ul key={`ul-${key}`} className="hsk-markdown-list hsk-markdown-ul">{listItems}</ul>);
      continue;
    }

    if (line.match(/^[\s]*\d+[\.\)]\s+/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*\d+[\.\)]\s+/)) {
        const itemText = lines[i].replace(/^[\s]*\d+[\.\)]\s+/, '');
        listItems.push(<li key={`li-${i}`}>{parseInline(itemText, `li-${i}`)}</li>);
        i++;
      }
      currentTextNodes.push(<ol key={`ol-${key}`} className="hsk-markdown-list hsk-markdown-ol">{listItems}</ol>);
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

    currentTextNodes.push(
      <p key={key} className="hsk-markdown-p">
        {parseInline(line, key)}
      </p>
    );
    i++;
  }

  flushTextBubble();

  return <>{blocks}</>;
}
