import React, { useEffect, useRef } from 'react';

export type KikuState = 'idle' | 'thinking' | 'visualizing' | 'speaking' | 'failed' | 'curious' | 'welcoming' | 'guiding' | 'happy' | 'focused';

type Shape = { bw: number; bh: number; tr: number; br: number; bow: number };
type Mood = { lid: number; warm: number; breath: number; wob: number };

const BODY: Record<string, Shape> = {
  idle:        { bw: 50, bh: 60, tr: 1,   br: 0.42, bow: 3 },
  thinking:    { bw: 46, bh: 46, tr: 1,   br: 1,    bow: 2 },
  visualizing: { bw: 64, bh: 42, tr: 0.42,br: 0.42, bow: 2 },
  speaking:    { bw: 44, bh: 54, tr: 0.9, br: 0.9,  bow: 3 },
  failed:      { bw: 53, bh: 45, tr: 0.95,br: 0.55, bow: 4 },
  curious:     { bw: 48, bh: 52, tr: 0.9, br: 0.7,  bow: 3 },
  welcoming:   { bw: 50, bh: 58, tr: 1,   br: 0.5,  bow: 2 },
  guiding:     { bw: 46, bh: 50, tr: 0.8, br: 0.8,  bow: 2 },
  happy:       { bw: 52, bh: 56, tr: 1,   br: 0.4,  bow: 4 },
  focused:     { bw: 48, bh: 52, tr: 0.9, br: 0.7,  bow: 2 },
};

const MOOD: Record<string, Mood> = {
  idle:        { lid: 1,    warm: 0,    breath: 2100, wob: 1 },
  thinking:    { lid: 1,    warm: 0.2,  breath: 1700, wob: 1.6 },
  visualizing: { lid: 1,    warm: 0.9,  breath: 1200, wob: 2.2 },
  speaking:    { lid: 1,    warm: 0.35, breath: 900,  wob: 1.8 },
  failed:      { lid: 0.28, warm: 0,    breath: 3000, wob: 0.6 },
  curious:     { lid: 1,    warm: 0.15, breath: 1800, wob: 1.4 },
  welcoming:   { lid: 1,    warm: 0.25, breath: 1600, wob: 1.2 },
  guiding:     { lid: 1,    warm: 0.2,  breath: 1500, wob: 1.3 },
  happy:       { lid: 1,    warm: 0.4,  breath: 1200, wob: 1.5 },
  focused:     { lid: 1,    warm: 0.2,  breath: 1500, wob: 1.2 },
};

const HOP: [number, number, number][] = [
  [0,    0,     0],
  [0.09, 0.54,  0],   // crouch — the wind-up sells the height that follows
  [0.19, -0.36, 32],  // launch, stretched thin
  [0.31, -0.22, 58],
  [0.42, -0.12, 68],  // apex, and a beat of hang time
  [0.54, 0.04,  28],
  [0.63, 0.96,  0],   // impact: flat as it gets
  [0.71, 0.18,  0],
  [0.79, -0.16, 20],  // rebound — smaller, faster, the Duolingo tell
  [0.88, 0.34,  0],
  [0.95, -0.05, 4],
  [1,    0,     0],
];

function hopAt(f: number): [number, number] {
  let i = 1;
  while (i < HOP.length - 1 && HOP[i][0] < f) i++;
  const [t0, s0, l0] = HOP[i - 1];
  const [t1, s1, l1] = HOP[i];
  const u = t1 === t0 ? 0 : (f - t0) / (t1 - t0);
  const e = u * u * (3 - 2 * u);
  return [s0 + (s1 - s0) * e, l0 + (l1 - l0) * e];
}

