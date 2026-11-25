import { useState, useRef, useEffect } from 'react';
import { snapReveal, noteFrame, writingSlow, reducedMotion } from '../../../utils/writing';

const START_CPS = 50;
const MIN_CPS = 45;
const MAX_CPS = 400;
const BASE_CPS = 70;
const LEAD = 42;
const GAIN = 2.5;
const RATE_EASE_MS = 600;
const FINISH_MS = 900;
const FINISH_EASE_MS = 150;
const FINISH_MARGIN_MS = 120;
const MAX_STEP_MS = 120;
const SLOW_PAINT_MS = 33;

export function usePacedText(content: string, streaming: boolean) {
  const [shown, setShown] = useState(content);
  const shownRef = useRef(content);
  const targetRef = useRef(content);
  const streamingRef = useRef(streaming);
  const rateRef = useRef(0);
  const carryRef = useRef(0);
  const lastRef = useRef(0);
  const paintRef = useRef({ at: 0, pending: false });
  const deadlineRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  useEffect(() => {
    streamingRef.current = streaming;
    if (streaming) deadlineRef.current = null;
    else kickRef.current();
  }, [streaming]);

  useEffect(() => {
    targetRef.current = content;
    if (!content || reducedMotion() || !content.startsWith(shownRef.current)) {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      shownRef.current = content;
      rateRef.current = 0;
      carryRef.current = 0;
      deadlineRef.current = null;
      setShown(content);
      return;
    }

    const paint = (now: number, force: boolean) => {
      const p = paintRef.current;
      if (!force && writingSlow() && now - p.at < SLOW_PAINT_MS) { p.pending = true; return; }
      p.at = now;
      p.pending = false;
      setShown(shownRef.current);
    };

    const step = (now: number) => {
      const dt = Math.min(now - lastRef.current, MAX_STEP_MS);
      lastRef.current = now;
      noteFrame(dt);
      const target = targetRef.current;
      const len = target.length;
      const from = shownRef.current.length;
      const done = !streamingRef.current;
      if (done && deadlineRef.current === null) deadlineRef.current = now + FINISH_MS;
      if (!rateRef.current) rateRef.current = START_CPS;

      const backlog = len - from;
      const want = Math.min(MAX_CPS, Math.max(MIN_CPS, BASE_CPS + Math.max(0, backlog - LEAD) / GAIN));
      rateRef.current += (want - rateRef.current) * (1 - Math.exp(-dt / RATE_EASE_MS));
      if (done && deadlineRef.current !== null) {
        const need = backlog / (Math.max(16, deadlineRef.current - now - FINISH_MARGIN_MS) / 1000);
        if (need > rateRef.current) rateRef.current += (need - rateRef.current) * (1 - Math.exp(-dt / FINISH_EASE_MS));
      }
      carryRef.current += (rateRef.current * dt) / 1000;
      const whole = Math.floor(carryRef.current);
      const end = done && deadlineRef.current !== null && now >= deadlineRef.current;
      if (whole > 0 || end) {
        carryRef.current -= Math.max(whole, 0);
        const next = snapReveal(target, end ? len : Math.min(len, from + whole), done);
        if (next > from) {
          shownRef.current = target.slice(0, next);
          paint(now, next >= len);
        } else if (paintRef.current.pending) {
          paint(now, false);
        }
      } else if (paintRef.current.pending) {
        paint(now, false);
      }
      if (shownRef.current.length < targetRef.current.length) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        carryRef.current = 0;
        deadlineRef.current = null;
        if (paintRef.current.pending) paint(now, true);
      }
    };

    kickRef.current = () => {
      if (rafRef.current !== null || shownRef.current.length >= targetRef.current.length) return;
      lastRef.current = performance.now();
      rafRef.current = requestAnimationFrame(step);
    };
    kickRef.current();
  }, [content]);

  return shown;
}
