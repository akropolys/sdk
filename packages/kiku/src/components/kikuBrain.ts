// kiku's living avatar. A small behaviour brain picks the next micro-action by weight, on
// random timing, and holds; damped springs give every move anticipation, overshoot and
// settle. The frame loop runs only while something moves; otherwise it sleeps until the
// next scheduled event. Nothing here touches window at import time.

export type Pt = { x: number; y: number };
type Sp = { x: number; v: number; t: number; f: number; z: number; e: number; F: number };
type Pose = Record<string, any>;
type W = [string, number][];

const R = Math.random;
const rnd = (a: number, b: number) => a + R() * (b - a);
const rint = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const chance = (p: number) => R() < p;
const pm = () => (R() < .5 ? -1 : 1);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const f2 = (n: number) => '' + Math.round(n * 100) / 100;

// x'' = w²(t - x) - 2ζw x' + F
const sp = (x: number, f: number, z: number, e: number): Sp => ({ x, v: 0, t: x, f, z, e, F: 0 });
const isStill = (s: Sp) => Math.abs(s.v) < s.e * 8 && Math.abs(s.t - s.x) < s.e;

const C = 'hsk-kiku-';
const EYE = `<g class="${C}eye"><rect class="${C}open" x="-4" y="-6.5" width="8" height="13" rx="4"/><circle class="${C}glint" cx="-1.2" cy="-3" r="1.3"/><path class="${C}arc" d="M-5 2Q0 -5 5 2"/></g>`;
const petal = (d: string) => `<path d="M3 -24C${d} 3 -24Z"/>`;
const star = (x: number, y: number, r: number) => `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z"/>`;
const Z = '<text x="26" y="-28">z</text>';

// Inner markup of the <svg viewBox="-50 -50 100 100">; KikuAvatar renders the root.
export const KIKU_SVG = `<ellipse class="${C}shadow" cy="40" rx="25" ry="3.2"/><g class="${C}fig"><g class="${C}tuft">${petal('-4 -28 -9 -36 -6 -40C-2 -40 3 -33')}${petal('0 -31 0 -41 4 -45C8 -41 7 -31')}${petal('6 -32 12 -38 15 -37C16 -33 10 -27')}</g>`
  + `<path class="${C}body" d="M-36 20C-38 1 -29 -25 -1 -26C26 -27 37 -6 37 16C37 31 22 36 0 36C-22 36 -35 32 -36 20Z"/><path class="${C}shine" d="M-26 -3Q-24 -14 -13 -19"/><g class="${C}cheeks"><ellipse cx="-23" cy="13" rx="5.5" ry="3.2"/><ellipse cx="23" cy="13" rx="5.5" ry="3.2"/></g>`
  + `<g class="${C}face">${EYE}${EYE}<path class="${C}bu" d="M-18 -10Q-12 -14 -6 -10.5" opacity="0"/><path class="${C}bs" d="M-17 -6L-8 -10M8 -10L17 -6" opacity="0"/><ellipse class="${C}talk" rx="3.6" ry="3" opacity="0"/><path class="${C}smile" d="M-4.5 13Q0 16 4.5 13"/></g></g>`
  + `<g class="${C}think"><circle cx="30" cy="-30" r="2.2"/><circle cx="37" cy="-37" r="3"/><circle cx="45" cy="-45" r="3.8"/></g>`
  + `<g class="${C}spark">${star(-40, -24, 7)}${star(42, -16, 6)}${star(-30, -42, 5)}</g><g class="${C}zzz">${Z}${Z}${Z}</g>`;

const DEF: Pose = { x: 0, y: 0, rot: 0, s: 0, fx: 0, fy: 0, lid: 1, eL: 1, eR: 1, smile: .25, open: 0, happy: 0, cheeks: .6,
  bu: 0, bs: 0, th: 0, sp: 0, g: 0, follow: 1, gaze: { x: 0, y: .05 } };
const POSE: Record<string, Pose> = {
  idle: {},
  listening: { lid: .9, follow: 1.8, s: -.02, th: -6, smile: .15 },
  focused: { lid: .82, follow: 1.2, smile: .12, gaze: { x: 0, y: .8 } },
  thinking: { lid: .82, rot: -3, smile: 0, follow: .8, gaze: { x: -.7, y: -.8 } },
  speaking: { smile: .3, follow: .8 },
  happy: { smile: 1, happy: 1, cheeks: 1 },
  // The chat is empty: bright eyes on the visitor, a warm smile.
  welcoming: { smile: .7, cheeks: .9, eL: 1.05, eR: 1.05, th: -6, follow: 1.2 },
  // A photo waits in the box, or kiku asked something: head tilted, one brow up, looking at the box.
  curious: { rot: 9, eL: 1.16, eR: .94, bu: .9, smile: .1, th: -14, follow: .9, gaze: { x: .25, y: .55 } },
  // Products or sources are on screen: leans toward them and looks down at them.
  guiding: { x: 1.5, rot: 5, smile: .45, cheeks: .8, bu: .35, follow: .6, gaze: { x: .3, y: .85 } },
  // A picture is being made: eyes up and wide at it, a small "o" of wonder.
  visualizing: { eL: 1.1, eR: 1.1, open: .2, smile: .4, cheeks: .9, rot: -2, th: -10, follow: .5, gaze: { x: .6, y: -.75 } },
  failed: { s: -.08, th: 34, smile: -.5, bs: 1, cheeks: 0, lid: .62, fy: 3.5, gaze: { x: 0, y: .6 } },
  // A teammate has the conversation: kiku steps back and leans aside, calm and attentive,
  // watching the messages with a soft smile and nodding along. No second figure.
  handoff: { x: -3, rot: 5, s: -.03, lid: .88, smile: .55, cheeks: .8, th: -8, follow: .5, gaze: { x: .45, y: .6 } },
};
// Left alone while idle: 20 s unlocks a stretch, 40 s a yawn, 75 s drowsy, 110 s asleep.
const TIER_AT = [0, 20e3, 40e3, 75e3, 110e3];
const TIER_POSE: Pose[] = [{}, {}, {}, { lid: .55, fy: 1.5, smile: .1, follow: .5, th: 8 },
  { lid: .08, fy: 3, s: -.04, smile: .18, follow: 0, th: 14, gaze: { x: 0, y: .3 } }];