const SLOTS = 6;
const KEYS = ['bw', 'bh', 'tr', 'br', 'bow', 'lid', 'warm', 'wob', 'gx', 'gy'] as const;
type Key = typeof KEYS[number];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function side(x: number, y0: number, y1: number, bow: number) {
  const f = (n: number) => n.toFixed(2);
  const ym = (y0 + y1) / 2;
  const xb = x + bow;
  const a = (ym - y0) * 0.55;
  const b = (y1 - ym) * 0.55;
  return (
    `C${f(x)} ${f(y0 + a)} ${f(xb)} ${f(ym - a)} ${f(xb)} ${f(ym)}` +
    `C${f(xb)} ${f(ym + b)} ${f(x)} ${f(y1 - b)} ${f(x)} ${f(y1)}`
  );
}

function bodyPath(bw: number, bh: number, tr: number, br: number, bow: number) {
  const rt = clamp(bw * tr, 8, bh * 0.96);
  const rb = clamp(bw * br, 8, bh * 0.96);
  const p = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const k = 0.46; // continuous corners, never a quarter circle
  const ft = clamp((bw - rt) / bw, 0, 1);
  const fb = clamp((bw - rb) / bw, 0, 1);
  return (
    `M${p(-bw, -bh + rt)}` +
    `C${p(-bw, -bh + rt * k)} ${p(-bw + rt * k, -bh)} ${p(-bw + rt, -bh)}` +
    `C${p(-bw * 0.3 * ft, -bh - 2 * ft)} ${p(bw * 0.3 * ft, -bh - 2 * ft)} ${p(bw - rt, -bh)}` +
    `C${p(bw - rt * k, -bh)} ${p(bw, -bh + rt * k)} ${p(bw, -bh + rt)}` +
    side(bw, -bh + rt, bh - rb, bow) +
    `C${p(bw, bh - rb * k)} ${p(bw - rb * k, bh)} ${p(bw - rb, bh)}` +
    `C${p(bw * 0.3 * fb, bh + 2 * fb)} ${p(-bw * 0.3 * fb, bh + 2 * fb)} ${p(-bw + rb, bh)}` +
    `C${p(-bw + rb * k, bh)} ${p(-bw, bh - rb * k)} ${p(-bw, bh - rb)}` +
    side(-bw, bh - rb, -bh + rt, -bow) +
    'Z'
  );
}

const NEUTRALS = [
  { name: 'Graphite',  color: '#4B5058', light: '#A8AEB6', glow: 'rgba(75, 80, 88, 0.26)' },
  { name: 'Mist',      color: '#78868F', light: '#BFC9CF', glow: 'rgba(120, 134, 143, 0.26)' },
  { name: 'Sandstone', color: '#8A7E71', light: '#CBC1B5', glow: 'rgba(138, 126, 113, 0.26)' },
  { name: 'Pewter',    color: '#5F6670', light: '#B3BAC3', glow: 'rgba(95, 102, 112, 0.26)' },
];

const POPS = [
  { name: 'Aegean',   color: '#2E6FB7', light: '#9CC1E6', glow: 'rgba(46, 111, 183, 0.30)' },
  { name: 'Fern',     color: '#3C8C60', light: '#A2CFB4', glow: 'rgba(60, 140, 96, 0.30)' },
  { name: 'Marigold', color: '#C48A22', light: '#EBD095', glow: 'rgba(196, 138, 34, 0.30)' },
  { name: 'Coral',    color: '#C15A4E', light: '#E9AEA3', glow: 'rgba(193, 90, 78, 0.30)' },
  { name: 'Iris',     color: '#5F5CC4', light: '#B6B4E8', glow: 'rgba(95, 92, 196, 0.30)' },
];

export const RARE_SHADES = [...NEUTRALS, ...POPS];

function pickShade(current: typeof RARE_SHADES[number]) {
  const wasPop = POPS.includes(current as any);
  const pool = !wasPop && Math.random() < 0.26 ? POPS : NEUTRALS;
  const options = pool.filter(s => s !== current);
  return options[Math.floor(Math.random() * options.length)];
}

type RGB = [number, number, number];

