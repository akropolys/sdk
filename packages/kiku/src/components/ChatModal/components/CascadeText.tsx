import React from 'react';

const HSK_WORD_STAGGER_MS = 12;

export interface CascadeTextProps {
  children: React.ReactNode;
    baseMs?: number;
}

function plainText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (React.isValidElement(node)) return plainText((node.props as { children?: React.ReactNode }).children);
  return '';
}

function cascade(node: React.ReactNode, count: { i: number }, baseMs: number, keyPrefix: string): React.ReactNode {
  if (node === null || node === undefined || typeof node === 'boolean') return null;

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
      .split(/(\s+)/)
      .filter(Boolean)
      .map((chunk, ci) => {
        if (/^\s+$/.test(chunk)) {
          return chunk;
        }
        const delay = baseMs + count.i * HSK_WORD_STAGGER_MS;
        count.i += 1;
        return (
          <span className="hsk-cascade__w" key={`${keyPrefix}-w${ci}`} style={{ animationDelay: `${delay}ms` }}>
            {chunk}
          </span>
        );
      });
  }

  if (Array.isArray(node)) return node.map((child, i) => cascade(child, count, baseMs, `${keyPrefix}-${i}`));

  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    return React.cloneElement(el, { key: `${keyPrefix}-el` }, cascade(el.props.children, count, baseMs, `${keyPrefix}-c`));
  }

  return node;
}

export function CascadeText({ children, baseMs = 0 }: CascadeTextProps) {
  const text = plainText(children);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  const prefix = `c${Math.abs(hash)}`;

  return (
    <>
      <span className="hsk-sr-only">{text}</span>
      <span aria-hidden="true">{cascade(children, { i: 0 }, baseMs, prefix)}</span>
    </>
  );
}