const BUSY = /thinking|speaking|visualizing|failed/;
// Resting states: the visitor's typing still turns kiku to listen.
const CALM = /idle|welcoming|curious|guiding/;

// Weighted pick that never repeats the last choice while another one is allowed.
export function pick(list: W, last: string, r = R()) {
  const l = list.length > 1 ? list.filter(c => c[0] !== last) : list;
  let s = 0;
  for (const c of l) s += c[1];
  r *= s;
  for (const c of l) if ((r -= c[1]) <= 0) return c[0];
  return l[l.length - 1]?.[0];
}

export type Kiku = ReturnType<typeof createKiku>;

export function createKiku(svg: SVGSVGElement, onImpact: (splat: number) => void, reduced: boolean, dropIn: boolean) {
  /* ---------- rig: the rendered kiku and its springs ---------- */
  const qa = (s: string) => Array.from(svg.querySelectorAll('.' + C + s)), q = (s: string) => qa(s)[0];
  const [fig, tuft, body, cheeks, face, bu, bs, talkEl, smile, shadow] = ['fig', 'tuft', 'body', 'cheeks', 'face', 'bu', 'bs', 'talk', 'smile', 'shadow'].map(q);
  const petals = qa('tuft path'), eyes = qa('eye'), opens = qa('open'), glints = qa('glint'), arcs = qa('arc');
  const S: Record<string, Sp> = {
    x: sp(0, 2.2, .55, .02), y: sp(0, 3, .5, .02), rot: sp(0, 1.8, .5, .06), s: sp(0, 4.2, .3, .0008),
    fx: sp(0, 3.2, .72, .02), fy: sp(0, 3.2, .72, .02), ex: sp(0, 9, .8, .02), ey: sp(0, 9, .8, .02),
    lid: sp(1, 7, .9, .003), eL: sp(1, 6, .42, .003), eR: sp(1, 6, .42, .003),
    smile: sp(.25, 5, .85, .003), open: sp(0, 13, .65, .003), happy: sp(0, 7, .9, .003), cheeks: sp(.6, 2.5, 1, .005),
    bu: sp(0, 6, .8, .005), bs: sp(0, 6, .8, .005), th: sp(0, 3.4, .26, .15), sp: sp(0, 3.8, .3, .15),
    p0: sp(0, 2.4, .3, .15), p1: sp(0, 2.9, .28, .15), p2: sp(0, 2.2, .32, .15), g: sp(0, 3.4, .42, .0008) };
  const springs = Object.values(S);
  const direct = ['s', 'lid', 'eL', 'eR', 'smile', 'open', 'happy', 'cheeks', 'bu', 'bs', 'th', 'sp', 'g'];
  let air = false, still = false, rect: DOMRect | null = null, pvx = 0, pvy = 0, prx = 0, pry = -24;
  // writes an attribute only when it changes; the last value rides on the element
  const put = (el: any, a: string, v: string) => { if (el['_' + a] !== v) el.setAttribute(a, el['_' + a] = v); };
  const cls = (c: string, on: boolean) => svg.classList.toggle(C + c, on);
  const oneShot = (c: string, calm?: boolean) => { if (calm || !reduced) { cls(c, false); void svg.getBoundingClientRect(); cls(c, true); } };

  // Breathing is a CSS animation on the svg, restarted at the end of each breath with a new depth, length and pause.
  const breathe = (e?: Event) => {
    if (e && e.target !== svg) return;
    const st = svg.style, slow = deep || tier > 2 && state === 'idle' || state === 'failed';   // deep, sleepy or sighing breaths
    st.setProperty('--bd', f2(rnd(.6, 1.4) * (slow ? .04 : state === 'idle' ? .02 : .013)));
    st.setProperty('--bt', rint(2800, 3800) * (slow ? 1.4 : BUSY.test(state) ? .8 : 1.1) + 'ms');
    st.setProperty('--bw', (chance(.25) ? rint(0, 800) : 0) + 'ms');
    st.animationName = 'none'; void svg.getBoundingClientRect(); st.animationName = '';
    deep = false;
  };
  svg.addEventListener('animationend', breathe);

  function update(dt: number, lm: number) {
    const gp = attnPt && state !== 'thinking' && tier < 4 ? attnPt : state === 'listening' ? caretPt : null;
    let g = P.gaze;
    if (gp) {
      rect ||= svg.getBoundingClientRect();
      const dx = gp.x - rect.left - rect.width / 2, dy = gp.y - rect.top - rect.height * .45, r = rect.width * .9;
      const m = Math.hypot(dx, dy, r);
      g = { x: dx / m, y: dy / m };
    }
    for (const k of direct) S[k].t = P[k];
    S.ex.t = g.x * 4.4; S.ey.t = g.y * 3.6;                                     // eyes lead
    S.fx.t = g.x * 2.6 * P.follow + P.fx; S.fy.t = g.y * 2.2 * P.follow + P.fy; // the face follows
    S.rot.t = P.rot + g.x * 3.5 * P.follow;                                    // the body turns last
    S.x.t = P.x + g.x * P.follow;
    if (!air) S.y.t = P.y;
    let moving = lm < 1;
    if (reduced) {                                                             // snap to poses, no physics
      air = false; still = true;
      for (const s of springs) { s.x = s.t; s.v = s.F = 0; }
      S.p0.x = S.p1.x = S.p2.x = S.th.x;
      render(lm);
      return moving;
    }
    const n = Math.ceil(dt / .008), h = dt / n;
    for (let i = 0; i < n; i++) {
      if (air) {
        S.y.v += 520 * h; S.y.x += S.y.v * h;                                  // gravity
        S.s.t = P.s + clamp(Math.abs(S.y.v) * .0011, 0, .16);                  // stretch along the arc
        if (S.y.x >= P.y && S.y.v > 0) {
          air = false; S.s.v -= S.y.v * .014; S.y.x = P.y; S.y.v = 0;
          onImpact(1); at(140, () => onImpact(0), 'free');
        }
      }
      S.p0.t = S.p1.t = S.p2.t = S.th.x;                                        // petals chase the tuft
      for (const s of springs) if (s !== S.y || !air) {
        const w = 6.2832 * s.f;
        s.v += (w * w * (s.t - s.x) - 2 * s.z * w * s.v + s.F) * h; s.x += s.v * h;
      }
    }
    // follow-through: the tuft root's acceleration pushes the tuft (it lags the body); vertical jolts splay the petals
    const sy = 1 + S.s.x, a = S.rot.x * Math.PI / 180;
    const rx = S.x.x + Math.sin(a) * 60 * sy, ry = S.y.x + 36 - 60 * sy * Math.cos(a), vx = (rx - prx) / dt, vy = (ry - pry) / dt;
    S.th.F = still ? 0 : -clamp((vx - pvx) / dt, -5e3, 5e3) * 2.2;
    S.sp.F = still ? 0 : -clamp((vy - pvy) / dt, -5e3, 5e3) * 1.1;
    prx = rx; pry = ry; pvx = still ? 0 : vx; pvy = still ? 0 : vy;
    moving ||= air || !springs.every(isStill);
    if (!moving && !still) for (const s of springs) { s.x = s.t; s.v = s.F = 0; }
    if (moving || !still) render(lm);
    still = !moving;
    return moving;
  }

  function render(lm: number) {
    const sy = 1 + S.s.x, sx = 1 / sy, g = 1 + S.g.x, x = S.x.x, o = Math.max(0, S.open.x);  // squash and stretch keep area
    const smear = 1 + clamp(Math.abs(S.ex.v) * .006, 0, .25), lid = Math.max(.08, S.lid.x * lm), hap = clamp(S.happy.x, 0, 1);
    const k = clamp(1 + S.y.x * .018, .45, 1);
    put(fig, 'transform', `translate(${f2(x)} ${f2(S.y.x + 36)})rotate(${f2(S.rot.x)})scale(${f2(sx * g)} ${f2(sy * g)})translate(0 -36)`);
    put(tuft, 'transform', `translate(3 -24)scale(${f2(sx ** -.6)} ${f2(sy ** -.6)})translate(-3 24)`);
    petals.forEach((p, i) => put(p, 'transform', `rotate(${f2(S['p' + i].x + (i - 1) * S.sp.x)} 3 -24)`));
    put(face, 'transform', `translate(${f2(S.fx.x)} ${f2(S.fy.x)})`);
    eyes.forEach((e, i) => {
      const es = i ? S.eR.x : S.eL.x;
      put(e, 'transform', `translate(${f2((i ? 12 : -12) + S.ex.x)} ${f2(2 + S.ey.x)})scale(${f2(es * smear)} ${f2(es * lid / smear)})`);
      put(opens[i], 'opacity', f2(1 - hap));
      put(glints[i], 'opacity', f2(lid > .4 ? (1 - hap) * .85 : 0));
      put(arcs[i], 'opacity', f2(hap));
    });
    put(talkEl, 'transform', `translate(0 ${f2(14.5 + o)})scale(${f2(.75 + o * .3)} ${f2(o * 1.15)})`);
    put(talkEl, 'opacity', o > .04 ? '1' : '0');
    put(smile, 'd', `M-4.5 13Q0 ${f2(13 + S.smile.x * 6)} 4.5 13`);
    put(smile, 'opacity', f2(clamp(1 - o * 4, 0, 1)));
    put(cheeks, 'opacity', f2(clamp(S.cheeks.x, 0, 1) * .85));
    put(bu, 'opacity', f2(clamp(S.bu.x, 0, 1)));
    put(bu, 'transform', `translate(0 ${f2(-S.bu.x * 1.5)})`);
    put(bs, 'opacity', f2(clamp(S.bs.x, 0, 1)));
    put(shadow, 'transform', `translate(${f2(x)} 40)scale(${f2(k)} 1)translate(0 -40)`);
    put(shadow, 'opacity', f2(.13 * k));
  }

  /* ---------- brain ---------- */
  type Ev = { t: number; fn: () => void; kind: string; ep: number };
  const Q: Ev[] = [], EP: Record<string, number> = { act: 0, state: 0, attn: 0, type: 0, blink: 0, free: 0, alert: 0 };
  let state = 'idle', want = 'idle', paused = false, dead = false, rectAt = 0, tier = 0, lastPoke = 0;
  let raf = 0, timer: ReturnType<typeof setTimeout> | undefined, last = 0, inFrame = false, wantFrame = false;
  let bl: number[] | null = null, attnRaw: Pt | null = null, attnPt: Pt | null = null, attnNext = 0, attnBlock = 0, caretPt: Pt | null = null;
  let held = 0, typed = 0, nodAt = rint(4, 8), lastAct = '', lastReact = '', focused = false, deep = false, forceNext: string[] = [];
  const used: Record<string, number> = {};
  const now = () => performance.now();
  const P: Pose = { ...DEF };

  // scheduler: each event carries the epoch of its kind; bumping an epoch cancels the whole kind
  function at(ms: number, fn: () => void, kind = 'act') { Q.push({ t: now() + ms, fn, kind, ep: EP[kind] }); Q.sort((a, b) => a.t - b.t); wake(); }
  // a timeline: .d(fn) runs fn after the waits so far, .w(ms) waits, .t is the length
  const T = () => { const o = { t: 0, w(ms: number) { o.t += ms; return o; }, d(fn: () => void) { at(o.t, fn); return o; } }; return o; };

  function wake() {
    if (inFrame) wantFrame = true;
    else if (!paused && !raf && !dead) { clearTimeout(timer); last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function frame(ts: number) {
    raf = 0; inFrame = true; wantFrame = false;
    const dt = clamp((ts - last) / 1e3, .001, .05), t = now();
    last = ts;
    while (Q.length && Q[0].t <= t) { const e = Q.shift()!; if (EP[e.kind] === e.ep) e.fn(); }
    if (attnRaw && t >= attnNext) { attnPt = attnRaw; attnNext = t + rnd(60, 170); }     // saccades, not smooth tracking
    const moving = update(dt, lidMul()) || wantFrame || attnPt !== attnRaw;
    inFrame = false;
    if (dead || paused) return;
    if (moving) raf = requestAnimationFrame(frame);
    else if (Q.length) timer = setTimeout(wake, Q[0].t - now());
  }

  const base = (): Pose => ({ ...DEF, ...POSE[state], ...(state === 'idle' ? TIER_POSE[tier] : {}), g: reduced ? 0 : held });
  const set = (o: Pose) => { Object.assign(P, o); wake(); };
  const rest = (...k: string[]) => { const b = base(); for (const x of k) P[x] = b[x]; wake(); };
  const K = (ch: string, v: number) => { if (!reduced) S[ch].v += v; wake(); };
  const J = (v: number) => { if (!reduced && !air) { air = true; S.y.v = v; } wake(); };
  function look(x: number, y: number, bp = .55) {
    if (Math.hypot(x - P.gaze.x, y - P.gaze.y) > .55 && chance(bp)) blink();  // blink on big gaze shifts
    set({ gaze: { x, y } });
  }

  // blinks: fast close, short hold, slower open; none while asleep
  function blink(dbl?: boolean) {
    if (bl || tier > 3 && state === 'idle') return;
    bl = [now(), rnd(45, 70), rnd(15, 45), rnd(90, 150)];
    if (dbl) at(bl[1] + bl[2] + bl[3] + rnd(50, 110), () => { bl = null; blink(); }, 'free');
    wake();
  }
  function lidMul() {
    if (!bl) return 1;
    const [t0, c, h, o] = bl, e = now() - t0;
    if (e < c) return 1 - .94 * (e / c) ** 2;
    if (e < c + h) return .06;
    if (e < c + h + o) return .06 + .94 * (1 - (1 - (e - c - h) / o) ** 2);
    bl = null;
    return 1;
  }
  function blinkLoop() {
    const g = state === 'thinking' ? 2e3 : /focused|listening|handoff/.test(state) ? 5e3 : 3.5e3;
    at(g * rnd(.6, chance(.15) ? 2.6 : 1.6), () => { blink(chance(.14)); blinkLoop(); }, 'blink');
  }

  /* ---------- micro-actions: each returns its length in ms ---------- */
  // hold a pose for a while, then let it go; or just look somewhere for a while
  const hold = (o: Pose, a: number, b: number) => T().d(() => set(o)).w(rnd(a, b)).d(() => rest(...Object.keys(o))).w(300).t;
  const gaze = (x: number, y: number, a: number, b: number, bp?: number) => T().d(() => look(x, y, bp)).w(rnd(a, b)).t;
  const hop = (v: number) => T().d(() => set({ s: -.14, y: 1.4 })).w(140).d(() => { rest('s', 'y'); J(-v); });
  const sway = (n: number, deg: number, gap: number, both?: (d: number) => void) => {                  // tips side to side
    const tl = T();
    for (let i = n, d = pm(); i--; d = -d) { const dd = d; tl.w(rnd(gap, gap * 1.4)).d(() => { set({ rot: dd * deg }); both?.(dd); }); }
    return tl.w(400).d(() => rest('rot'));
  };
  // [action, calm (still runs under reduced motion), cooldown ms]
  const A: Record<string, [() => number, number?, number?]> = {
    glance: [() => chance(.4) ? gaze(rnd(-.15, .15), .05, 500, 1500) : gaze(pm() * rnd(.3, 1), chance(.4) ? rnd(.5, .9) : rnd(-.6, .3), 500, 1900), 1],  // somewhere, or back to you
    blink2: [() => { blink(true); return 450; }, 1],
    twitch: [() => T().d(() => K('th', pm() * rnd(90, 170))).w(rnd(160, 260)).d(() => K('p' + rint(0, 2), pm() * rnd(60, 140))).w(400).t],
    shift: [() => {                                                              // a small wind-up the other way, then shifts its weight
      const d = pm();
      return T().d(() => set({ x: -d * .8, s: -.03 })).w(110).d(() => set({ x: d * rnd(1.8, 3.2), rot: d * rnd(2, 4), s: 0 }))
        .w(rnd(1200, 3500)).d(() => rest('x', 'rot')).w(500).t; }],
    bounce: [() => hop(75).w(700).t, 0, 15e3],
    hum: [() => { set({ happy: .8, smile: .7 }); return sway(rint(3, 4), 2, 330, d => K('th', d * 110)).d(() => rest('happy', 'smile')).w(300).t; }, 0, 12e3],  // content eyes, the tuft sways
    lookAround: [() => { const d = pm(); return T().d(() => look(d * .95, .1, .8)).w(rnd(600, 1000)).d(() => look(-d * .95, .05, .8)).w(rnd(700, 1200)).d(() => look(0, .05)).w(300).t; }, 1, 8e3],
    stretch: [() => {                                                            // crouch, reach up, tremble, release
      const tl = T().d(() => set({ s: -.13, y: 1.5, happy: 1 })).w(260).d(() => set({ s: .2, y: -2.5, sp: 14, th: -4 })).w(200);
      for (const v of [25, -25, 25]) tl.w(140).d(() => K('rot', v));
      return tl.w(500).d(() => rest('s', 'y', 'sp', 'th', 'happy')).w(300).d(() => blink()).w(500).t; }, 0, 25e3],
    yawn: [() => T().d(() => set({ lid: .55, rot: -3 })).w(220).d(() => set({ open: .45 })).w(380)
      .d(() => { set({ open: 1.25, s: .08, lid: .2, fy: -1 }); deep = true; }).w(rnd(650, 950))
      .d(() => set({ open: 0 })).w(170).d(() => { rest('lid', 'rot', 's', 'fy'); K('s', 1.1); }).w(260).d(() => blink(true)).w(500).t, 0, 35e3],
    nodOff: [() => T().d(() => set({ lid: .2, fy: 3.2, rot: pm() * 2.5, follow: 0 })).w(rnd(1300, 2100))   // head sinks, then jerks back awake
      .d(() => { rest('lid', 'fy', 'rot', 'follow'); K('s', 1.4); K('th', 150); blink(); }).w(900).t],
    slowBlink: [() => hold({ lid: .08 }, 350, 650), 1],
    smack: [() => T().d(() => set({ open: .22 })).w(120).d(() => set({ open: 0 })).w(140).d(() => set({ open: .18 })).w(110).d(() => rest('open')).w(300).t, 1],
    dream: [() => hold({ smile: .7, cheeks: 1 }, 1500, 2600), 1],
    droop: [() => { K('th', rnd(40, 70)); return 600; }],
    ponder: [() => gaze(-Math.sign(P.gaze.x || 1) * rnd(.5, .8), rnd(-.9, -.6), 700, 1600, .4), 1],
    hmm: [() => hold({ lid: .6, rot: pm() * 4, smile: -.1 }, 600, 1200)],
    tap: [() => T().d(() => K('s', -.5)).w(190).d(() => K('s', -.45)).w(400).t],
    checkIn: [() => { const g = P.gaze; return T().d(() => look(0, .05, .3)).w(rnd(350, 600)).d(() => look(g.x, g.y, .3)).w(300).t; }, 1],
    lookUser: [() => gaze(rnd(-.1, .1), rnd(0, .1), 900, 2e3), 1],
    lookMsg: [() => gaze(rnd(-.4, .45), rnd(.55, .75), 700, 1500), 1],
    brow: [() => hold({ bu: .8, eL: 1.12 }, 350, 600)],
    emph: [() => T().d(() => { set({ rot: pm() * 3 }); K('s', .6); }).w(rnd(400, 800)).d(() => rest('rot')).w(200).t],
    nod: [() => T().d(() => { K('rot', 18); K('s', -.5); }).w(400).t],
    waitUp: [() => hold({ gaze: { x: 0, y: .1 } }, 1200, 2500), 1],
    sparkle: [() => { oneShot('sparkgo'); return 900; }],
    sigh: [() => { deep = true; return T().d(() => set({ s: .03, lid: .45 })).w(700).d(() => { set({ s: -.12 }); K('th', 60); }).w(900).d(() => rest('s', 'lid')).w(400).t; }],
    tilt: [() => hold({ rot: -P.rot, eL: P.eR, eR: P.eL }, 900, 1700)],          // curious: tips its head the other way
    // reactions to the visitor
    perk: [() => T().d(() => { K('s', 1.3); K('th', -140); set({ eL: 1.15, eR: 1.15, smile: .6 }); }).w(450).d(() => rest('eL', 'eR', 'smile')).w(300).t],
    giggle: [() => { set({ happy: 1, smile: 1, cheeks: 1 }); return sway(4, 3, 110, d => K('rot', d * 30)).w(200).d(() => rest('happy', 'smile', 'cheeks')).w(300).t; }],
    shy: [() => {                                                                // looks away blushing, then peeks back
      const away = pm(); attnBlock = now() + 1300;
      return T().d(() => { look(away * .9, .3, 0); set({ cheeks: 1, happy: .5 }); }).w(rnd(600, 900))
        .d(() => { look(away * .3, .1, 0); rest('happy'); }).w(400).d(() => rest('cheeks')).w(300).t; }],
    hophi: [() => hop(85).w(700).t],
    boop: [() => T().d(() => { K('s', -3); K('th', pm() * 180); set({ happy: 1, open: .35 }); }).w(420).d(() => rest('happy', 'open')).w(500).t],
    // one-shots from the chat; they play over any state and hand back to it
    happy: [() => T().d(() => { set({ happy: 1, smile: .9, cheeks: 1 }); K('s', 1.1); K('th', -120); })            // a small glad lift, like a haptic tap
      .w(rnd(650, 850)).d(() => rest('happy', 'smile', 'cheeks')).w(300).t, 1],
    oh: [() => T().d(() => { set({ eL: 1.08, eR: 1.08, open: .22, gaze: { x: 0, y: .05 } }); K('s', .5); })         // the visitor stopped it: a quiet "oh", then an exhale
      .w(200).d(() => { set({ open: 0, s: -.05, lid: .7, smile: .1 }); deep = true; }).w(800).d(() => rest('eL', 'eR', 'open', 's', 'lid', 'smile', 'gaze')).w(300).t, 1],
  };
  const ACTS: Record<string, W> = {
    idle0: [['glance', 5], ['blink2', 1.2], ['twitch', 2], ['shift', 1.5], ['bounce', .5], ['hum', .7], ['lookAround', 1]],
    idle3: [['nodOff', 3], ['slowBlink', 2], ['yawn', 1], ['glance', .6]],
    idle4: [['smack', 1], ['dream', 1.2], ['droop', 1]],
    listening: [['nod', 2], ['blink2', .6], ['twitch', 1]],
    focused: [['slowBlink', 1], ['waitUp', 1.5], ['glance', .8], ['twitch', .6]],
    thinking: [['ponder', 3], ['hmm', 2], ['tap', 1.5], ['checkIn', .8], ['twitch', 1]],
    speaking: [['lookUser', 3], ['lookMsg', 2], ['brow', 1], ['emph', 1.3]],
    handoff: [['lookMsg', 2], ['nod', 1.6], ['lookUser', 1], ['blink2', .6], ['slowBlink', .5]],
    welcoming: [['lookUser', 2], ['glance', 1], ['blink2', .6], ['hum', .4]],
    curious: [['tilt', 2], ['blink2', 1], ['checkIn', 1], ['twitch', .6]],
    guiding: [['lookMsg', 2], ['checkIn', 1.5], ['nod', 1], ['blink2', .5]],
    visualizing: [['sparkle', .6], ['brow', 1], ['blink2', 1], ['slowBlink', .6]],
    failed: [['slowBlink', 1.2], ['lookUser', 1], ['sigh', .5]],
  };
  ACTS.happy = ACTS.welcoming;
  const GAP: Record<string, number[]> = { idle: [900, 3400], focused: [2e3, 5e3], thinking: [450, 1300], speaking: [600, 1800], handoff: [1800, 3500],
    failed: [3e3, 6e3], welcoming: [1500, 3500], curious: [1400, 3e3], guiding: [1500, 3e3], visualizing: [1800, 3500] };

  function pickNext() {
    // the idle clock: only while idle, and any sign of the visitor resets it
    if (state === 'idle') {
      let t = 0;
      for (let i = 1; i < 5; i++) if (now() - lastPoke >= TIER_AT[i]) t = i;
      if (t !== tier) {
        if (t > tier && t < 3) forceNext.push(t > 1 ? 'yawn' : 'stretch');
        tier = t; cls('asleep', t > 3);
        if (t > 2) Object.assign(P, base());
      }
    }
    const list = (state === 'idle' ? ACTS['idle' + (tier > 2 ? tier : 0)].concat(tier && tier < 3 ? [['stretch', 1.6], ['yawn', (tier - 1) * 1.4]] : [])
      : ACTS[state] || ACTS.idle0).filter(([n, w]) => w > 0 && (!reduced || A[n][1]) && !(now() - (used[n] ?? -1e9) < (A[n][2] || 0)));
    const f = forceNext.shift(), n = f && list.some(c => c[0] === f) ? f : pick(list, lastAct);
    n ? perform(n) : schedule(0);
  }
  function perform(n: string) {
    used[n] = now(); lastAct = n;
    schedule(A[n][0]());
  }
  function schedule(ms: number) {
    const g = GAP[state] || [1e3, 3e3];
    at(ms + (state === 'idle' && tier > 3 ? rnd(3e3, 7e3) : rnd(g[0], g[1]) * (chance(.15) ? 2.2 : 1)), pickNext);  // the occasional long hold
  }

  /* ---------- states ---------- */
  function setState(s: string) {
    const prev = state;
    if (!POSE[s] || s === prev) return;
    EP.state++; EP.act++; EP.type++;
    state = s; svg.dataset.state = s;
    if (s !== 'idle') { tier = 0; cls('asleep', false); }
    let entry = 120;
    const go = (o: Pose = {}) => set({ ...base(), ...o });
    const st = (ms: number, fn: () => void) => at(ms, fn, 'state');
    if (s === 'thinking') {
      go({ gaze: { x: 0, y: .5 } });                                            // anticipation: the eyes dip first
      st(130, () => { look(-.7, -.8, 0); K('th', -140); }); entry = 600;
      let d = 1;
      const boil = () => {                                                       // the outline boils, the tuft twirls now and then
        if (!reduced) put(body, 'transform', `rotate(${f2(rnd(-1.5, 1.5))})scale(${f2(rnd(.985, 1.015))} 1)`);
        if (chance(.1)) K('th', (d = -d) * rnd(90, 150));
        st(rnd(110, 170), boil);
      };
      boil();
    } else {
      put(body, 'transform', '');
      if (prev === 'thinking' && s === 'speaking') {                             // "aha": eyes widen, a brow lifts, the tuft perks (the swell is the chat's notice)
        go({ eL: 1.18, eR: 1.18, bu: .7, gaze: { x: 0, y: .05 } }); K('th', 150); st(240, () => rest('eL', 'eR', 'bu')); entry = 900;
      } else if (prev === 'speaking') {                                          // wraps up: a nod, a smile held for a beat
        go({ smile: .55 }); K('rot', 20); st(1200, () => rest('smile')); entry = 1400;
      } else if (s === 'failed') {                                               // "oh": a still beat looking at you, then a quiet slump
        go({ s: 0, th: 0, smile: 0, bs: 0, cheeks: .6, lid: 1, fy: 0, eL: 1.08, eR: 1.08, open: .2, gaze: { x: 0, y: 0 } });
        st(260, () => go()); deep = true; entry = 2e3;
      } else go(s === 'idle' ? { gaze: P.gaze } : {});
      if (s === 'speaking') st(entry === 900 ? 220 : 60, talk);
      else if (s === 'listening') { K('s', .8); st(90, () => K('th', -120)); }
      else if (s === 'handoff') { set({ x: 1, rot: -2 }); st(140, () => rest('x', 'rot')); st(950, () => { look(.45, .6, 0); K('rot', 24); K('s', -.4); }); entry = 1600; }
      else if (s === 'welcoming' || s === 'happy') { set({ happy: 1 }); K('s', 1); K('th', -130); st(650, () => rest('happy')); entry = 1400; }   // a glad "hi"
      else if (s === 'curious') { K('rot', -40); K('th', -160); entry = 900; }   // the head tips over, the tuft perks
      else if (s === 'guiding') { st(160, () => { K('rot', 22); K('s', -.4); }); entry = 1200; }   // a nod toward what is on screen
      else if (s === 'visualizing') { K('s', .9); st(300, () => oneShot('sparkgo')); entry = 1400; }
      blink();
    }
    EP.blink++; blinkLoop();
    schedule(entry);
  }

  // talking: one syllable at a time; stressed beats bob the body, the odd pause; runs until the state changes
  function talk() {
    const stress = chance(.22), d = rnd(80, 150), end = chance(.05);
    set({ open: rnd(.4, 1) * (stress ? 1.15 : 1) });
    if (stress) K('s', .35);
    at(d, () => set({ open: end ? 0 : rnd(0, .12) }), 'state');
    at(d + (end ? rnd(300, 550) : rnd(30, 120)), talk, 'state');
  }

  /* ---------- reactions ---------- */
  // Any sign of the visitor resets the idle clock; a dozing kiku wakes, and that is its whole reaction.
  function poke() {
    lastPoke = now();
    const was = tier;
    tier = 0;
    if (state !== 'idle' || was < 3) return false;
    forceNext = []; Object.assign(P, base()); cls('asleep', false); EP.act++;
    if (was > 3) {                                                              // wakes with a start: eyes wide, a little jump
      set({ eL: 1.3, eR: 1.3, bu: .9 }); K('s', 2.2); K('th', 200); K('sp', 120); J(-60);
      at(600, () => rest('eL', 'eR', 'bu'));
    } else K('s', .9);
    blink(true);
    schedule(1e3);
    return true;
  }
  // "Something is up": a breath in, a swell outward and a settle, all on one spring, with a glow on the name pill.
  // Under reduced motion only the glow plays. A second call while one is running is the same swell.
  let swellAt = -1e4;
  function swell() {
    const t = now();
    if (t - swellAt < 700) return;
    swellAt = t;
    oneShot('swellgo', true);
    if (reduced) return;
    P.g = -.035; wake();
    at(90, () => { P.g = .1; wake(); }, 'free');
    at(330, () => { P.g = base().g; K('s', -.7); }, 'free');
  }
  function react(kind: string) {
    const woke = poke();
    if (kind === 'swell') return swell();
    const cue = kind === 'happy' || kind === 'oh';
    if (woke && !cue) return;
    if (BUSY.test(state) && !cue) { if (kind === 'boop') K('s', -1.5); return; }   // busy: only a small beat
    if (reduced && !A[kind]?.[1]) { set({ smile: .6 }); at(800, () => rest('smile'), 'free'); return; }
    EP.act++;
    perform(kind === 'hover' ? lastReact = pick([['perk', 3], ['giggle', 2], ['shy', 1.4], ['hophi', .8]], lastReact) : kind);
  }

  /* ---------- public ---------- */
  lastPoke = now();
  if (dropIn && !reduced) { P.y = S.y.x = S.y.t = -40; at(170, () => { air = true; P.y = 0; }, 'free'); }  // hangs above its spot, drops once the chat has opened past it
  svg.dataset.state = state;
  cls('reduced', reduced);
  breathe(); blinkLoop(); schedule(0);

  return {
    get tier() { return tier; },
    get act() { return lastAct; },
    /** The state the chat asks for; while it is idle, the visitor's typing can still turn kiku to listening or focused. */
    setBase(s: string) { want = s; setState(s === 'idle' && focused ? 'focused' : s); },
    typed(pt: Pt) {
      poke(); caretPt = pt;
      if (CALM.test(want)) setState('listening');
      if (++typed >= nodAt) { typed = 0; nodAt = rint(4, 9); K('rot', 14); K('s', -.4); }
      EP.type++;
      at(1400, () => { if (state === 'listening') { caretPt = null; look(0, .1); set({ smile: .35 }); } }, 'type');  // the visitor paused: looks up at them
    },
    focus(on: boolean) {
      focused = on; poke();
      if (!on) caretPt = null;
      if (CALM.test(want) && !(on && state === 'listening')) setState(on && want === 'idle' ? 'focused' : want);
    },
    react,
    /** The cursor moved; kiku watches it while it is near, and grows curious if it lingers. */
    attend(pt: Pt) {
      const t = now();
      if (t - rectAt > 500) { rect = svg.getBoundingClientRect(); rectAt = t; }
      const r = rect!, near = Math.hypot(pt.x - r.left - r.width / 2, pt.y - r.top - r.height / 2) < Math.max(140, r.width * 1.9);
      if (near && !attnRaw) {
        poke(); EP.attn++;
        at(2600, () => { if (attnRaw && state === 'idle') { const d = pm(); set({ rot: d * 7, eL: 1.15 }); at(1100, () => rest('rot', 'eL'), 'attn'); } }, 'attn');
      }
      if (!near && attnRaw) { EP.attn++; rest('rot', 'eL'); }
      attnRaw = near ? pt : attnPt = null;
      wake();
    },
    /** Unread below: kiku swells and stays a little swollen, glowing, until the visitor catches up; then it lets the breath out. */
    setAlert(on: boolean) {
      if (on === !!held) return;
      held = on ? .07 : 0;
      cls('swollen', on);
      if (on) { swellAt = -1e4; swell(); }
      else if (!reduced) { P.g = 0; K('s', -.5); deep = true; wake(); }
    },
    setReduced(v: boolean) { reduced = v; cls('reduced', v); wake(); },
    pause(h: boolean) {
      paused = h;
      if (h) { cancelAnimationFrame(raf); raf = 0; clearTimeout(timer); } else wake();
    },
    destroy() { dead = true; cancelAnimationFrame(raf); clearTimeout(timer); Q.length = 0; svg.removeEventListener('animationend', breathe); },
  };
}
