import React from 'react';

// Helper to parse inline styles (bold, images, links, and inline code) safely into React nodes
const parseInline = (text: string, keyPrefix: string): React.ReactNode => {
  // Regex matches: images ![alt](url), links [text](url), bold **text**, inline code `code`
  const tokenRegex = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);

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
      // Basic sanitization: ensure the URL doesn't contain javascript:
      const url = linkMatch[2];
      const isSafeUrl = /^(https?|mailto|tel):/i.test(url) || url.startsWith('/');
      if (isSafeUrl) {
        return (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="hsk-markdown-link">
            {parseInline(linkMatch[1], key)}
          </a>
        );
      }
      return <span key={key}>{parseInline(linkMatch[1], key)}</span>; // Fallback to plain text if unsafe
    }

    // Return standard text
    return part;
  });
};

export function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `md-line-${i}`;

    // 1. Empty lines (spacing)
    if (!line.trim()) {
      i++;
      continue;
    }

    // 2. Standalone image lines: ![alt](url)
    const standaloneImageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (standaloneImageMatch) {
      const alt = standaloneImageMatch[1];
      const url = standaloneImageMatch[2];
      const isSafeUrl = /^(https?|data:image):/i.test(url);
      if (isSafeUrl) {
        elements.push(
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
      elements.push(<Tag key={key} className={`hsk-markdown-h${level}`}>{parseInline(headerMatch[2], key)}</Tag>);
      i++;
      continue;
    }

    // 4. Unordered Lists
    if (line.match(/^[-*]\s+/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        const itemText = lines[i].replace(/^[-*]\s+/, '');
        listItems.push(<li key={`li-${i}`}>{parseInline(itemText, `li-${i}`)}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${key}`} className="hsk-markdown-list">{listItems}</ul>);
      continue;
    }

    // 5. Tables
    if (line.trim().startsWith('|')) {
      const tableRows: React.ReactNode[] = [];
      let isHeader = true;

      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowLine = lines[i].trim();
        // Skip markdown table separator (e.g., |---|---|)
        if (rowLine.match(/^\|[-:| ]+\|$/)) {
          i++;
          isHeader = false;
          continue;
        }

        // Slice to remove outer pipes and map trim to handle empty cells properly
        const cells = rowLine.split('|').slice(1, -1).map(c => c.trim());
        const Tag = isHeader ? 'th' : 'td';
        
        tableRows.push(
          <tr key={`tr-${i}`}>
            {cells.map((cell, cIdx) => (
              <Tag key={`td-${i}-${cIdx}`}>{parseInline(cell, `td-${i}-${cIdx}`)}</Tag>
            ))}
          </tr>
        );
        i++;
      }
      
      elements.push(
        <div key={`table-wrapper-${key}`} className="hsk-table-wrapper">
          <table className="hsk-markdown-table">
            <tbody>{tableRows}</tbody>
          </table>
        </div>
      );
      continue;
    }

    // 6. Default Paragraph
    elements.push(
      <p key={key} className="hsk-markdown-p">
        {parseInline(line, key)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}
