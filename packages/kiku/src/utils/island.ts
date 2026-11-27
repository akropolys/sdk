import { useCallback, useLayoutEffect, useRef } from 'react';

type Opts = {
  // The element that morphs; its own box is the expanded shape.
  target: () => HTMLElement | null;
  // What it grows out of and lands back into; it stays on screen above the shape.
  trigger: () => HTMLElement | null;
  enabled: boolean;
  onClosed: () => void;
};

// Dock shape.
const CH = ['w', 'h', 'r'] as const;
type Ch = typeof CH[number];
type Spring = { resp: number; zeta: number; delay?: number };
const OPEN: Record<Ch, Spring> = { h: { resp: .34, zeta: .76 }, w: { resp: .5, zeta: .74, delay: 70 }, r: { resp: .6, zeta: 1, delay: 40 } };
// Closing narrows it first, then pulls it up into the pill.
const CLOSE: Record<Ch, Spring> = { w: { resp: .28, zeta: 1 }, h: { resp: .34, zeta: 1, delay: 70 }, r: { resp: .25, zeta: 1 } };
const REST = 'translateX(-50%)'; // the tray's own centring, set inline by ChatTopbar
const STEP = 16;  // ms between keyframes
const BEAT = 40;  // content waits this long after the shape is within 2% of its size
const ITEMS = '.hsk-cb-tray-aside, .hsk-cb-theme-grid-item, .hsk-cb-dock-layout';

type Track = Record<Ch, { x: number[]; v: number[] }>;
type Geo = { W: number; H: number; R: number; w0: number; h0: number; dx: number };
type Run = { track: Track; T: number; shape: Animation; anims: Animation[] };

const clamp01 = (n: number) => n < 0 ? 0 : n > 1 ? 1 : n;
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const px = (n: number) => n.toFixed(2) + 'px';

// Semi-implicit Euler at 1 ms, unit mass. Stops when every channel rests, or when `done` says so.
function simulate(x: Record<Ch, number>, v: Record<Ch, number>, to: Record<Ch, number>, cfg: Record<Ch, Spring>, done?: (h: number) => boolean) {
  const track = {} as Track;
  for (const k of CH) track[k] = { x: [], v: [] };
  let t = 0;
  for (; t < 1500; t++) {
    let rest = true;
    for (const k of CH) {
      track[k].x.push(x[k]); track[k].v.push(v[k]);
      const c = cfg[k];
      if (t >= (c.delay ?? 0)) {
        const w = 2 * Math.PI / c.resp;
        v[k] += (-w * w * (x[k] - to[k]) - 2 * c.zeta * w * v[k]) / 1000;
        x[k] += v[k] / 1000;
      }
      const eps = k === 'r' ? .002 : .2, veps = k === 'r' ? .03 : 6;
      if (Math.abs(x[k] - to[k]) > eps || Math.abs(v[k]) > veps) rest = false;
    }
    if (done ? t > 0 && done(x.h) : rest) break;
  }
  return { track, T: Math.max(1, Math.min(t, track.w.x.length - 1)) };
}

// The radii you see, undone from the scale: top round as the pill, bottom a full drop, both easing to the dock's.
const frame = (g: Geo, w: number, h: number, r: number) => {
  const sx = w / g.W, sy = h / g.H, p = clamp01((w - g.w0) / (g.W - g.w0)), q = clamp01(r);
  const rt = lerp(Math.min(w, h) / 2, g.R, q), rb = lerp(Math.min(w / 2, h), g.R, q);
  return {
    transform: `${REST} translate(${px(g.dx * (1 - p))},0) scale(${sx.toFixed(4)},${sy.toFixed(4)})`,
    borderRadius: `${px(rt / sx)} ${px(rt / sx)} ${px(rb / sx)} ${px(rb / sx)} / ${px(rt / sy)} ${px(rt / sy)} ${px(rb / sy)} ${px(rb / sy)}`,
  };
};

