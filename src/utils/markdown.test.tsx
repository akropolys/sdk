import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderMarkdown } from './markdown';

// Helper to inspect the structure of rendered React nodes
function getChildrenText(node: React.ReactNode): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getChildrenText).join('');
  
  const element = node as React.ReactElement<any>;
  if (element.props && element.props.children !== undefined) {
    return getChildrenText(element.props.children);
  }
  return '';
}

// Flat search for specific element tags in the tree
function findElementsByTag(node: React.ReactNode, tag: string): React.ReactElement<any>[] {
  const results: React.ReactElement<any>[] = [];
  
  function traverse(n: React.ReactNode) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach(traverse);
      return;
    }
    const element = n as React.ReactElement<any>;
    if (element.type === tag) {
      results.push(element);
    }
    if (element.props && element.props.children) {
      traverse(element.props.children);
    }
  }
  
  traverse(node);
  return results;
}

describe('Markdown Parser (Zero Dependency)', () => {
  describe('Headers', () => {
    it('should parse h1, h2, h3 and map them to h4, h5, h6 to preserve page structure', () => {
      const h1Node = renderMarkdown('# Header 1');
      const h2Node = renderMarkdown('## Header 2');
      const h3Node = renderMarkdown('### Header 3');

      const h4s = findElementsByTag(h1Node, 'h4');
      const h5s = findElementsByTag(h2Node, 'h5');
      const h6s = findElementsByTag(h3Node, 'h6');

      expect(h4s.length).toBe(1);
      expect(getChildrenText(h4s[0])).toBe('Header 1');
      expect(h4s[0].props.className).toBe('hsk-markdown-h1');

      expect(h5s.length).toBe(1);
      expect(getChildrenText(h5s[0])).toBe('Header 2');
      expect(h5s[0].props.className).toBe('hsk-markdown-h2');

      expect(h6s.length).toBe(1);
      expect(getChildrenText(h6s[0])).toBe('Header 3');
      expect(h6s[0].props.className).toBe('hsk-markdown-h3');
    });
  });

  describe('Unordered Lists', () => {
    it('should group consecutive list items into a single ul tag', () => {
      const md = `- First item\n- Second item\n* Third item`;
      const node = renderMarkdown(md);
      
      const uls = findElementsByTag(node, 'ul');
      expect(uls.length).toBe(1);
      expect(uls[0].props.className).toBe('hsk-markdown-list');

      const lis = findElementsByTag(uls[0], 'li');
      expect(lis.length).toBe(3);
      expect(getChildrenText(lis[0])).toBe('First item');
      expect(getChildrenText(lis[1])).toBe('Second item');
      expect(getChildrenText(lis[2])).toBe('Third item');
    });
  });

  describe('Inline Formatting', () => {
    it('should parse bold text correctly', () => {
      const md = 'Hello **world** text';
      const node = renderMarkdown(md);

      const strongs = findElementsByTag(node, 'strong');
      expect(strongs.length).toBe(1);
      expect(getChildrenText(strongs[0])).toBe('world');
    });

    it('should parse inline code snippets', () => {
      const md = 'Use `const x = 1` to define variables';
      const node = renderMarkdown(md);

      const codes = findElementsByTag(node, 'code');
      expect(codes.length).toBe(1);
      expect(getChildrenText(codes[0])).toBe('const x = 1');
      expect(codes[0].props.className).toBe('hsk-markdown-code');
    });

    it('should parse safe markdown links', () => {
      const md = 'Check out [Google](https://google.com) or [local](/about)';
      const node = renderMarkdown(md);

      const links = findElementsByTag(node, 'a');
      expect(links.length).toBe(2);
      expect(links[0].props.href).toBe('https://google.com');
      expect(getChildrenText(links[0])).toBe('Google');
      expect(links[0].props.className).toBe('hsk-markdown-link');
      expect(links[0].props.target).toBe('_blank');

      expect(links[1].props.href).toBe('/about');
      expect(getChildrenText(links[1])).toBe('local');
    });

    it('should sanitize unsafe links and fall back to plain text to prevent XSS', () => {
      const md = 'Click [here](javascript:alert("XSS")) now!';
      const node = renderMarkdown(md);

      const links = findElementsByTag(node, 'a');
      expect(links.length).toBe(0); // Should be empty due to javascript: check

      const spans = findElementsByTag(node, 'span');
      // Should wrap in a fallback span
      expect(spans.length).toBe(1);
      expect(getChildrenText(spans[0])).toBe('here');
    });

    it('should support mixed formatting: bold, links, and code together', () => {
      const md = 'Try `code` and **[Link](https://safe.com)** inline';
      const node = renderMarkdown(md);

      const codes = findElementsByTag(node, 'code');
      const strongs = findElementsByTag(node, 'strong');
      const links = findElementsByTag(node, 'a');

      expect(codes.length).toBe(1);
      expect(getChildrenText(codes[0])).toBe('code');
      
      expect(strongs.length).toBe(1);
      expect(links.length).toBe(1);
      expect(links[0].props.href).toBe('https://safe.com');
      expect(getChildrenText(links[0])).toBe('Link');
    });
  });

  describe('Tables (The LLM Trap / Malformed Inputs)', () => {
    it('should render well-formed tables correctly', () => {
      const md = `| Item | Price |\n|---|---|\n| Phone | $500 |\n| Case | $20 |`;
      const node = renderMarkdown(md);

      const tables = findElementsByTag(node, 'table');
      expect(tables.length).toBe(1);
      expect(tables[0].props.className).toBe('hsk-markdown-table');

      const ths = findElementsByTag(tables[0], 'th');
      expect(ths.length).toBe(2);
      expect(getChildrenText(ths[0])).toBe('Item');
      expect(getChildrenText(ths[1])).toBe('Price');

      const tds = findElementsByTag(tables[0], 'td');
      expect(tds.length).toBe(4);
      expect(getChildrenText(tds[0])).toBe('Phone');
      expect(getChildrenText(tds[1])).toBe('$500');
      expect(getChildrenText(tds[2])).toBe('Case');
      expect(getChildrenText(tds[3])).toBe('$20');
    });

    it('should handle empty cells and retain column alignment without filtering them out', () => {
      // Empty cell in the middle and end
      const md = `| A | B | C |\n|---|---|---|\n| val1 |  | val3 |\n| val4 | val5 |  |`;
      const node = renderMarkdown(md);

      const tables = findElementsByTag(node, 'table');
      const rows = findElementsByTag(tables[0], 'tr');
      // 1 header row, 2 body rows
      expect(rows.length).toBe(3);

      // Check row 2 (which has empty B column)
      const tdsRow2 = findElementsByTag(rows[1], 'td');
      expect(tdsRow2.length).toBe(3);
      expect(getChildrenText(tdsRow2[0])).toBe('val1');
      expect(getChildrenText(tdsRow2[1])).toBe('');
      expect(getChildrenText(tdsRow2[2])).toBe('val3');

      // Check row 3 (which has empty C column)
      const tdsRow3 = findElementsByTag(rows[2], 'td');
      expect(tdsRow3.length).toBe(3);
      expect(getChildrenText(tdsRow3[0])).toBe('val4');
      expect(getChildrenText(tdsRow3[1])).toBe('val5');
      expect(getChildrenText(tdsRow3[2])).toBe('');
    });

    it('should be resilient to varying whitespace and missing spaces', () => {
      const md = `|Item|Price|\n|---|---|\n|  Phone  |  KSh 1,200  |`;
      const node = renderMarkdown(md);

      const tables = findElementsByTag(node, 'table');
      const ths = findElementsByTag(tables[0], 'th');
      expect(getChildrenText(ths[0])).toBe('Item');
      expect(getChildrenText(ths[1])).toBe('Price');

      const tds = findElementsByTag(tables[0], 'td');
      expect(getChildrenText(tds[0])).toBe('Phone');
      expect(getChildrenText(tds[1])).toBe('KSh 1,200');
    });

    it('should gracefully parse tables with missing outer pipes or misaligned delimiters', () => {
      // LLMs sometimes output tables without leading/trailing pipes
      const md = `| Col1 | Col2 |\n|---|---|\n Col1Data | Col2Data |`;
      const node = renderMarkdown(md);

      // Col1Data row doesn't start with |, so it won't be parsed as part of the table.
      // The table parser continues as long as lines start with |
      const tables = findElementsByTag(node, 'table');
      expect(tables.length).toBe(1);
      
      const rows = findElementsByTag(tables[0], 'tr');
      expect(rows.length).toBe(1); // Only the header row because body row lacks leading pipe
    });
  });
});
