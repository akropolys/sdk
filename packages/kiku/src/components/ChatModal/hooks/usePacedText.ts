import { useState, useRef, useEffect } from 'react';

const ACTIVE_WINDOW_MS = 400;
const DRAIN_WINDOW_MS = 120;
const MIN_CHARS_PER_MS = 0.012;

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
      const rate = Math.max(MIN_CHARS_PER_MS, backlog / (active ? ACTIVE_WINDOW_MS : DRAIN_WINDOW_MS));
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
