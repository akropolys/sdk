import { useCallback, useLayoutEffect, useRef } from 'react';

type Opts = {
  // The element that morphs; its own box is the expanded shape.
  target: () => HTMLElement | null;
  // What it grows out of and lands back into; it stays on screen above the shape.
  trigger: () => HTMLElement | null;
  enabled: boolean;
  onClosed: () => void;
};

// Transform and opacity only, run by the compositor: the old per-frame clip-path ran on the
// main thread and stalled whenever React or kiku's own frame loop had work in the same frame.
const OPEN_MS = 320;
const CLOSE_MS = 260;
const MIN_MS = 120;
const REST = 'translateX(-50%)'; // the tray's own centring, set inline by ChatTopbar
// A damped spring (about 3% overshoot) sampled for linear(); older engines get a near match.
const SPRING = 'linear(0,.09,.281,.489,.673,.815,.914,.976,1.01,1.025,1.028,1.025,1.02,1.014,1.009,1.005,1.002,1.001,1)';
const SETTLE = 'cubic-bezier(.32,.72,0,1)';

let springEase: string | undefined;
const spring = () => springEase ??= typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0,1)')
  ? SPRING : 'cubic-bezier(.34,1.26,.64,1)';

type Run = { shape: Animation; content?: Animation; at: number };

export function useIslandMorph({ target, trigger, enabled, onClosed }: Opts) {
  const pillRef = useRef(REST);
  const runRef = useRef<Run | null>(null);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const stop = () => {
    const run = runRef.current;
    runRef.current = null;
    run?.shape.cancel();
    run?.content?.cancel();
  };

  // Measured once, at rest, before a run: the transform that lays the tray over the pill.
  const measure = (el: HTMLElement, tr: HTMLElement) => {
    const b = el.getBoundingClientRect(), r = tr.getBoundingClientRect();
    if (!b.width || !b.height) return REST;
    return `${REST} translate(${r.left - b.left}px,${r.top - b.top}px) scale(${r.width / b.width},${r.height / b.height})`;
  };

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = target();
    const tr = trigger();
    if (!el || !tr || !el.animate) return;
    stop();
    el.style.removeProperty('pointer-events');
    el.style.transformOrigin = '0 0';
    const pill = pillRef.current = measure(el, tr);
    const easing = spring();
    // Offsets are on the eased progress: the glass shows almost at once, the content once the shape has grown.
    const shape = el.animate([
      { transform: pill, opacity: 0 },
      { opacity: 1, offset: .2 },
      { transform: REST, opacity: 1 },
    ], { duration: OPEN_MS, easing });
    const content = (el.firstElementChild as HTMLElement | null)?.animate(
      [{ opacity: 0 }, { opacity: 0, offset: .45 }, { opacity: 1, offset: .85 }, { opacity: 1 }],
      { duration: OPEN_MS, easing },
    );
    const run: Run = runRef.current = { shape, content, at: performance.now() };
    shape.finished.then(() => { if (runRef.current === run) runRef.current = null; }, () => {});
    return () => { stop(); el.style.removeProperty('transform-origin'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const close = useCallback(() => {
    const el = target();
    const tr = enabled ? trigger() : null;
    const rect = tr?.getBoundingClientRect();
    const inView = rect && rect.bottom > 0 && rect.top < window.innerHeight;
    if (!el || !tr || !inView || !el.animate) { onClosedRef.current(); return; }
    // An interrupted open turns back from where it is, in about the time it took to get there.
    const busy = runRef.current;
    let from = REST, opacity = '1', contentOpacity = '1', ms = CLOSE_MS;
    if (busy) {
      const now = getComputedStyle(el);
      from = now.transform; opacity = now.opacity;
      const kid = el.firstElementChild;
      if (kid) contentOpacity = getComputedStyle(kid).opacity;
      ms = Math.max(MIN_MS, Math.min(CLOSE_MS, performance.now() - busy.at));
    } else pillRef.current = measure(el, tr);
    stop();
    el.style.pointerEvents = 'none'; // the landing tail must not swallow taps meant for the page
    // Held on the pill (fill) until the tray parks: letting go first paints one full-size frame.
    const shape = el.animate([
      { transform: from, opacity },
      { opacity, offset: .75 },
      { transform: pillRef.current, opacity: 0 },
    ], { duration: ms, easing: SETTLE, fill: 'forwards' });
    const content = (el.firstElementChild as HTMLElement | null)?.animate(
      [{ opacity: contentOpacity }, { opacity: contentOpacity, offset: .15 }, { opacity: 0, offset: .55 }, { opacity: 0 }],
      { duration: ms, easing: SETTLE, fill: 'forwards' },
    );
    runRef.current = { shape, content, at: -Infinity };
    shape.finished.then(() => onClosedRef.current(), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, target, trigger]);

  return { close };
}
