import React from 'react';

// Helper to normalize double spaces, stray spaces before punctuation, and units
const normalizeSpacing = (text: string): string => {
  if (!text) return text;
  return text
    .replace(/[ \t]{2,}/g, ' ')                          // Collapse double/multiple spaces to a single space
    .replace(/ ([.,!?:;])/g, '$1')                        // Remove space before punctuation ("word ." -> "word.")
    .replace(/\(([ \t]+)/g, '(')                          // Remove space after open parenthesis
    .replace(/([ \t]+)\)/g, ')')                          // Remove space before close parenthesis
    .replace(/(\d+)\s+(MP|mAh|W|GB|MB|KHz|Hz|KSh|KES|USD|EUR)\b/gi, '$1 $2'); // Normalize unit spacing
};

// Helper to parse inline styles (bold, images, links, and inline code) safely into React nodes
const parseInline = (text: string, keyPrefix: string): React.ReactNode => {
  const normalizedText = normalizeSpacing(text);
  // Regex matches: images ![alt](url), links [text](url), bold **text**, inline code `code`
  const tokenRegex = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = normalizedText.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;
    const key = `${keyPrefix}-inline-${index}`;

    // Handle Inline Code
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="hsk-markdown-code">
          {part.slice(1, -1)}
        </code>
      );
    }

    // Handle Bold
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{parseInline(part.slice(2, -2), key)}</strong>;
    }

    // Handle Images: ![alt](url)
    const imageMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      const alt = imageMatch[1];
      const url = imageMatch[2];
      const isSafeUrl = /^(https?|data:image):/i.test(url);
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

    // Handle Links: [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const url = linkMatch[2];
      // Suppress inline memory links so only the single primary memory button below is rendered
      if (/memory|mimi/i.test(linkText) || /mimi\.akropolys/i.test(url)) {
        return null;
      }
      const isSafeUrl = /^(https?|mailto|tel):/i.test(url) || url.startsWith('/');
      if (isSafeUrl) {
        return (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="hsk-markdown-link">
            {parseInline(linkText, key)}
          </a>
        );
      }
      return <span key={key}>{parseInline(linkText, key)}</span>; // Fallback to plain text if unsafe
    }

    // Return standard text
    return part;
  });
};

// A table can only START on a line beginning with "|"; continuations just need a "|".
function isTableLine(line: string, inTable: boolean): boolean {
  const t = line.trim();
  if (inTable) return t.includes('|');
  return t.startsWith('|');
}

// Strips at most one leading + one trailing pipe, so a missing closing pipe never drops the last cell.
function splitTableCells(rowLine: string): string[] {
  let t = rowLine.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map(c => c.trim());
}

// Returning the identical element reference lets React skip reconciling the
// subtree — without this every streamed token re-parses the whole history.
const cache = new Map<string, React.ReactNode>();
const CACHE_MAX = 200;

export function renderMarkdown(content: string, streaming = false): React.ReactNode {
  const cacheKey = `${streaming ? 1 : 0}:${content}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;
  const rendered = buildMarkdown(content, streaming);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, rendered);
  return rendered;
}

function buildMarkdown(content: string, streaming: boolean): React.ReactNode {
  const lines = content.split('\n');
  // While streaming, hold back a trailing table row whose closing pipe hasn't arrived yet.
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

    // 1. Empty lines. A blank line is a paragraph break, not a new bubble —
    // flushing on every one shattered a normal answer (lead-in, list, closing
    // remark) into three or four stacked bubbles. Blocks that genuinely leave
    // the bubble (tables, images) still flush below.
    if (!line.trim()) {
      i++;
      continue;
    }

    // 2. Standalone image lines: ![alt](url)
    const standaloneImageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (standaloneImageMatch) {
      flushTextBubble();
      const alt = standaloneImageMatch[1];
      const url = standaloneImageMatch[2];
      const isSafeUrl = /^(https?|data:image):/i.test(url);
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

    // 3. Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const Tag = `h${level + 3}` as keyof JSX.IntrinsicElements; // Maps # to h4, ## to h5 to avoid messing up host page hierarchy
      currentTextNodes.push(<Tag key={key} className={`hsk-markdown-h${level}`}>{parseInline(headerMatch[2], key)}</Tag>);
      i++;
      continue;
    }

    // 4. Unordered Lists (supports -, *, +, and • bullets with optional leading spaces)
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

    // 5. Ordered Lists (supports 1., 1), 2., 2) with optional leading spaces)
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

    // 6. Tables (Render 100% full width OUTSIDE text speech bubbles)
    if (isTableLine(line, false)) {
      flushTextBubble();

      const tableRows: React.ReactNode[] = [];
      let isHeader = true;

      while (i < lines.length && isTableLine(lines[i], true)) {
        const rowLine = lines[i].trim();
        // Skip markdown table separator (e.g., |---|---| or |---|---)
        if (rowLine.match(/^\|?[-:| ]+\|?$/) && rowLine.includes('-')) {
          i++;
          isHeader = false;
          continue;
        }

        const cells = splitTableCells(rowLine);
        const Tag = isHeader ? 'th' : 'td';

        tableRows.push(
          <tr key={`tr-${i}`}>
            {cells.map((cell, cIdx) => (
              <Tag key={`td-${i}-${cIdx}`} dir="auto">{parseInline(cell, `td-${i}-${cIdx}`)}</Tag>
            ))}
          </tr>
        );
        i++;
      }
      
      blocks.push(
        <div key={`table-wrapper-${key}`} className="hsk-table-wrapper">
          <table className="hsk-markdown-table">
            <tbody>{tableRows}</tbody>
          </table>
        </div>
      );
      continue;
    }

    // 7. Default Paragraph
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
