// Launcher effects: soft clay, paper stack and a border beam. Loaded only when one is set.
export type LauncherEffect = 'clay' | 'paper' | 'beam';

type P = { x: number; y: number };
type Fx = { layout(): void; tick?(dt: number): boolean; move?(p: P | null): void; mode?(m: string): void; up?(): void };
type W = { el: HTMLElement; btn: HTMLButtonElement; w: number; h: number; mode: string; pressed: boolean; vis: boolean; fx: Fx; uid: number; wake(): void };

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const f1 = (v: number) => String(Math.round(v * 10) / 10);
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const svg = (tag: string, cls: string, parent?: Element) => {
  const e = document.createElementNS(NS, tag);
  if (cls) e.setAttribute('class', cls);
  e.setAttribute('aria-hidden', 'true');
  parent?.appendChild(e);
  return e as SVGElement;
};
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Pill outline, button-local px.
const perim = (w: number, h: number, o: number) => 2 * Math.max(0, w - h) + TAU * (h / 2 + o);
function stad(w: number, h: number, o: number, s: number) {
  const r = h / 2 + o, L = Math.max(0, w - h), A = Math.PI * r, Pm = 2 * L + TAU * r;
  s = ((s % Pm) + Pm) % Pm;
  let x, y, nx, ny, a;
  if (s < L) { x = h / 2 + s; y = h / 2 - r; nx = 0; ny = -1; }
  else if (s < L + A) { a = -Math.PI / 2 + (s - L) / r; nx = Math.cos(a); ny = Math.sin(a); x = w - h / 2 + r * nx; y = h / 2 + r * ny; }
  else if (s < 2 * L + A) { x = w - h / 2 - (s - L - A); y = h / 2 + r; nx = 0; ny = 1; }
  else { a = Math.PI / 2 + (s - 2 * L - A) / r; nx = Math.cos(a); ny = Math.sin(a); x = h / 2 + r * nx; y = h / 2 + r * ny; }
  return { x, y, nx, ny };
}
function smooth(p: number[][]) {
  const n = p.length, g = (i: number) => p[(i + n) % n];
  let d = 'M' + f1(p[0][0]) + ' ' + f1(p[0][1]);
  for (let i = 0; i < n; i++) {
    const a = g(i - 1), b = g(i), c = g(i + 1), e = g(i + 2);
    d += 'C' + f1(b[0] + (c[0] - a[0]) / 6) + ' ' + f1(b[1] + (c[1] - a[1]) / 6) + ' ' + f1(c[0] - (e[0] - b[0]) / 6) + ' ' + f1(c[1] - (e[1] - b[1]) / 6) + ' ' + f1(c[0]) + ' ' + f1(c[1]);
  }
  return d + 'Z';
}
function cutLoop(w: number, h: number, seed: number) {
  const R = rng(seed), Pm = perim(w, h, 0), n = Math.round(Pm / 7);
  let d = '';
  for (let i = 0; i < n; i++) { const q = stad(w, h, 0, Pm * i / n), j = (R() - .5) * .9; d += (i ? 'L' : 'M') + f1(q.x + q.nx * j) + ' ' + f1(q.y + q.ny * j); }
  return d + 'Z';
}

// Springs, same model as kiku's brain.
type S = { x: number; v: number; t: number; f: number; z: number };
const sp = (x: number, f: number, z: number): S => ({ x, v: 0, t: x, f, z });
function runSprings(list: S[], dt: number, e = .01) {
  const n = Math.ceil(dt / .008), h = dt / n;
  for (let k = 0; k < n; k++) for (const s of list) { const w = TAU * s.f; s.v += (w * w * (s.t - s.x) - 2 * s.z * w * s.v) * h; s.x += s.v * h; }
  let moving = false;
  for (const s of list) { if (Math.abs(s.t - s.x) < e && Math.abs(s.v) < e * 8) { s.x = s.t; s.v = 0; } else moving = true; }
  return moving;
}
const snap = (list: S[]) => { for (const s of list) { s.x = s.t; s.v = 0; } };

