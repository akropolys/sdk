import { useState, useRef, useEffect } from 'react';

const ACTIVE_WINDOW_MS = 400;
const DRAIN_WINDOW_MS = 120;
const MIN_CHARS_PER_MS = 0.012;
// Without a ceiling the rate is proportional to the backlog, so a long reply
// arrives as a dump: 2000 chars queued is 80 characters in a single frame.
const MAX_CHARS_PER_MS = 0.3;
const DRAIN_MAX_CHARS_PER_MS = 1.2;

export function usePacedText(content: string, active: boolean) {
  const [shown, setShown] = useState(content);
  const shownRef = useRef(content);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // a rewritten message (retry, edit, new turn) is no longer a prefix -- show it whole
    if (reduced || !content.startsWith(shownRef.current)) {
      shownRef.current = content;
      setShown(content);
      return;
    }
    if (shownRef.current.length >= content.length) return;

    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      const backlog = content.length - shownRef.current.length;
      const rate = Math.min(
        active ? MAX_CHARS_PER_MS : DRAIN_MAX_CHARS_PER_MS,
        Math.max(MIN_CHARS_PER_MS, backlog / (active ? ACTIVE_WINDOW_MS : DRAIN_WINDOW_MS)),
      );
      const next = Math.min(content.length, shownRef.current.length + Math.max(1, Math.round(rate * dt)));
      shownRef.current = content.slice(0, next);
      setShown(shownRef.current);
      rafRef.current = next < content.length ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [content, active]);

  return shown;
}
