import { useState, useRef, useEffect } from 'react';

const WINDOW_MS = 450;
const MIN_CPS = 45;
const MAX_CPS = 900;
const RATE_EASE_MS = 180;

export function usePacedText(content: string) {
  const [shown, setShown] = useState(content);
  const shownRef = useRef(content);
  const targetRef = useRef(content);
  const rateRef = useRef(0);
  const carryRef = useRef(0);
  const lastRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  useEffect(() => {
    targetRef.current = content;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // a rewritten message (retry, edit, new turn) is no longer a prefix -- show it whole
    if (reduced || !content.startsWith(shownRef.current)) {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      shownRef.current = content;
      rateRef.current = 0;
      carryRef.current = 0;
      setShown(content);
      return;
    }
    if (rafRef.current !== null || shownRef.current.length >= content.length) return;

    lastRef.current = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - lastRef.current, 50);
      lastRef.current = now;
      const target = targetRef.current;
      const backlog = target.length - shownRef.current.length;
      const want = Math.min(MAX_CPS, Math.max(MIN_CPS, (backlog * 1000) / WINDOW_MS));
      rateRef.current += (want - rateRef.current) * (1 - Math.exp(-dt / RATE_EASE_MS));
      carryRef.current += (rateRef.current * dt) / 1000;
      const whole = Math.floor(carryRef.current);
      if (whole > 0) {
        carryRef.current -= whole;
        shownRef.current = target.slice(0, Math.min(target.length, shownRef.current.length + whole));
        setShown(shownRef.current);
      }
      if (shownRef.current.length < targetRef.current.length) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        carryRef.current = 0;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [content]);

  return shown;
}
