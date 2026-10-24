import React from 'react';
import { thumpDoodles } from '../KikuDoodles';

export type ClayPhase = 'enter' | 'steady' | 'exit';

const FRAME_MS = 83;
const HOLD = 2;
const W = 240;
const H = 160;
const CX = W / 2;
const CY = H / 2;
const LUMP = 24;
const DISC_RX = 50;
const DISC_RY = 56;
const LOG = 124;
const LOG_H = 22;
const PIECES = 6;
const SUSHI_R = 13;
const SUSHI_GAP = 30;

interface Paint {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  n: number;
  clay: string;
  light: string;
  dark: string;
  ink: string;
}

interface Frame {
  draw: (p: Paint) => void;
  thump?: number;
  hold?: number;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const boil = (n: number, i: number) => Math.sin(n * 12.9898 + i * 78.233) * 0.5;

function blob(p: Paint, x: number, y: number, rx: number, ry: number, turn = 0) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 1 + Math.sin(i * 2.3 + 1.7) * 0.06 + Math.sin(i * 5.1) * 0.03 + boil(p.n, i) * 0.02;
    pts.push([x + Math.cos(a + turn) * rx * r, y + Math.sin(a + turn) * ry * r]);
  }
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const { ctx } = p;
  ctx.beginPath();
  ctx.moveTo(...mid(pts[15], pts[0]));
  for (let i = 0; i < 16; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], ...mid(pts[i], pts[(i + 1) % 16]));
  ctx.closePath();
}

function shade(p: Paint, lift: number) {
  const { ctx, dpr } = p;
  ctx.shadowColor = `rgba(0,0,0,${0.5 - lift * 0.22})`;
  ctx.shadowBlur = (4 + lift * 14) * dpr;
  ctx.shadowOffsetX = (1.5 + lift * 13) * dpr;
  ctx.shadowOffsetY = (2.5 + lift * 17) * dpr;
}

function round(p: Paint, x: number, y: number, r: number) {
  const g = p.ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r * 1.15);
  g.addColorStop(0, p.light);
  g.addColorStop(0.35, p.clay);
  g.addColorStop(1, p.dark);
  return g;
}

function tube(p: Paint, y: number, h: number) {
  const g = p.ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, p.clay);
  g.addColorStop(0.25, p.light);
  g.addColorStop(0.5, p.clay);
  g.addColorStop(1, p.dark);
  return g;
}

function lump(p: Paint, r: number, lift = 0) {
  const { ctx } = p;
  const s = r * (1 + lift * 0.3);
  ctx.save();
  shade(p, lift);
  ctx.fillStyle = round(p, CX, CY, s);
  blob(p, CX, CY, s, s, p.n * 0.03);
  ctx.fill();
  ctx.restore();
}

function disc(p: Paint, rx: number, ry: number, clipBelow?: number) {
  const { ctx } = p;
  ctx.save();
  if (clipBelow !== undefined) {
    ctx.beginPath();
    ctx.rect(0, 0, W, clipBelow);
    ctx.clip();
  }
  shade(p, 0);
  ctx.fillStyle = round(p, CX, CY, Math.max(rx, ry));
  blob(p, CX, CY, rx, ry);
  ctx.fill();
  ctx.restore();
}

function log(p: Paint, x0: number, x1: number, y: number, h: number, left = h / 2, right = h / 2) {
  const { ctx } = p;
  ctx.save();
  shade(p, 0);
  ctx.fillStyle = tube(p, y, h);
  ctx.beginPath();
  ctx.roundRect(x0 + boil(p.n, x0) * 0.6, y - h / 2 + boil(p.n, y) * 0.6, x1 - x0, h, [left, right, right, left]);
  ctx.fill();
  ctx.restore();
}

function sushi(p: Paint, x: number, y: number, r: number, lift = 0) {
  const { ctx } = p;
  const s = r * (1 + lift * 0.2);
  ctx.save();
  shade(p, lift);
  ctx.fillStyle = round(p, x, y, s);
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let t = 0; t <= 1.001; t += 0.04) {
    const a = t * Math.PI * 5 + x * 0.3;
    const rr = (1.5 + t * (r - 4)) * (1 + lift * 0.2);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (t === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

function marks(p: Paint, strength: number) {
  const { ctx } = p;
  ctx.save();
  ctx.strokeStyle = `rgba(${p.ink},${0.55 * strength})`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.14;
    const r0 = 38 + (1 - strength) * 8;
    const len = i % 2 ? 5 : 8;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0);
    ctx.lineTo(CX + Math.cos(a) * (r0 + len), CY + Math.sin(a) * (r0 + len));
    ctx.stroke();
  }
  ctx.restore();
}

