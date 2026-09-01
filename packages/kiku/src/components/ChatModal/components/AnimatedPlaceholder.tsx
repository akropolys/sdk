import React from 'react';

export interface AnimatedPlaceholderProps {
  text?: string;
  placeholder?: string;
  visible?: boolean;
  replay?: number;
  replaySeed?: number;
  staggerMs?: number;
}

export const HSK_STAGGER_MS = 16;

const HSK_FIELD_BASE_MS = 110;

const JOINING_SCRIPT = /[؀-ۿ܀-ݏ߀-߿ࡠ-ࣿﭐ-﷿ﹰ-﻿]/;

type GraphemeSegmenter = {
  segment(input: string): Iterable<{ segment: string }>;
};
type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (locale?: string, options?: { granularity: string }) => GraphemeSegmenter;
};

export function splitPlaceholder(text: string): string[] {
  if (!text) return [];

  if (JOINING_SCRIPT.test(text)) return text.split(/(\s+)/).filter(Boolean);

  const I = typeof Intl !== 'undefined' ? (Intl as IntlWithSegmenter) : undefined;
  if (I?.Segmenter) {
    const seg = new I.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(seg.segment(text), s => s.segment);
  }

  return text.split(/(\s+)/).filter(Boolean);
}

export function AnimatedPlaceholder({
  text,
  placeholder,
  visible = true,
  replay = 0,
  replaySeed,
  staggerMs = HSK_STAGGER_MS,
}: AnimatedPlaceholderProps) {
  if (!visible) return null;
  const content = text || placeholder || '';
  if (!content) return null;
  const seed = replaySeed !== undefined ? replaySeed : replay;

  const units = splitPlaceholder(content);
  const last = Math.max(units.length - 1, 1);

  return (
    <div className="hsk-animated-placeholder" dir="auto" aria-hidden="true">
      {units.map((unit, i) => (
        <span
          key={`${content}|${seed}|${i}`}
          className="hsk-animated-placeholder__char"
          style={{
            animationDelay: `${HSK_FIELD_BASE_MS + i * staggerMs}ms`,
            '--hsk-ph-hue': `${Math.round((i / last) * 300)}`,
          } as React.CSSProperties}
        >
          {unit}
        </span>
      ))}
    </div>
  );
}