// One frame loop for all launchers; sleeps when nothing moves or the tab is hidden.
const loop = {
  on: new Set<W>(), raf: 0, last: 0,
  wake(x: W) {
    if (!x.vis || !x.fx.tick) return;
    this.on.add(x);
    if (!this.raf && !document.hidden) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.tick(t)); }
  },
  tick(t: number) {
    const dt = Math.min(.05, Math.max(.001, (t - this.last) / 1000)); this.last = t;
    for (const x of this.on) if (!x.vis || !x.fx.tick!(dt)) this.on.delete(x);
    this.raf = this.on.size && !document.hidden ? requestAnimationFrame(tt => this.tick(tt)) : 0;
  },
};
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(loop.raf); loop.raf = 0; }
  else if (loop.on.size && !loop.raf) { loop.last = performance.now(); loop.raf = requestAnimationFrame(t => loop.tick(t)); }
});

const CSS = `.kfx{position:relative;display:inline-flex;isolation:isolate;vertical-align:middle;--kfx-on:#fff}
.kfx>button{position:relative;z-index:1;white-space:nowrap}
.kfx-o{position:absolute;z-index:0;pointer-events:none;overflow:visible}
.kfx.clay>button{background:transparent!important;border-color:transparent!important;box-shadow:none!important;color:var(--kfx-on)!important}
.kfx .s1{stop-color:color-mix(in oklab,var(--kfx-accent),#fff 24%)}.kfx .s2{stop-color:var(--kfx-accent)}.kfx .s3{stop-color:color-mix(in oklab,var(--kfx-accent),#000 12%)}
.kfx .sh{fill:color-mix(in oklab,var(--kfx-accent),#000 26%)}.kfx .ao{fill:var(--kfx-cast)}
.kfx.paper>button{background:var(--kfx-accent)!important;border-color:transparent!important;color:var(--kfx-on)!important;will-change:transform;filter:drop-shadow(0 1px 1px var(--kfx-cast))}
.kfx .ps{will-change:transform;filter:drop-shadow(0 1px 1px var(--kfx-cast))}
.kfx .l1 path{fill:color-mix(in oklab,var(--kfx-accent) 66%,var(--kfx-surf))}.kfx .l2 path{fill:color-mix(in oklab,var(--kfx-accent) 42%,var(--kfx-surf))}.kfx .l3 path{fill:color-mix(in oklab,var(--kfx-accent) 22%,var(--kfx-surf))}
.kfx-beam{position:absolute;inset:0;z-index:2;border-radius:999px;padding:1.5px;pointer-events:none;background:conic-gradient(from var(--kfx-a,0deg),transparent 0 76%,color-mix(in oklab,var(--kfx-accent) 40%,transparent) 86%,var(--kfx-accent) 93%,#fff 95%,transparent 97%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:kfx-spin 3.6s linear infinite}
.kfx.off .kfx-beam{animation-play-state:paused}
@keyframes kfx-spin{to{--kfx-a:360deg}}
@media (prefers-reduced-motion:reduce){.kfx-beam{animation:none;--kfx-a:210deg}}`;

function styleFor(root: Document | ShadowRoot) {
  const host = root instanceof Document ? root.head : root;
  if (host.querySelector?.('style[data-kfx]')) return;
  const st = document.createElement('style');
  st.setAttribute('data-kfx', '');
  st.textContent = CSS;
  host.appendChild(st);
}

function overlay(x: W, M: number) {
  const s = svg('svg', 'kfx-o', x.el);
  x.el.insertBefore(s, x.btn);
  return { s, size(w: number, h: number) { s.setAttribute('viewBox', `${-M} ${-M} ${w + 2 * M} ${h + 2 * M}`); s.setAttribute('width', String(w + 2 * M)); s.setAttribute('height', String(h + 2 * M)); s.style.left = s.style.top = -M + 'px'; } };
}