const cutX = (i: number) => CX - LOG / 2 + (LOG * i) / PIECES;

function score(p: Paint, x: number) {
  const { ctx } = p;
  ctx.save();
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, CY - LOG_H / 2 + 2);
  ctx.lineTo(x + boil(p.n, x) * 1.5, CY + LOG_H / 2 - 2);
  ctx.stroke();
  ctx.restore();
}
const sushiX = (i: number) => CX + (i - (PIECES - 1) / 2) * SUSHI_GAP;

function pieces(p: Paint, opened: number, standing = -1, tipping = -1) {
  for (let i = 0; i < PIECES; i++) {
    let shift = 0;
    for (let c = 0; c < opened; c++) shift += i <= c ? -2 : 2;
    const x0 = cutX(i) + shift;
    const x1 = cutX(i + 1) + shift;
    if (i === tipping) sushi(p, lerp((x0 + x1) / 2, sushiX(i), 0.5), CY - 4, SUSHI_R, 0.5);
    else if (i <= standing) sushi(p, sushiX(i), CY, SUSHI_R);
    else log(p, x0, x1, CY, LOG_H, i === 0 ? LOG_H / 2 : 2, i === PIECES - 1 ? LOG_H / 2 : 2);
  }
}

function buildLoop(): Frame[] {
  const f: Frame[] = [];
  for (let i = 0; i < 5; i++) f.push({ draw: p => lump(p, LUMP) });

  const passes = [[LUMP, LUMP, 34, 38], [34, 38, 44, 48], [44, 48, DISC_RX, DISC_RY]];
  for (const [rx0, ry0, rx1, ry1] of passes) {
    for (let i = 0; i < 3; i++) {
      const k = (i + 1) / 3;
      const press = i === 0 ? 1.05 : 1;
      f.push({
        hold: 1,
        thump: i === 0 ? 0.25 : undefined,
        draw: p => disc(p, lerp(rx0, rx1, k), lerp(ry0, ry1, k) * press),
      });
    }
    f.push({ hold: 1, draw: p => disc(p, rx1, ry1) });
  }

  let widest = 0;
  for (let i = 0; i < 12; i++) {
    const k = (i + 1) / 12;
    const edge = lerp(CY + DISC_RY, CY - DISC_RY, k);
    const h = lerp(8, 24, k);
    const off = (edge - CY) / DISC_RY;
    widest = Math.max(widest, 2 * DISC_RX * Math.sqrt(Math.max(0, 1 - off * off)), 30);
    const w = widest;
    f.push({
      draw: p => {
        if (k < 1) disc(p, DISC_RX, DISC_RY, edge - h * 0.3);
        log(p, CX - w / 2, CX + w / 2, edge, h);
      },
    });
  }
  for (const k of [0.5, 1]) {
    f.push({ draw: p => log(p, CX - DISC_RX, CX + DISC_RX, lerp(CY - DISC_RY, CY, k), 24) });
  }
  for (let i = 0; i < 6; i++) {
    const k = (i + 1) / 6;
    const w = lerp(2 * DISC_RX, LOG, k);
    const h = lerp(24, LOG_H, k);
    const sway = i % 2 ? 2 : -2;
    f.push({ draw: p => log(p, CX - w / 2 + sway, CX + w / 2 + sway, CY, h) });
  }

  for (let c = 1; c < PIECES; c++) {
    f.push({ draw: p => { pieces(p, c - 1); score(p, cutX(c)); } });
    f.push({ thump: 0.35, draw: p => pieces(p, c) });
  }
  f.push({ draw: p => pieces(p, PIECES - 1) });

  for (let i = 0; i < PIECES; i++) {
    f.push({ thump: 0.12, draw: p => pieces(p, PIECES - 1, i - 1, i) });
  }
  for (let i = 0; i < 4; i++) f.push({ draw: p => pieces(p, PIECES - 1, PIECES - 1) });

  for (const k of [0.35, 0.7, 1]) {
    f.push({
      draw: p => {
        for (let i = 0; i < PIECES; i++) sushi(p, lerp(sushiX(i), CX, k), CY, lerp(SUSHI_R, 10, k), 0.4);
      },
    });
  }
  f.push({ thump: 1, draw: p => { lump(p, LUMP * 1.3); marks(p, 1); } });
  f.push({ draw: p => { lump(p, LUMP * 1.12); marks(p, 0.4); } });
  f.push({ draw: p => lump(p, LUMP * 1.04) });
  return f;
}

