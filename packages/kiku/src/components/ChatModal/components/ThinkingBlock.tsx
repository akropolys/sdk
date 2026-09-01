import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../../../utils/cn';
import { useT } from '../types';

export function parseThinking(text: string): { thinking: string; content: string; isComplete: boolean } {
  const openMatch = text.match(/<\s*thinking\s*>/i);
  if (!openMatch) {
    return { thinking: '', content: text, isComplete: true };
  }

  const openIdx = openMatch.index ?? 0;
  const openTagLength = openMatch[0].length;
  const start = openIdx + openTagLength;

  const contentBefore = text.slice(0, openIdx);
  const textAfterOpen = text.slice(start);

  const closeMatch = textAfterOpen.match(/<\/\s*thinking\s*>/i);
  if (!closeMatch) {
    return {
      thinking: textAfterOpen,
      content: contentBefore,
      isComplete: false
    };
  }

  const closeIdx = closeMatch.index ?? 0;
  const closeTagLength = closeMatch[0].length;

  return {
    thinking: textAfterOpen.slice(0, closeIdx),
    content: contentBefore + textAfterOpen.slice(closeIdx + closeTagLength),
    isComplete: true
  };
}

export function ThinkingBlock({ text, isComplete, seconds: fixedSeconds }: { text: string; isComplete: boolean; seconds?: number }) {
  const tr = useT();
  const startRef = useRef(Date.now());
  const [seconds, setSeconds] = useState<number | null>(() => (isComplete ? null : 0));
  const [isOpen, setIsOpen] = useState(!isComplete);

  useEffect(() => {
    if (isComplete) {
      if (seconds !== null) {
        setSeconds(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
        setIsOpen(false);
      }
      return;
    }
    setIsOpen(true);
    const t = setInterval(() => {
      setSeconds(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [isComplete]);

  const finalSeconds = fixedSeconds ?? seconds;
  const label = isComplete
    ? (finalSeconds !== null && finalSeconds !== undefined
        ? tr('thoughtForSeconds', { duration: `${finalSeconds}s` })
        : tr('thoughtProcess'))
    : `${tr('thinking')}${seconds ? ` · ${seconds}s` : '…'}`;
  const expandable = !!text;

  return (
    <div className={cn('hsk-cb-think', !isComplete && 'hsk-cb-think--live')}>
      <button
        type="button"
        className={cn('hsk-cb-think-head', !expandable && 'hsk-cb-think-head--static')}
        onClick={expandable ? () => setIsOpen(o => !o) : undefined}
        aria-expanded={expandable ? isOpen : undefined}
      >
        <span>{label}</span>
        {expandable && <span className={cn('hsk-cb-think-chevron', isOpen && 'hsk-cb-think-chevron--open')}>▶</span>}
      </button>
      {expandable && isOpen && <div className="hsk-cb-think-body">{text}</div>}
    </div>
  );
}