function toRGB(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbCSS(c: RGB) {
  return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
}

function mix(base: RGB, tint: RGB, amount: number): RGB {
  return [
    base[0] + (tint[0] - base[0]) * amount,
    base[1] + (tint[1] - base[1]) * amount,
    base[2] + (tint[2] - base[2]) * amount,
  ];
}

const MARBLE_PAPER: RGB[] = [
  [255, 253, 248],
  [247, 240, 231],
  [231, 218, 202],
  [198, 178, 156],
];
const MARBLE_TINT = [0.05, 0.15, 0.42, 0.74];
const MARBLE_FLOOD = [0.52, 0.72, 0.9, 1];

const ALERT_SHADE = { color: '#E2581D', light: '#FFBE96', glow: 'rgba(226, 88, 29, 0.34)' };

export interface KikuAvatarProps {
  state?: KikuState;
  size?: number;
  alert?: boolean;
  theme?: string;
  feminine?: boolean;
  accessories?: {
    flower?: boolean;
    eyelashes?: boolean;
    blush?: boolean;
  };
  onImpact?: (splat: number, color: string, glow: string) => void;
  triggerRef?: React.MutableRefObject<(() => void) | undefined>;
}

export function KikuAvatar({
  state = 'idle',
  size = 40,
  alert = false,
  theme,
  feminine,
  accessories,
  onImpact,
  triggerRef,
}: KikuAvatarProps) {
  const stateRef = useRef<KikuState>(state);
  stateRef.current = state;
  const alertRef = useRef(alert);
  alertRef.current = alert;

  const isFeminine = theme === 'blush' || feminine === true || Boolean(accessories?.flower || accessories?.eyelashes || accessories?.blush);
  const showFlower = accessories?.flower ?? isFeminine;
  const showLashes = accessories?.eyelashes ?? isFeminine;
  const showBlush = accessories?.blush ?? isFeminine;

  const bodyRef = useRef<SVGPathElement>(null);
  const maskRef = useRef<SVGPathElement>(null);
  const figRef = useRef<SVGGElement>(null);
  const decorRef = useRef<SVGGElement>(null);
  const flowerGRef = useRef<SVGGElement>(null);
  const cheeksGRef = useRef<SVGGElement>(null);
  const lashesGRef = useRef<SVGGElement>(null);
  const lashLRef = useRef<SVGPathElement>(null);
  const lashRRef = useRef<SVGPathElement>(null);
  const warmRef = useRef<SVGRectElement>(null);
  const contactRef = useRef<SVGRectElement>(null);
  const stop1Ref = useRef<SVGStopElement>(null);
  const stop2Ref = useRef<SVGStopElement>(null);
  const stop3Ref = useRef<SVGStopElement>(null);
  const marbleRefs = useRef<(SVGStopElement | null)[]>([]);
  const slotRefs = useRef<(SVGRectElement | null)[]>([]);
  const slotGRef = useRef<SVGGElement>(null);
  const uid = useRef(`kiku-${Math.random().toString(36).slice(2, 8)}`).current;
  const onImpactRef = useRef(onImpact);
  onImpactRef.current = onImpact;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const at: Record<string, number> = {};
    const vel: Record<string, number> = {};
    KEYS.forEach(k => {
      at[k] = (BODY.idle as any)[k] ?? (MOOD.idle as any)[k] ?? 0;
      vel[k] = 0;
    });
    const slotAt = Array.from({ length: SLOTS }, () => ({ x: 0, y: 0, w: 0, h: 0, rx: 0, a: 0 }));
    const slotVel = Array.from({ length: SLOTS }, () => ({ x: 0, y: 0, w: 0, h: 0, rx: 0, a: 0 }));

    let blinkAt = 1800, blinkPhase = -1, wander = 0, wanderAt = 2600, raf = 0, gooOn = false;
    let hopDue = 9000 + Math.random() * 8000, hopPhase = -1;

    let lean = 0, leanVel = 0, leanWant = 0, leanAt = 4200;
    let peek = 0, peekVel = 0, peekWant = 0, peekAt = 12000;

    let shade = NEUTRALS[0];
    let deep: RGB = toRGB(shade.color);
    let pale: RGB = toRGB(shade.light);
    let deepWant: RGB = [...deep] as RGB;
    let paleWant: RGB = [...pale] as RGB;

    const DOUBLE_MS = 2600;
    let lastHopAt = -Infinity;
    let pendingEncore = false;
    let singlesSince = 0;
    let queuedHop = false;
    let now = 0;
    let puff = 0, puffVel = 0, wasAlert = false, nagDue = 0;

    const startHop = (t: number) => {
      if (t - lastHopAt < DOUBLE_MS) {
        shade = pickShade(shade);
        deepWant = toRGB(shade.color);
        paleWant = toRGB(shade.light);
        lastHopAt = -Infinity; // a third hop starts a fresh pair
      } else {
        lastHopAt = t;
      }
    };

    const layout = (t: number, lid: number, gx: number, gy: number) => {
      const phase = stateRef.current;
      const out = Array.from({ length: SLOTS }, () => ({ x: 0, y: 0, w: 0, h: 0, rx: 0, a: 0 }));
      const eye = (i: number, cx: number, dy = 0) => {
        const h = Math.max(4, 54 * Math.max(0.06, lid));
        out[i] = { x: cx + gx, y: -4 + gy + dy, w: 21, h, rx: 10.5, a: 1 };
      };
      if (phase === 'thinking') {
        const n = 4;
        const cycle = (t % 2800) / 2800;
        const fuse = Math.pow(Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5, 3); // 1 = gathered
        for (let i = 0; i < n; i++) {
          const a = t / 700 + (i / n) * Math.PI * 2;
          const R = (26 - (i % 2) * 5) * (1 - 0.94 * fuse); // uneven orbits, so it never reads as a spinner
          const s = 16 + fuse * 6 + Math.sin(t / 420 + i) * 1.4; // stay above the goo threshold when apart
          out[i] = { x: Math.cos(a) * R, y: Math.sin(a) * R * 0.86 + 2, w: s, h: s, rx: s / 2, a: 1 };
        }
      } else if (phase === 'visualizing') {
        out[0] = { x: 0, y: -2, w: 78, h: 26, rx: 13, a: 1 };
      } else if (phase === 'speaking') {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const h = 12 + Math.abs(Math.sin(t / 150 + i * 0.9)) * 26;
          out[i] = { x: (i - (n - 1) / 2) * 15, y: -2, w: 9, h, rx: 4.5, a: 1 };
        }
      } else if (phase === 'failed') {
        eye(0, -22, 8); eye(1, 22, 8);
      } else {
        eye(0, -22); eye(1, 22);
      }
      return out;
    };

    if (triggerRef) {
      triggerRef.current = () => {
        if (hopPhase >= 0) {
          queuedHop = true;
          shade = pickShade(shade);
          deepWant = toRGB(shade.color);
          paleWant = toRGB(shade.light);
          lastHopAt = -Infinity;
          return;
        }
        hopPhase = 0;
        startHop(now);
        hopDue = now + 4000;
      };
    }

    const frame = (t: number) => {
      now = t;
      const phase = stateRef.current;
      const shape = BODY[phase] ?? BODY.idle, mood = MOOD[phase] ?? MOOD.idle;
      const facing = phase === 'idle' || phase === 'failed';

      if (facing && !reduced) {
        if (t > wanderAt) { wander = (Math.random() - 0.5) * 2; wanderAt = t + 1800 + Math.random() * 3600; }
        (at as any).wantGx = wander * 5;
      }
      const puffWant = alertRef.current ? 1 : 0;
      puffVel = (puffVel + (puffWant - puff) * 0.1) * 0.88;
      puff += puffVel;
      const breath = alertRef.current && !reduced ? Math.sin(t / 480) * 0.055 * puff : 0;

      const want: Record<string, number> = {
        bw: shape.bw * (1 + puff * 0.34 + breath), bh: shape.bh * (1 + puff * 0.2 + breath),
        tr: shape.tr, br: shape.br, bow: shape.bow,
        warm: mood.warm, wob: mood.wob, lid: mood.lid,
        gx: facing && !reduced ? wander * 5 : 0,
        gy: facing && !reduced ? Math.sin(t / 2600) * 2 : 0,
      };

      if (!reduced && facing) {
        if (blinkPhase < 0 && t > blinkAt) blinkPhase = 0;
        if (blinkPhase >= 0) {
          blinkPhase += 1 / 7;
          want.lid = mood.lid * Math.abs(blinkPhase - 0.5) * 2;
          if (blinkPhase >= 1) {
            blinkPhase = -1;
            want.lid = mood.lid;
            blinkAt = t + (Math.random() < 0.22 ? 340 : 2600 + Math.random() * 4200);
          }
        }
      }

      KEYS.forEach(k => {
        const key = k as Key;
        if (reduced) { at[key] = want[key]; return; }
        const stiff = key === 'lid' ? 0.42 : 0.11;
        const damp = key === 'lid' ? 0.55 : 0.78;
        vel[key] = (vel[key] + (want[key] - at[key]) * stiff) * damp;
        at[key] += vel[key];
      });

      let squash = 0, lift = 0;
      if (!reduced && alertRef.current && hopPhase < 0 && t > nagDue) {
        hopPhase = 0;
        nagDue = t + 2100;
        hopDue = t + 4000;
      }
      if (!reduced && phase === 'idle') {
        if (hopPhase < 0 && t > hopDue) {
          hopPhase = 0;
          if (pendingEncore) {
            pendingEncore = false;
            singlesSince = 0;
            shade = pickShade(shade);
            deepWant = toRGB(shade.color);
            paleWant = toRGB(shade.light);
            lastHopAt = -Infinity;
          } else {
            singlesSince++;
            startHop(t);
          }
        }
      } else if (hopPhase < 0) {
        hopDue = t + 3000 + Math.random() * 3000;
      }

      if (hopPhase >= 0) {
        hopPhase += 1 / 96;
        [squash, lift] = hopAt(hopPhase);
        if (hopPhase >= 1) {
          hopPhase = -1; squash = 0; lift = 0;
          if (queuedHop) {
            queuedHop = false;
            singlesSince = 0;
            hopDue = t + 150;
          } else if (!pendingEncore && singlesSince >= 2) {
            pendingEncore = true;
            hopDue = t + 240;
          } else {
            hopDue = t + 5000 + Math.random() * 5000;
          }
        }
      }
      const splat = Math.max(0, squash);

      if (alertRef.current !== wasAlert) {
        wasAlert = alertRef.current;
        const to = alertRef.current ? ALERT_SHADE : shade;
        deepWant = toRGB(to.color);
        paleWant = toRGB(to.light);
        if (alertRef.current && !reduced) {
          if (hopPhase < 0) hopPhase = 0;
          nagDue = t + 2600;
        }
      }

      const currentShade = alertRef.current ? ALERT_SHADE : shade;

      if (!reduced) {
        for (let i = 0; i < 3; i++) {
          deep[i] += (deepWant[i] - deep[i]) * 0.055;
          pale[i] += (paleWant[i] - pale[i]) * 0.055;
        }
      } else {
        deep = [...deepWant] as RGB;
        pale = [...paleWant] as RGB;
      }
      const deepCSS = rgbCSS(deep), paleCSS = rgbCSS(pale);
      stop1Ref.current?.setAttribute('stop-color', deepCSS);
      stop2Ref.current?.setAttribute('stop-color', paleCSS);
      stop3Ref.current?.setAttribute('stop-color', paleCSS);

      for (let i = 0; i < 4; i++) {
        const amount = MARBLE_TINT[i] + (MARBLE_FLOOD[i] - MARBLE_TINT[i]) * puff;
        marbleRefs.current[i]?.style.setProperty(
          'stop-color',
          rgbCSS(mix(MARBLE_PAPER[i], deep, amount)),
        );
      }

      const baseWash = 0.34 + Math.sin(t / 1200) * 0.06;
      const contactOpacity = splat > 0.02 ? Math.min(0.72, baseWash + splat * 0.34) : baseWash;
      contactRef.current?.setAttribute('opacity', contactOpacity.toFixed(3));

      if (splat > 0.04) {
        onImpactRef.current?.(splat, currentShade.color, currentShade.glow);
      } else if (lastSplat > 0.04) {
        onImpactRef.current?.(0, currentShade.color, currentShade.glow);
      }
      lastSplat = splat;

      const wobble = reduced ? 0 : Math.sin(t / 1900) * 0.9 * at.wob;
      const bwF = at.bw * (1 + squash * 0.55) + wobble * 0.4;
      const bhF = at.bh * (1 - squash * 0.62);
      const d = bodyPath(
        bwF, bhF,
        clamp(at.tr + splat * 0.5, 0, 1.2),
        clamp(at.br + splat * 0.9, 0, 1),
        at.bow + wobble + splat * 5,
      );
      bodyRef.current?.setAttribute('d', d);
      maskRef.current?.setAttribute('d', d);

      const wantGoo = phase === 'thinking';
      if (wantGoo !== gooOn) {
        gooOn = wantGoo;
        slotGRef.current?.setAttribute('filter', wantGoo ? `url(#${uid}-goo)` : 'none');
      }

      const targets = layout(t, at.lid * (1 - splat * 0.85), at.gx, at.gy);
      for (let i = 0; i < SLOTS; i++) {
        const T = targets[i] as any, A = slotAt[i] as any, V = slotVel[i] as any;
        for (const k of ['x', 'y', 'w', 'h', 'rx', 'a']) {
          if (reduced) { A[k] = T[k]; continue; }
          V[k] = (V[k] + (T[k] - A[k]) * 0.16) * 0.74;
          A[k] += V[k];
        }
        const e = slotRefs.current[i];
        if (!e) continue;
        e.setAttribute('x', (A.x - A.w / 2).toFixed(2));
        e.setAttribute('y', (A.y - A.h / 2).toFixed(2));
        e.setAttribute('width', Math.max(0, A.w).toFixed(2));
        e.setAttribute('height', Math.max(0, A.h).toFixed(2));
        e.setAttribute('rx', Math.max(0, Math.min(A.rx, A.w / 2, A.h / 2)).toFixed(2));
        e.setAttribute('opacity', clamp(A.a, 0, 1).toFixed(2));
      }

      const breathe = reduced ? 0 : Math.sin(t / mood.breath) * 1.5;

      if (!reduced && facing && hopPhase < 0) {
        if (t > leanAt) {
          leanWant = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.65);
          leanAt = t + 2600 + Math.random() * 4200;
        }
        if (t > peekAt) {
          peekWant = peekWant > 0.1 ? 0 : 1;
          peekAt = t + (peekWant > 0.1 ? 900 : 9000 + Math.random() * 11000);
        }
      } else {
        leanWant = 0;
        peekWant = 0;
      }
      leanVel = (leanVel + (leanWant - lean) * 0.028) * 0.9;
      lean += leanVel;
      peekVel = (peekVel + (peekWant - peek) * 0.06) * 0.82;
      peek += peekVel;

      const planted = at.bh - bhF;
      const tilt = lean * 3.4 + peek * 4.5;
      const shift = lean * 2.2 + peek * 3;
      const dip = peek * 2.4;
      figRef.current?.setAttribute(
        'transform',
        `translate(${shift.toFixed(2)} ${(breathe + planted - lift + dip).toFixed(2)}) rotate(${tilt.toFixed(2)} 0 60)`,
      );

      if (decorRef.current) {
        decorRef.current.setAttribute(
          'transform',
          `translate(${shift.toFixed(2)} ${(breathe + planted - lift + dip).toFixed(2)}) rotate(${tilt.toFixed(2)} 0 60)`,
        );
      }

      if (showFlower && flowerGRef.current) {
        const flowerX = -bwF * 0.62;
        const flowerY = -bhF * 0.70;
        const flowerTilt = -16 + (reduced ? 0 : Math.sin(t / 1400) * 3) + tilt * 0.4;
        flowerGRef.current.setAttribute(
          'transform',
          `translate(${flowerX.toFixed(2)}, ${flowerY.toFixed(2)}) rotate(${flowerTilt.toFixed(2)})`
        );
      }

      if (showBlush && cheeksGRef.current) {
        const cheekY = 12 + at.gy * 0.5;
        cheeksGRef.current.setAttribute('transform', `translate(0, ${cheekY.toFixed(2)})`);
      }

      if (showLashes && lashesGRef.current) {
        const isEyeFacing = phase !== 'thinking' && phase !== 'visualizing' && phase !== 'speaking';
        lashesGRef.current.setAttribute('opacity', isEyeFacing ? clamp(at.lid * 1.3, 0, 1).toFixed(2) : '0');

        // rooted on each eye's own top-outer curve, so they track blinks and gaze
        // instead of floating at fixed coordinates
        const lashes = (A: { x: number; y: number; w: number; h: number }, side: number) => {
          const R = Math.max(1, Math.min(A.w, A.h) / 2);
          const cy = A.y - A.h / 2 + R;
          let d = '';
          for (const [deg, len] of [[20, 7], [48, 8], [76, 6.5]]) {
            const th = (deg * Math.PI) / 180;
            const sx = A.x + side * Math.sin(th) * R;
            const sy = cy - Math.cos(th) * R;
            const ex = A.x + side * Math.sin(th) * (R + len);
            const ey = cy - Math.cos(th) * (R + len) - 1.5;
            const cxp = A.x + side * Math.sin(th - 0.22) * (R + len * 0.65);
            const cyp = cy - Math.cos(th - 0.22) * (R + len * 0.65);
            d += ` M ${sx.toFixed(2)} ${sy.toFixed(2)} Q ${cxp.toFixed(2)} ${cyp.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
          }
          return d.trim();
        };
        lashLRef.current?.setAttribute('d', lashes(slotAt[0] as any, -1));
        lashRRef.current?.setAttribute('d', lashes(slotAt[1] as any, 1));
      }

      raf = requestAnimationFrame(frame);
    };

    let lastSplat = 0;

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [showFlower, showLashes, showBlush, isFeminine]);

  return (
    <svg className="hsk-kiku-avatar" width={size} height={size} viewBox="-100 -100 200 200" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${uid}-marble`} x1=".2" y1="0" x2=".42" y2="1">
          {[0, 40, 82, 100].map((offset, i) => (
            <stop
              key={offset}
              ref={el => { marbleRefs.current[i] = el; }}
              offset={`${offset}%`}
              style={{ stopColor: `var(--hsk-marble-${i + 1}, #FAF7F2)` }}
            />
          ))}
        </linearGradient>
        <linearGradient id={`${uid}-contact`} x1="0" y1="1" x2="0" y2="0">
          {}
          <stop ref={stop1Ref} offset="0%" stopColor={NEUTRALS[0].color} stopOpacity="0.9" />
          <stop ref={stop2Ref} offset="45%" stopColor={NEUTRALS[0].light} stopOpacity="0.5" />
          <stop ref={stop3Ref} offset="100%" stopColor={NEUTRALS[0].light} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-sheen`} cx=".34" cy=".2" r=".55">
          <stop offset="0%" stopColor="#FFFFFF" style={{ stopOpacity: 'var(--hsk-marble-sheen, .9)' }} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-hibiscus-petal`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#FF3366" />
          <stop offset="65%" stopColor="#FF758F" />
          <stop offset="100%" stopColor="#FFAAA6" />
        </linearGradient>
        <radialGradient id={`${uid}-blush-cheek`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FB7185" stopOpacity="0.48" />
          <stop offset="100%" stopColor="#FB7185" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-skin`}><use href={`#${uid}-body`} /></clipPath>
        <filter id={`${uid}-goo`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
          <feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
        </filter>
        <mask id={`${uid}-cut`}>
          <path ref={maskRef} d="" fill="#FFFFFF" />
          <g ref={slotGRef}>
            {Array.from({ length: SLOTS }, (_, i) => (
              <rect key={i} ref={el => { slotRefs.current[i] = el; }} fill="#000000" />
            ))}
          </g>
        </mask>
      </defs>
      
      {/* Base Body & Cutouts */}
      <g ref={figRef} mask={`url(#${uid}-cut)`}>
        <path id={`${uid}-body`} ref={bodyRef} d="" fill={`url(#${uid}-marble)`} />
        <g clipPath={`url(#${uid}-skin)`}>
          <ellipse cx="-14" cy="-40" rx="46" ry="34" fill={`url(#${uid}-sheen)`} />
          <rect ref={contactRef} x="-100" y="-20" width="200" height="100" fill={`url(#${uid}-contact)`} opacity="0.45" />
        </g>
      </g>

      {/* Feminine Blush Decor Overlay (syncs with figure transform) */}
      <g ref={decorRef} style={{ pointerEvents: 'none' }}>
        {/* Cheek Blush */}
        {showBlush && (
          <g ref={cheeksGRef}>
            <ellipse cx="-28" cy="0" rx="10" ry="5.5" fill={`url(#${uid}-blush-cheek)`} />
            <ellipse cx="28" cy="0" rx="10" ry="5.5" fill={`url(#${uid}-blush-cheek)`} />
          </g>
        )}

        {/* Fluttery Eyelashes */}
        {showLashes && (
          <g ref={lashesGRef}>
            <path ref={lashLRef} stroke="#3D1424" strokeWidth="1.7" strokeLinecap="round" fill="none" />
            <path ref={lashRRef} stroke="#3D1424" strokeWidth="1.7" strokeLinecap="round" fill="none" />
          </g>
        )}

        {/* Tropical Hawaiian Hibiscus Flower */}
        {showFlower && (
          <g ref={flowerGRef} className="hsk-avatar-flower">
            {/* Mint Green Leaf */}
            <path d="M 0 0 C -12 -7 -15 5 0 0 Z" fill="#10B981" transform="translate(6, 4) rotate(-35)" />
            {/* 5 Petals */}
            {[0, 72, 144, 216, 288].map(deg => (
              <path
                key={deg}
                d="M 0 0 C -6 -13 6 -13 0 0 Z"
                fill={`url(#${uid}-hibiscus-petal)`}
                stroke="#FF2A5F"
                strokeWidth="0.6"
                transform={`rotate(${deg - 18})`}
              />
            ))}
            {/* Curved Pistil / Stamen */}
            <path d="M 0 0 Q 3 -10 9 -14" stroke="#F59E0B" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            {/* Golden Yellow Pollen Grains */}
            <circle cx="9" cy="-14" r="1.3" fill="#FDE047" />
            <circle cx="7" cy="-12" r="1.1" fill="#FDE047" />
            <circle cx="6.5" cy="-15" r="1.1" fill="#FDE047" />
            {/* Crimson Center Hub */}
            <circle cx="0" cy="0" r="2.2" fill="#881337" />
          </g>
        )}
      </g>
    </svg>
  );
}

export default KikuAvatar;