const LOOP = buildLoop();

const ENTER: Frame[] = [
  ...[1.6, 1.25, 0.9, 0.5, 0.18].map(lift => ({ draw: (p: Paint) => lump(p, LUMP, lift) })),
  { thump: 0.7, draw: (p: Paint) => { lump(p, LUMP * 1.24); marks(p, 1); } },
  { draw: (p: Paint) => { lump(p, LUMP * 1.08); marks(p, 0.4); } },
];

const EXIT_FADE = [1, 0.7, 0.35, 0];

function resolveColor(host: HTMLElement, css: string) {
  const el = document.createElement('span');
  el.style.display = 'none';
  el.style.color = css;
  host.parentElement?.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
}

// Clay on the table, seen from above: rolled flat, rolled back into a log, sliced and stood up, squashed together again.
export function ClayLoader({ phase, label, theme }: { phase: ClayPhase; label: React.ReactNode; theme?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const labelRef = React.useRef<HTMLParagraphElement>(null);
  const run = React.useRef({ n: 0, at: 0, held: 0, entered: false, last: LOOP[0] });

  React.useEffect(() => {
    const cv = canvasRef.current;
    const text = labelRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || !text) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const primary = 'var(--hsk-primary, #ff6a33)';
    const p: Paint = {
      ctx,
      dpr,
      n: 0,
      clay: resolveColor(cv, primary),
      light: resolveColor(cv, `color-mix(in srgb, ${primary} 55%, white)`),
      dark: resolveColor(cv, `color-mix(in srgb, ${primary} 70%, black)`),
      ink: getComputedStyle(cv).getPropertyValue('--hsk-doodle-ink').trim() || '31, 31, 31',
    };
    const st = run.current;
    let paintedPrimary = '';
    const refreshPalette = () => {
      // Theme custom properties interpolate: sampling only at the switch keeps the old color.
      const color = getComputedStyle(cv).getPropertyValue('--hsk-primary').trim() || '#ff6a33';
      if (color === paintedPrimary) return;
      paintedPrimary = color;
      p.clay = resolveColor(cv, color);
      p.light = resolveColor(cv, `color-mix(in srgb, ${color} 55%, white)`);
      p.dark = resolveColor(cv, `color-mix(in srgb, ${color} 70%, black)`);
      p.ink = getComputedStyle(cv).getPropertyValue('--hsk-doodle-ink').trim() || '31, 31, 31';
    };

    const paint = (frame: Frame, alpha = 1) => {
      refreshPalette();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = alpha;
      p.n = st.n++;
      frame.draw(p);
      ctx.globalAlpha = 1;
    };
    const thump = (strength: number) => {
      const r = cv.getBoundingClientRect();
      thumpDoodles({ x: r.left + r.width / 2, y: r.top + r.height / 2, strength });
      text.style.translate = '0 1px';
      text.style.rotate = `${boil(st.n, 4) * 0.8}deg`;
    };

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      paint(LOOP[0]);
      // Keep the static frame's palette in sync through the theme transition too.
      const repaint = window.setInterval(() => paint(LOOP[0]), FRAME_MS);
      return () => clearInterval(repaint);
    }

    let seq: Frame[] | null = phase === 'exit' ? null : phase === 'enter' && !st.entered ? ENTER : LOOP;
    if (seq) st.at = 0;
    let fade = 0;
    let id = 0;

    const tick = () => {
      text.style.translate = '';
      text.style.rotate = '';
      if (!seq) {
        if (fade === 0) thump(0.6);
        paint(st.last, EXIT_FADE[fade]);
        if (++fade >= EXIT_FADE.length) clearInterval(id);
        return;
      }
      const frame = seq[st.at];
      paint(frame);
      st.last = frame;
      if (frame.thump && st.held === 0) thump(frame.thump);
      if (seq === LOOP && ++st.held < (frame.hold ?? HOLD)) return;
      st.held = 0;
      if (++st.at < seq.length) return;
      if (seq === ENTER) st.entered = true;
      seq = LOOP;
      st.at = 0;
    };

    tick();
    id = window.setInterval(tick, FRAME_MS);
    return () => clearInterval(id);
  }, [phase === 'exit', theme]);

  return (
    <div className="hsk-clay">
      <canvas className="hsk-clay-table" ref={canvasRef} aria-hidden="true" />
      <p className="hsk-lang-preparing" ref={labelRef}>{label}</p>
    </div>
  );
}