function clay(x: W): Fx {
  const o = overlay(x, 16), id = 'kfxg' + x.uid;
  o.s.innerHTML = `<defs><linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s1"/><stop offset=".5" class="s2"/><stop offset="1" class="s3"/></linearGradient><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path class="ao" transform="translate(0 7)" opacity=".5"/><path class="sh" transform="translate(0 2.5)"/><path fill="url(#${id}a)"/><path fill="url(#${id}b)" transform="translate(0 -.8)"/>`;
  const [ao, sh, bd, hl] = Array.from(o.s.querySelectorAll('path'));
  const N = 40, d = new Float32Array(N), v = new Float32Array(N), tg = new Float32Array(N), tmp = new Float32Array(N);
  let base: ReturnType<typeof stad>[] = [], ptr: P | null = null, introT = -1;
  const render = () => {
    if (!base.length) return;
    const a: number[][] = [], b: number[][] = [];
    for (let i = 0; i < N; i++) { const q = base[i]; a.push([q.x + q.nx * d[i], q.y + q.ny * d[i]]); b.push([q.x + q.nx * (d[i] - 3.2), q.y + q.ny * (d[i] - 3.2)]); }
    const s = smooth(a); ao.setAttribute('d', s); sh.setAttribute('d', s); bd.setAttribute('d', s); hl.setAttribute('d', smooth(b));
  };
  return {
    layout() { o.size(x.w, x.h); const Pm = perim(x.w, x.h, 0); base = Array.from({ length: N }, (_, i) => stad(x.w, x.h, 0, Pm * i / N)); render(); },
    mode(m) { if (m === 'intro' && !RM()) { d.fill(-7); v.fill(0); introT = 0; } x.wake(); },
    move(p) { ptr = p; x.wake(); },
    up() { if (!RM()) for (let i = 0; i < N; i++) v[i] += 70; x.wake(); },
    tick(dt) {
      let swell = x.pressed ? -2.8 : x.mode === 'hover' ? 1.4 : 0;
      if (introT >= 0) { introT += dt; const t = introT - 1; if (t > 0 && t < 3.4) swell += 1.4 * Math.sin(Math.PI * t / 3.4); if (introT > 4.6) introT = -1; }
      for (let i = 0; i < N; i++) {
        let pull = 0;
        if (ptr && !RM()) {
          const q = base[i], vx = ptr.x - q.x, vy = ptr.y - q.y, dn = vx * q.nx + vy * q.ny, tn = vx * q.ny - vy * q.nx;
          if (dn > 0) { const k = dn / 22; pull = 9 * k * Math.exp(1 - k) * Math.exp(-tn * tn / 1150); }
        }
        tmp[i] = swell + pull;
      }
      for (let i = 0; i < N; i++) tg[i] = .25 * tmp[(i + N - 1) % N] + .5 * tmp[i] + .25 * tmp[(i + 1) % N];
      if (RM()) { d.set(tg); v.fill(0); render(); return false; }
      const n = Math.ceil(dt / .006), hh = dt / n, w = TAU * 3.1, W2 = w * w, Z = 2 * .34 * w, C = 520;
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < N; i++) v[i] += (W2 * (tg[i] - d[i]) - Z * v[i] + C * (d[(i + N - 1) % N] + d[(i + 1) % N] - 2 * d[i])) * hh;
        for (let i = 0; i < N; i++) d[i] += v[i] * hh;
      }
      let moving = introT >= 0;
      for (let i = 0; i < N && !moving; i++) if (Math.abs(tg[i] - d[i]) > .02 || Math.abs(v[i]) > .2) moving = true;
      if (!moving) d.set(tg);
      render();
      return moving;
    },
  };
}

