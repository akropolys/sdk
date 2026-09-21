import { useCallback, useLayoutEffect, useRef } from 'react';

type Opts = {
  // The element that morphs; its own box is the expanded shape.
  target: () => HTMLElement | null;
  // What it grows out of and lands back into; it stays on screen above the shape.
  trigger: () => HTMLElement | null;
  // Carries the box-shadow that clip-path would cut off, resized to the shape every frame so it never paints inside it.
  shadow?: () => HTMLElement | null;
  radius?: number;
  enabled: boolean;
  onClosed: () => void;
};

type Shell = { top: number; left: number; width: number; height: number; radius: number };

// A clipped box cannot show overshoot, so no spring: a timed ease that never passes its target.
const OPEN_MS = 300;
const CLOSE_MS = 220;
const MIN_MS = 120;
const CONTENT_FROM = 0.45;
const CONTENT_SPAN = 0.4;
const SHAPE_FADE = 0.25; // the landed glass and its shadow fade under the pill instead of vanishing in one frame

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      const d = dx(t);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sy(clamp01(t));
  };
}

const EASE = cubicBezier(0.32, 0.72, 0, 1); // iOS drawer curve

function readShell(el: HTMLElement): Shell {
  const b = el.getBoundingClientRect();
  return {
    top: b.top, left: b.left, width: b.width, height: b.height,
    radius: Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, b.height / 2),
  };
}

export function useIslandMorph({ target, trigger, shadow, radius = 0, enabled, onClosed }: Opts) {
  const shellRef = useRef<Shell | null>(null);
  const boxRef = useRef<DOMRect | null>(null);
  const closingRef = useRef(false);
  const progressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const paint = useCallback((p: number) => {
    progressRef.current = p;
    const el = target();
    const r = shellRef.current;
    const b = boxRef.current;
    if (!el || !r || !b) return;
    const q = 1 - p;
    // A trigger outside the box (a menu under its button) is reached by moving the box.
    const inTop = Math.min(Math.max(r.top, b.top), b.bottom - r.height);
    const inLeft = Math.min(Math.max(r.left, b.left), b.right - r.width);
    const shiftY = (r.top - inTop) * q;
    const shiftX = (r.left - inLeft) * q;
    const top = Math.max(0, (inTop - b.top) * q);
    const left = Math.max(0, (inLeft - b.left) * q);
    const right = Math.max(0, (b.right - inLeft - r.width) * q);
    const bottom = Math.max(0, (b.bottom - inTop - r.height) * q);
    const round = r.radius * q + radius * p;
    el.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${round}px)`;
    el.style.translate = shiftX || shiftY ? `${shiftX}px ${shiftY}px` : '';
    const sh = shadow?.();
    if (sh) {
      Object.assign(sh.style, {
        left: `${left}px`, top: `${top}px`,
        width: `${Math.max(0, b.width - left - right)}px`, height: `${Math.max(0, b.height - top - bottom)}px`,
        borderRadius: `${round}px`, translate: el.style.translate,
      });
    }
    el.style.setProperty('--hsk-island-content', String(clamp01((p - CONTENT_FROM) / CONTENT_SPAN)));
    const fade = String(clamp01(p / SHAPE_FADE));
    el.style.opacity = fade;
    if (sh) sh.style.opacity = fade;
  }, [target, shadow, radius]);

  const release = () => {
    const el = target();
    if (el) for (const prop of ['clip-path', 'translate', '--hsk-island-content', 'opacity']) el.style.removeProperty(prop);
    const sh = shadow?.();
    if (sh) for (const prop of ['left', 'top', 'width', 'height', 'border-radius', 'translate', 'opacity']) sh.style.removeProperty(prop);
  };

  const stop = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  // An interrupted run starts from where the shape is, with the time scaled to the distance left.
  const run = (to: number, fullMs: number, onDone: () => void) => {
    stop();
    const from = progressRef.current;
    const ms = Math.max(MIN_MS, fullMs * Math.abs(to - from));
    const start = performance.now();
    const frame = (now: number) => {
      const k = clamp01((now - start) / ms);
      paint(from + (to - from) * EASE(k));
      if (k < 1) rafRef.current = requestAnimationFrame(frame);
      else { rafRef.current = null; onDone(); }
    };
    paint(from);
    rafRef.current = requestAnimationFrame(frame);
  };

  const begin = (el: HTMLElement, tr: HTMLElement) => {
    shellRef.current = readShell(tr);
    el.style.clipPath = '';
    el.style.translate = '';
    boxRef.current = el.getBoundingClientRect();
  };

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = target();
    const tr = trigger();
    if (!el || !tr) return;
    closingRef.current = false;
    el.style.removeProperty('pointer-events');
    begin(el, tr);
    progressRef.current = 0;
    run(1, OPEN_MS, release);
    return () => { stop(); release(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const close = useCallback(() => {
    const el = target();
    const tr = enabled ? trigger() : null;
    const rect = tr?.getBoundingClientRect();
    const inView = rect && rect.bottom > 0 && rect.top < window.innerHeight;
    if (!el || !tr || !inView) { onClosedRef.current(); return; }
    const at = rafRef.current !== null ? progressRef.current : 1;
    begin(el, tr);
    closingRef.current = true;
    el.style.pointerEvents = 'none'; // the landing tail must not swallow taps meant for the page
    progressRef.current = at;
    // Leave the landed shape in place until it unmounts: clearing it first paints one unclipped frame.
    run(0, CLOSE_MS, () => onClosedRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, target, trigger]);

  return { close };
}