export function useIslandMorph({ target, trigger, enabled, onClosed }: Opts) {
  const geoRef = useRef<Geo | null>(null);
  const runRef = useRef<Run | null>(null);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const stop = () => {
    const r = runRef.current;
    runRef.current = null;
    r?.anims.forEach(a => a.cancel());
  };

  // Measured at rest only (parked, or settled open): the transform is then just the centring.
  const measure = (el: HTMLElement, tr: HTMLElement): Geo | null => {
    const b = el.getBoundingClientRect(), p = tr.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return {
      W: el.offsetWidth, H: el.offsetHeight, R: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 18,
      w0: p.width * .6, h0: p.height / 2, dx: p.left + p.width / 2 - (b.left + b.width / 2),
    };
  };

  const run = (el: HTMLElement, tr: HTMLElement, open: boolean) => {
    const live = runRef.current;
    const g = live && geoRef.current ? geoRef.current : (geoRef.current = measure(el, tr));
    if (!g) return false;
    const items = Array.from(el.querySelectorAll<HTMLElement>(ITEMS));
    // Where the shape is now, and how fast it moves: from the live simulation, never a guess.
    const x: Record<Ch, number> = open ? { w: g.w0, h: g.h0, r: 0 } : { w: g.W, h: g.H, r: 1 };
    const v: Record<Ch, number> = { w: 0, h: 0, r: 0 };
    let op = open ? 0 : 1, iop = items.map(() => op);
    if (live) {
      const i = Math.min(Math.round(Number(live.shape.currentTime) || 0), live.T);
      for (const k of CH) { x[k] = live.track[k].x[i]; v[k] = live.track[k].v[i]; }
      op = +getComputedStyle(el).opacity;
      iop = items.map(n => +getComputedStyle(n).opacity);
    }
    stop();

    const { track, T } = open
      ? simulate(x, v, { w: g.W, h: g.H, r: 1 }, OPEN)
      // Aimed past the pill so it lands in finite time; the run ends once the drop is hidden behind it.
      : simulate(x, v, { w: g.w0 * .7, h: g.h0 - 8, r: 0 }, CLOSE, h => h <= g.h0 + .5);
    const opAt = (t: number) => open ? lerp(op, 1, clamp01(t / 50)) : t < T - 60 ? op : lerp(op, 0, (t - T + 60) / 60);
    const shapeKf: Keyframe[] = [], cornerKf: Keyframe[] = [];
    for (let t = 0; ; t = Math.min(t + STEP, T)) {
      const f = frame(g, track.w.x[t], track.h.x[t], track.r.x[t]);
      shapeKf.push({ offset: t / T, transform: f.transform, opacity: opAt(t) });
      cornerKf.push({ offset: t / T, borderRadius: f.borderRadius });
      if (t === T) break;
    }
    const fill: FillMode = open ? 'none' : 'forwards'; // held on the pill until the tray parks
    const shape = el.animate(shapeKf, { duration: T, fill });
    const anims = [shape, el.animate(cornerKf, { duration: T, fill })];

    let settle = T;
    if (open) for (let t = 0; t <= T; t++) if (Math.abs(track.w.x[t] - g.W) < g.W * .02 && Math.abs(track.h.x[t] - g.H) < g.H * .02) { settle = t; break; }
    items.forEach((n, i) => {
      const o = iop[i];
      anims.push(open
        ? n.animate([{ opacity: o, transform: `translateY(${4 * (1 - o)}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, delay: settle + BEAT + i * 14, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' })
        : n.animate([{ opacity: o }, { opacity: 0 }], { duration: 90 * o + 1, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }));
    });
    // The pill answers, barely: a little give as the drop leaves, a little take as it lands.
    if (open && !live) anims.push(tr.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(.985,1.04)', offset: .3 }, { transform: 'scale(1,1)' }], { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1)' }));
    if (!open) anims.push(tr.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.035,.97)', offset: .35 }, { transform: 'scale(1,1)' }], { duration: 260, delay: Math.max(0, T - 50), easing: 'cubic-bezier(.3,.7,.3,1)' }));

    const r: Run = runRef.current = { track, T, shape, anims };
    if (open) Promise.all(anims.map(a => a.finished)).then(() => { if (runRef.current === r) stop(); }, () => {});
    else shape.finished.then(() => { if (runRef.current === r) onClosedRef.current(); }, () => {});
    return true;
  };

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = target(), tr = trigger();
    if (!el || !tr || !el.animate) return;
    el.style.removeProperty('pointer-events');
    run(el, tr, true);
    return () => { stop(); geoRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const close = useCallback(() => {
    const el = target();
    const tr = enabled ? trigger() : null;
    const rect = tr?.getBoundingClientRect();
    const inView = rect && rect.bottom > 0 && rect.top < window.innerHeight;
    if (!el || !tr || !inView || !el.animate) { onClosedRef.current(); return; }
    el.style.pointerEvents = 'none'; // the landing tail must not swallow taps meant for the page
    if (!run(el, tr, false)) onClosedRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, target, trigger]);

  return { close };
}