function paper(x: W): Fx {
  const L = [1, 2, 3].map(k => {
    const s = svg('svg', 'kfx-o ps l' + k);
    x.el.insertBefore(s, x.el.firstChild);
    return { k, s, p: svg('path', '', s), X: sp(0, 3.1 - .4 * k, .55), Y: sp(0, 3.1 - .4 * k, .55), R: sp(0, 2.8 - .3 * k, .6) };
  });
  const B = { X: sp(0, 3.4, .5), Y: sp(0, 3.4, .5), R: sp(0, 3, .55), Q: sp(1, 4.2, .32) };
  const all = [B.X, B.Y, B.R, B.Q, ...L.flatMap(l => [l.X, l.Y, l.R])];
  let ptr: P | null = null, introAt = -1, wasPressed = false, laid = false;
  const targets = () => {
    let lx = 0, ly = 0;
    if (ptr && !RM()) {
      const dx = ptr.x - x.w / 2, dy = ptr.y - x.h / 2, dd = Math.hypot(dx, dy), m = Math.min(7, dd * .045) * clamp(1.6 - dd / 220, 0, 1);
      if (dd > 0) { lx = dx / dd * m; ly = dy / dd * m * .8; }
    }
    const hov = x.mode === 'hover', pr = x.pressed, t = introAt >= 0 ? performance.now() - introAt : 1e9;
    B.X.t = lx; B.Y.t = ly + (pr ? 2.2 : hov ? -1.5 : 0) + (t < 120 ? -6 : 0); B.R.t = lx * .3; B.Q.t = pr ? .94 : 1;
    for (const l of L) {
      const k = l.k, par = 1 - .3 * k, open = t < 160 * k + 200 ? 0 : 1, sq = pr ? .4 : hov ? 1.25 : 1;
      l.X.t = (lx * par + .7 * k) * open; l.Y.t = (ly * par + 2.6 * k * sq) * open; l.R.t = ((k % 2 ? .7 : -.5) + lx * .3 * par) * open;
    }
    if (t > 1200) introAt = -1;
  };
  const apply = () => {
    const sy = B.Q.x, sx = 1 + (1 - sy) * .8;
    x.btn.style.transform = `translate(${B.X.x.toFixed(2)}px,${B.Y.x.toFixed(2)}px) rotate(${B.R.x.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
    for (const l of L) l.s.style.transform = `translate(${l.X.x.toFixed(2)}px,${l.Y.x.toFixed(2)}px) rotate(${l.R.x.toFixed(2)}deg)`;
  };
  return {
    layout() {
      for (const l of L) {
        const { w, h } = x;
        l.s.setAttribute('viewBox', `-2 -2 ${w + 4} ${h + 4}`); l.s.setAttribute('width', String(w + 4)); l.s.setAttribute('height', String(h + 4));
        l.s.style.left = l.s.style.top = '-2px'; l.p.setAttribute('d', cutLoop(w, h, 90 + l.k * 31 + x.uid));
      }
      targets(); if (!laid) snap(all); laid = true; apply(); x.wake();
    },
    mode(m) { if (m === 'intro' && !RM()) { introAt = performance.now(); for (const l of L) { l.X.x = l.Y.x = l.R.x = 0; } B.Y.x = -6; } x.wake(); },
    move(p) { ptr = p; x.wake(); },
    up() { x.wake(); },
    tick(dt) {
      targets();
      if (wasPressed && !x.pressed) B.Q.v += 2.2;
      wasPressed = x.pressed;
      if (RM()) { snap(all); apply(); return false; }
      const m = runSprings(all, dt, .005); apply(); return m || introAt >= 0;
    },
  };
}

function beam(x: W): Fx {
  // @property is ignored inside shadow roots, so the angle is registered from script.
  try { (window.CSS as any).registerProperty?.({ name: '--kfx-a', syntax: '<angle>', inherits: false, initialValue: '0deg' }); } catch { /* already registered */ }
  const b = document.createElement('span');
  b.className = 'kfx-beam';
  b.setAttribute('aria-hidden', 'true');
  x.el.appendChild(b);
  return { layout() {} };
}

const MAKERS: Record<LauncherEffect, (x: W) => Fx> = { clay, paper, beam };
let UID = 0;

// The page behind the launcher, so paper and shadows suit a light or a dark shop.
function pageSurface(): [string, boolean] {
  for (const e of [document.body, document.documentElement]) {
    const c = e && getComputedStyle(e).backgroundColor, m = c && /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c);
    if (m && (m[4] === undefined || +m[4] > .5)) return [c, (.2126 * +m[1] + .7152 * +m[2] + .0722 * +m[3]) / 255 < .45];
  }
  return ['#fff', false];
}

const onAccent = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16), lum = (.2126 * (n >> 16) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255)) / 255;
  return lum > .6 ? '#1a140f' : '#fff';
};

/** Wraps the button and runs the effect; returns a cleanup. */
export function attachEffect(btn: HTMLButtonElement, kind: string, accent = '#ff6a33'): () => void {
  const make = MAKERS[kind as LauncherEffect];
  const parent = btn.parentNode;
  if (!make || !parent || typeof window === 'undefined') return () => {};
  styleFor(btn.getRootNode() as Document | ShadowRoot);
  const el = document.createElement('span');
  el.className = 'kfx ' + kind;
  el.style.setProperty('--kfx-accent', accent);
  el.style.setProperty('--kfx-on', onAccent(accent));
  const [surf, dark] = pageSurface();
  el.style.setProperty('--kfx-surf', surf);
  el.style.setProperty('--kfx-cast', dark ? 'rgba(0,0,0,.5)' : 'rgba(40,25,10,.16)');
  parent.insertBefore(el, btn);
  el.appendChild(btn);
  const x = { el, btn, w: 0, h: 0, mode: 'rest', pressed: false, vis: false, uid: ++UID } as W;
  x.wake = () => loop.wake(x);
  x.fx = make(x);
  const setMode = (m: string) => { if (x.mode !== m) { x.mode = m; x.fx.mode?.(m); x.wake(); } };
  const press = (on: boolean) => { if (x.pressed !== on) { x.pressed = on; if (!on) x.fx.up?.(); x.wake(); } };
  let tm = 0, played = false;
  const local = (e: PointerEvent): P => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const enter = () => { clearTimeout(tm); setMode('hover'); };
  const leave = () => { press(false); setMode('settle'); clearTimeout(tm); tm = window.setTimeout(() => setMode('rest'), 2600); };
  const near = (e: PointerEvent) => {
    if (!x.fx.move || !x.vis) return;
    const p = local(e);
    x.fx.move(p.x > -120 && p.y > -120 && p.x < x.w + 120 && p.y < x.h + 120 ? p : null);
  };
  const on: Array<[EventTarget, string, EventListener]> = [
    [btn, 'pointerenter', enter], [btn, 'pointerleave', () => { if (x.mode === 'hover') leave(); }],
    [btn, 'pointerdown', () => press(true)], [btn, 'pointerup', () => press(false)], [btn, 'pointercancel', () => press(false)],
    [btn, 'focus', () => { if (btn.matches(':focus-visible')) enter(); }], [btn, 'blur', () => { if (x.mode === 'hover') leave(); }],
    [btn, 'keydown', ((e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') press(true); }) as EventListener], [btn, 'keyup', () => press(false)],
    [window, 'pointermove', near as EventListener],
  ];
  for (const [t, n, f] of on) t.addEventListener(n, f, { passive: true });
  const layout = () => {
    x.w = btn.offsetWidth; x.h = btn.offsetHeight;
    if (!x.w) return;
    el.style.width = x.w + 'px'; el.style.height = x.h + 'px';
    x.fx.layout();
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  ro?.observe(btn);
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => {
    for (const e of es) {
      x.vis = e.isIntersecting;
      el.classList.toggle('off', !x.vis);
      if (x.vis && !played) { played = true; x.fx.mode?.('intro'); }
      x.wake();
    }
  }) : null;
  if (io) io.observe(el); else { x.vis = true; x.fx.mode?.('intro'); }
  layout();
  return () => {
    for (const [t, n, f] of on) t.removeEventListener(n, f);
    ro?.disconnect(); io?.disconnect(); clearTimeout(tm);
    loop.on.delete(x);
    btn.style.transform = '';
    if (el.parentNode) { el.parentNode.insertBefore(btn, el); el.remove(); }
  };
}
