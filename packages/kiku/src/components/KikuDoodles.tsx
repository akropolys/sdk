import React, { useEffect, useRef } from 'react';

type Rng = () => number;

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function makeNoise(rng: Rng) {
  const size = 256;
  const lat = new Float32Array(size * size);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const at = (x: number, y: number) => lat[(y & 255) * size + (x & 255)];

  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
  };
}

function poisson(w: number, h: number, r: number, rng: Rng): Array<[number, number]> {
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: Array<[number, number]> = [];
  const active: number[] = [];

  const place = (x: number, y: number) => {
    const i = pts.length;
    pts.push([x, y]);
    grid[Math.floor(y / cell) * gw + Math.floor(x / cell)] = i;
    active.push(i);
  };

  const fits = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let gy = Math.max(cy - 2, 0); gy <= Math.min(cy + 2, gh - 1); gy++) {
      for (let gx = Math.max(cx - 2, 0); gx <= Math.min(cx + 2, gw - 1); gx++) {
        const j = grid[gy * gw + gx];
        if (j < 0) continue;
        const dx = pts[j][0] - x;
        const dy = pts[j][1] - y;
        if (dx * dx + dy * dy < r * r) return false;
      }
    }
    return true;
  };

  place(rng() * w, rng() * h);
  while (active.length) {
    const ai = (rng() * active.length) | 0;
    const [px, py] = pts[active[ai]];
    let placed = false;
    for (let k = 0; k < 24; k++) {
      const ang = rng() * Math.PI * 2;
      const rad = r * (1 + rng());
      const x = px + Math.cos(ang) * rad;
      const y = py + Math.sin(ang) * rad;
      if (fits(x, y)) {
        place(x, y);
        placed = true;
        break;
      }
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
}

type Glyph = (ctx: CanvasRenderingContext2D, s: number, rng: Rng) => void;

const wob = (rng: Rng, k: number) => (rng() - 0.5) * k;

const motifs: Glyph[] = [
  (ctx, s, rng) => {
    const h = s * 0.5;
    const w = s * (0.14 + rng() * 0.04);
    const cap = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(-w - cap * 0.6, -h);
    ctx.lineTo(w + cap * 0.6, -h);
    ctx.moveTo(-w, -h + cap);
    ctx.lineTo(w, -h + cap);
    ctx.moveTo(-w, -h + cap);
    ctx.lineTo(-w * 0.85, h - cap);
    ctx.moveTo(w, -h + cap);
    ctx.lineTo(w * 0.85, h - cap);
    ctx.moveTo(0, -h + cap * 1.7);
    ctx.lineTo(0, h - cap * 1.7);
    ctx.moveTo(-w, h - cap);
    ctx.lineTo(w, h - cap);
    ctx.moveTo(-w - cap * 0.6, h);
    ctx.lineTo(w + cap * 0.6, h);
    ctx.stroke();
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    const eave = -q * (0.18 + rng() * 0.1);
    ctx.beginPath();
    ctx.moveTo(-q, eave);
    ctx.lineTo(0, -q);
    ctx.lineTo(q, eave);
    ctx.closePath();
    ctx.moveTo(-q * 0.92, eave + q * 0.16);
    ctx.lineTo(q * 0.92, eave + q * 0.16);
    for (const x of [-0.62, -0.21, 0.21, 0.62]) {
      ctx.moveTo(q * x, eave + q * 0.16);
      ctx.lineTo(q * x, q * 0.8);
    }
    ctx.moveTo(-q, q * 0.8);
    ctx.lineTo(q, q * 0.8);
    ctx.stroke();
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    const belly = q * (0.48 + rng() * 0.12);
    ctx.beginPath();
    ctx.moveTo(-q * 0.2, -q * 0.86);
    ctx.lineTo(q * 0.2, -q * 0.86);
    ctx.moveTo(-q * 0.15, -q * 0.78);
    ctx.bezierCurveTo(-belly, -q * 0.3, -belly * 0.85, q * 0.6, 0, q * 0.86);
    ctx.bezierCurveTo(belly * 0.85, q * 0.6, belly, -q * 0.3, q * 0.15, -q * 0.78);
    ctx.moveTo(-q * 0.17, -q * 0.64);
    ctx.quadraticCurveTo(-belly * 1.16, -q * 0.48, -belly * 0.7, -q * 0.04);
    ctx.moveTo(q * 0.17, -q * 0.64);
    ctx.quadraticCurveTo(belly * 1.16, -q * 0.48, belly * 0.7, -q * 0.04);
    ctx.stroke();
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(-q * 0.9, q * 0.52);
    ctx.quadraticCurveTo(0, -q * 0.18, q * 0.9, -q * 0.58);
    ctx.stroke();
    const n = 4 + ((rng() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const t = 0.16 + (i / n) * 0.8;
      const px = -q * 0.9 + t * q * 1.8;
      const py = q * 0.52 - t * q * 1.16 + (1 - t) * t * q * 0.3;
      const dir = i % 2 ? 1 : -1;
      const l = q * (0.26 + rng() * 0.1);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + l * 0.5, py + dir * l * 0.66, px + l * 0.9, py + dir * l * 0.08);
      ctx.quadraticCurveTo(px + l * 0.42, py + dir * l * 0.04, px, py);
      ctx.stroke();
    }
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(-q * 0.85, -q * 0.7);
    ctx.quadraticCurveTo(-q * 0.1, -q * 0.35, q * 0.2, q * 0.1);
    ctx.stroke();
    const drupes: Array<[number, number]> = [
      [-q * 0.45, -q * 0.12],
      [q * 0.05, q * 0.3],
      [q * 0.42, -q * 0.4],
    ];
    for (const [ox, oy] of drupes) {
      ctx.beginPath();
      ctx.moveTo(ox, oy - q * 0.28);
      ctx.lineTo(ox - q * 0.02, oy - q * 0.16);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(ox, oy, q * (0.15 + rng() * 0.04), q * 0.19, wob(rng, 0.5), 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, q * 0.72, side > 0 ? -1.25 : 1.25, side > 0 ? 1.25 : Math.PI * 2 - 1.25, side < 0);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -1.05 + (i / 4) * 2.1;
        const ax = Math.sin(a) * side * q * 0.72;
        const ay = Math.cos(a) * q * 0.72;
        const l = q * (0.2 + rng() * 0.08);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(ax + side * l * 0.9, ay - l * 0.5, ax + side * l * 0.6, ay - l * 1.05);
        ctx.stroke();
      }
    }
  },
  (ctx, s) => {
    const q = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(-q, q * 0.6);
    ctx.lineTo(q * 0.55, q * 0.6);
    ctx.lineTo(q * 0.55, -q * 0.6);
    ctx.lineTo(-q * 0.45, -q * 0.6);
    ctx.lineTo(-q * 0.45, q * 0.15);
    ctx.lineTo(q * 0.1, q * 0.15);
    ctx.lineTo(q * 0.1, -q * 0.18);
    ctx.stroke();
  },
  (ctx, s) => {
    const q = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(-q * 0.62, q * 0.8);
    ctx.lineTo(-q * 0.62, -q * 0.05);
    ctx.arc(0, -q * 0.05, q * 0.62, Math.PI, 0);
    ctx.lineTo(q * 0.62, q * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-q * 0.86, q * 0.8);
    ctx.lineTo(q * 0.86, q * 0.8);
    ctx.stroke();
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, q * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    const off = rng() * 0.5;
    for (let i = 0; i < 8; i++) {
      const a = off + (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * q * 0.6, Math.sin(a) * q * 0.6);
      ctx.lineTo(Math.cos(a) * q * 0.94, Math.sin(a) * q * 0.94);
      ctx.stroke();
    }
  },
  (ctx, s) => {
    const q = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(-q * 0.44, q * 0.7);
    ctx.bezierCurveTo(-q, q * 0.2, -q * 0.8, -q * 0.7, -q * 0.3, -q * 0.6);
    ctx.moveTo(q * 0.44, q * 0.7);
    ctx.bezierCurveTo(q, q * 0.2, q * 0.8, -q * 0.7, q * 0.3, -q * 0.6);
    ctx.moveTo(-q * 0.32, -q * 0.64);
    ctx.lineTo(q * 0.32, -q * 0.64);
    ctx.moveTo(-q * 0.44, q * 0.7);
    ctx.lineTo(q * 0.44, q * 0.7);
    for (const x of [-0.16, 0.02, 0.2]) {
      ctx.moveTo(q * x, -q * 0.56);
      ctx.lineTo(q * x, q * 0.62);
    }
    ctx.stroke();
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    const lift = q * (0.4 + rng() * 0.18);
    ctx.beginPath();
    ctx.moveTo(-q, q * 0.16);
    ctx.quadraticCurveTo(-q * 0.5, -lift, 0, -q * 0.02);
    ctx.quadraticCurveTo(q * 0.5, -lift, q, q * 0.16);
    ctx.stroke();
  },
];

const scribbles: Glyph[] = [
  (ctx, s, rng) => {
    const q = s * 0.5;
    let px = -q + wob(rng, q * 0.3);
    let py = wob(rng, q);
    ctx.beginPath();
    ctx.moveTo(px, py);
    const n = 4 + ((rng() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const nx = px + (q * 2) / n + wob(rng, q * 0.5);
      const ny = wob(rng, q * 1.5);
      ctx.quadraticCurveTo(px + wob(rng, q * 0.9), py + wob(rng, q * 1.6), nx, ny);
      px = nx;
      py = ny;
    }
    ctx.stroke();
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    const turns = 2.2 + rng() * 1.6;
    const dir = rng() < 0.5 ? -1 : 1;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = dir * t * turns * Math.PI * 2;
      const rr = q * t * (0.9 + wob(rng, 0.06));
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    const n = 4 + ((rng() * 4) | 0);
    const lean = wob(rng, 0.7);
    for (let i = 0; i < n; i++) {
      const x = -q + (i / (n - 1)) * q * 2 + wob(rng, q * 0.16);
      const len = q * (0.7 + rng() * 0.6);
      ctx.beginPath();
      ctx.moveTo(x - lean * len * 0.5, -len * 0.5);
      ctx.quadraticCurveTo(x + wob(rng, q * 0.2), 0, x + lean * len * 0.5, len * 0.5);
      ctx.stroke();
    }
  },
  (ctx, s, rng) => {
    const q = s * 0.5;
    const n = 2 + ((rng() * 3) | 0);
    const step = (q * 2) / n;
    ctx.beginPath();
    ctx.moveTo(-q, q * 0.4);
    for (let i = 0; i < n; i++) {
      const x = -q + i * step;
      const r = step * (0.42 + rng() * 0.18);
      ctx.bezierCurveTo(x + r * 0.2, q * 0.4 - r * 2.1, x + step - r * 0.2, q * 0.4 - r * 2.1, x + step, q * 0.4 + wob(rng, q * 0.14));
    }
    ctx.stroke();
  },
];

const specks: Glyph[] = [
  (ctx, s, rng) => {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.1 + rng() * s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  },
  (ctx, s, rng) => {
    ctx.beginPath();
    ctx.arc(wob(rng, s * 0.04), wob(rng, s * 0.04), s * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  },
  (ctx, s, rng) => {
    const o = s * 0.4;
    const i = o * (0.2 + rng() * 0.12);
    ctx.beginPath();
    ctx.moveTo(0, -o);
    ctx.quadraticCurveTo(i, -i, o, 0);
    ctx.quadraticCurveTo(i, i, 0, o);
    ctx.quadraticCurveTo(-i, i, -o, 0);
    ctx.quadraticCurveTo(-i, -i, 0, -o);
    ctx.stroke();
  },
  (ctx, s, rng) => {
    const q = s * 0.4;
    ctx.beginPath();
    ctx.moveTo(-q, wob(rng, s * 0.08));
    ctx.quadraticCurveTo(0, wob(rng, s * 0.16), q, wob(rng, s * 0.08));
    ctx.stroke();
  },
];

// One per theme, drawn rarely and a touch brighter than the field around it.
const accents: Record<string, Glyph> = {
  light: (ctx, s) => {
    const q = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -q);
    ctx.quadraticCurveTo(q * 0.16, -q * 0.16, q, 0);
    ctx.quadraticCurveTo(q * 0.16, q * 0.16, 0, q);
    ctx.quadraticCurveTo(-q * 0.16, q * 0.16, -q, 0);
    ctx.quadraticCurveTo(-q * 0.16, -q * 0.16, 0, -q);
    ctx.stroke();
  },
  dark: (ctx, s) => {
    const q = s * 0.44;
    ctx.beginPath();
    ctx.moveTo(-q * 0.6, -q * 0.5);
    ctx.lineTo(q * 0.6, -q * 0.5);
    ctx.lineTo(q, q * 0.05);
    ctx.lineTo(0, q);
    ctx.lineTo(-q, q * 0.05);
    ctx.closePath();
    ctx.moveTo(-q, q * 0.05);
    ctx.lineTo(q, q * 0.05);
    ctx.moveTo(-q * 0.6, -q * 0.5);
    ctx.lineTo(-q * 0.3, q * 0.05);
    ctx.lineTo(0, q);
    ctx.moveTo(q * 0.6, -q * 0.5);
    ctx.lineTo(q * 0.3, q * 0.05);
    ctx.lineTo(0, q);
    ctx.stroke();
  },
  mahogany: (ctx, s) => {
    const q = s * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, q);
    ctx.bezierCurveTo(-q * 0.9, q * 0.2, -q * 0.7, -q * 0.7, 0, -q);
    ctx.bezierCurveTo(q * 0.7, -q * 0.7, q * 0.9, q * 0.2, 0, q);
    ctx.moveTo(0, q * 0.86);
    ctx.lineTo(0, -q * 0.86);
    for (let i = 0; i < 3; i++) {
      const t = -0.34 + i * 0.36;
      ctx.moveTo(0, q * t);
      ctx.lineTo(q * 0.44, q * (t - 0.26));
      ctx.moveTo(0, q * t);
      ctx.lineTo(-q * 0.44, q * (t - 0.26));
    }
    ctx.stroke();
  },
  blush: (ctx, s) => {
    const q = s * 0.5;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * q * 0.52, Math.sin(a) * q * 0.52, q * 0.42, q * 0.26, a, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, q * 0.19, 0, Math.PI * 2);
    ctx.stroke();
  },
  coffee: (ctx, s) => {
    const q = s * 0.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, q * 0.6, q * 0.9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -q * 0.84);
    ctx.bezierCurveTo(q * 0.34, -q * 0.3, -q * 0.34, q * 0.3, 0, q * 0.84);
    ctx.stroke();
  },
  midnight: (ctx, s) => {
    const q = s * 0.5;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? q : q * 0.4;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  },
};

const rgb = (s: string): [number, number, number] => {
  const p = s.split(',').map(n => parseFloat(n.trim()));
  return [p[0] || 0, p[1] || 0, p[2] || 0];
};

function mix(a: string, b: string, k: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
}

interface DoodleGlyph {
  x: number;
  y: number;
  roll: number;
  rotation: number;
  lineWidth: number;
  alpha: number;
  baseColor: string;
  shimmerColor: string;
  drawFn: (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => void;
  size: number;
  seed: number;
  normDist: number;
}

function getShimmerColor(seed: number, normDist: number, isDarkMode: boolean): string {
  // Exact rainbow spectrum as the animated placeholder text (0 -> 300 hue)
  const hue = Math.round((normDist * 300) % 360);
  const sat = isDarkMode ? 72 : 68;
  const light = isDarkMode ? 58 : 46;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function generateGlyphs(
  w: number,
  h: number,
  ink: string,
  tint: string,
  seed: number,
  isRTL: boolean,
  themeId?: string,
): DoodleGlyph[] {
  const accent = themeId ? accents[themeId] : undefined;
  const rng = mulberry32(seed);
  const noise = makeNoise(mulberry32(seed ^ 0x9e3779b9));

  const area = w * h;
  const target = Math.max(40, Math.min(520, Math.round(area / 3100)));
  const raw = target / 0.48;
  const r = Math.max(26, Math.sqrt((0.7 * area) / raw));
  const pts = poisson(w, h, r, rng);

  const fa = 4.4 / Math.max(w, h);
  const fb = fa * 2.6;
  const reach = Math.hypot(w, h);
  const angle = rng() * Math.PI * 2;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const poleX = w * (0.18 + rng() * 0.64);
  const poleY = h * (0.12 + rng() * 0.5);

  const glyphs: DoodleGlyph[] = [];
  const maxDist = Math.hypot(w, h) || 1;
  // light ink means it is being drawn onto a dark surface
  const [ir, ig, ib] = ink.split(',').map(n => parseFloat(n) || 0);
  const isDarkMode = 0.2126 * ir + 0.7152 * ig + 0.0722 * ib > 128;

  for (const [x, y] of pts) {
    const d = noise(x * fa, y * fa) * 0.72 + noise(x * fb, y * fb) * 0.28;
    const t = Math.min(1, Math.max(0, (d - 0.26) / 0.44));
    if (rng() > t * t * (3 - 2 * t)) continue;
      const roll = rng();
    const bloom = Math.max(0, 1 - Math.hypot(x - poleX, y - poleY) / (reach * 0.72)) ** 1.6;
    const axis = ((x - w / 2) * ca + (y - h / 2) * sa) / reach + 0.5;
    const isLightMode = !isDarkMode;
    const alphaBase = isLightMode ? 0.055 : 0.028;
    const alpha = (alphaBase + rng() * (isLightMode ? 0.04 : 0.025)) * (0.75 + axis * 0.55) * (1 + bloom * 0.4);

    const baseColor = mix(ink, tint, bloom * 0.85);
    // RTL: from Bottom-Right (w, h) to Top-Left (0, 0)
    // LTR: from Top-Left (0, 0) to Bottom-Right (w, h)
    const normDist = isRTL
      ? (w - x + h - y) / (w + h || 1)
      : (x + y) / (w + h || 1);

    const glyphSeed = (rng() * 0xffffff) | 0;
    const shimmerColor = getShimmerColor(glyphSeed, normDist, isDarkMode);

    let rotation = 0;
    let lineWidth = isLightMode ? 1.05 + rng() * 0.35 : 0.65 + rng() * 0.35;
    let size = 20;
    let drawFn = motifs[0];
    let alphaMul = 1;

    if (roll < 0.5) {
      rotation = wob(rng, 0.16);
      lineWidth = isLightMode ? 1.15 + rng() * 0.45 : 0.7 + rng() * 0.35;
      size = 20 + rng() * 16;
      drawFn = motifs[(rng() * motifs.length) | 0];
    } else if (roll < 0.82) {
      rotation = rng() * Math.PI * 2;
      lineWidth = isLightMode ? 0.95 + rng() * 0.4 : 0.6 + rng() * 0.4;
      size = 16 + rng() * 20;
      drawFn = scribbles[(rng() * scribbles.length) | 0];
    } else if (roll < 0.95 || !accent) {
      rotation = rng() * Math.PI * 2;
      lineWidth = isLightMode ? 0.85 + rng() * 0.35 : 0.55 + rng() * 0.35;
      size = 7 + rng() * 7;
      drawFn = specks[(rng() * specks.length) | 0];
    } else {
      rotation = wob(rng, 0.3);
      lineWidth = isLightMode ? 1.1 + rng() * 0.3 : 0.75 + rng() * 0.3;
      size = 15 + rng() * 9;
      drawFn = accent;
      alphaMul = 2.6;
    }

    glyphs.push({
      x,
      y,
      roll,
      rotation,
      lineWidth,
      alpha: alpha * alphaMul,
      baseColor,
      shimmerColor,
      drawFn,
      size,
      seed: glyphSeed,
      normDist,
    });
  }

  return glyphs;
}

function renderDoodles(
  ctx: CanvasRenderingContext2D,
  glyphs: DoodleGlyph[],
  w: number,
  h: number,
  shimmerProgress: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Active smooth fluid shimmer wave (-0.2 to 1.4)
  const isShimmering = shimmerProgress >= 0 && shimmerProgress <= 1.4;
  const wavePos = isShimmering ? shimmerProgress * 1.4 - 0.2 : -999;
  const waveWidth = 0.30;

  for (const g of glyphs) {
    let alpha = g.alpha;
    let stroke = g.baseColor;
    let lw = g.lineWidth;

    if (isShimmering) {
      const diff = g.normDist - wavePos;

      // Ahead of wave: subtle dormant state
      if (diff > waveWidth) {
        alpha = g.alpha * 0.45;
        stroke = g.baseColor;
        lw = g.lineWidth;
      }
      // Behind wave (wake): permanently awake resting state
      else if (diff < -waveWidth) {
        alpha = g.alpha;
        stroke = g.baseColor;
        lw = g.lineWidth;
      }
      // In wavefront beam: soft, delicate rainbow/silver glint
      else {
        const surge = Math.cos((diff / waveWidth) * (Math.PI / 2)) ** 2;
        alpha = g.alpha + surge * 0.08;
        stroke = surge > 0.08 ? mix(g.baseColor, g.shimmerColor, surge * 0.65) : g.baseColor;
        lw = g.lineWidth * (1 + surge * 0.2);
      }
    }

    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rotation);
    ctx.globalAlpha = Math.min(alpha, 1.0);
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    ctx.lineWidth = lw;

    const glyphRng = mulberry32(g.seed);
    g.drawFn(ctx, g.size, glyphRng);
    ctx.restore();
  }
}

const KikuDoodles = React.memo(function KikuDoodles({
  seed = '',
  theme,
  dir,
}: {
  seed?: string;
  theme?: string;
  dir?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const isAnimatingRef = useRef(false);
  const animFrameRef = useRef(0);
  const cachedGlyphsRef = useRef<DoodleGlyph[] | null>(null);
  const lastWidthRef = useRef<number>(0);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;

    const numeric = hashSeed(seed || 'kiku');
    let timer = 0;

    const tick = (startTime: number, duration: number, glyphs: DoodleGlyph[], isRTL: boolean) => (now: number) => {
      const elapsed = now - startTime;
      const rawProgress = Math.min(1, elapsed / duration);
      const eased = (1 - Math.cos(rawProgress * Math.PI)) / 2;
      const progress = eased * 1.4;

      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (w && h) {
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const targetW = Math.round(w * dpr);
        const targetH = Math.round(h * dpr);
        if (cv.width !== targetW || cv.height !== targetH) {
          cv.width = targetW;
          cv.height = targetH;
        }
        const ctx = cv.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderDoodles(ctx, glyphs, w, h, progress);
        }
      }

      if (rawProgress < 1) {
        animFrameRef.current = requestAnimationFrame(tick(startTime, duration, glyphs, isRTL));
      } else {
        isAnimatingRef.current = false;
        const w = cv.clientWidth;
        const h = cv.clientHeight;
        const ctx = cv.getContext('2d');
        if (ctx && w && h) {
          const dpr = Math.min(window.devicePixelRatio || 1, 3);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderDoodles(ctx, glyphs, w, h, -1);
        }
      }
    };

    const updateCanvas = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const ctx = cv.getContext('2d');
      if (!ctx) return;

      const cs = getComputedStyle(cv);
      const ink = cs.getPropertyValue('--hsk-doodle-ink').trim() || '31,31,31';
      const tint = cs.getPropertyValue('--hsk-doodle-tint').trim() || ink;
      const isRTL = dir === 'rtl' || cs.direction === 'rtl' || cv.closest('[dir="rtl"]') !== null;

      const fullScreenH = typeof window !== 'undefined' ? Math.max(h, window.innerHeight || 0) : h;

      const glyphs = generateGlyphs(w, fullScreenH, ink, tint, numeric, isRTL, theme);
      cachedGlyphsRef.current = glyphs;
      lastWidthRef.current = w;

      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (cv.width !== targetW || cv.height !== targetH) {
        cv.width = targetW;
        cv.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

      if (reducedMotion) {
        renderDoodles(ctx, glyphs, w, h, -1);
        return;
      }

      cancelAnimationFrame(animFrameRef.current);
      isAnimatingRef.current = true;
      const duration = 1200;
      const startTime = performance.now();
      animFrameRef.current = requestAnimationFrame(tick(startTime, duration, glyphs, isRTL));
    };

    const handleResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(updateCanvas, 20);
    };

    updateCanvas();

    const ro = new ResizeObserver(handleResize);
    ro.observe(cv);
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleSchemeChange = () => {
      updateCanvas();
    };
    scheme?.addEventListener?.('change', handleSchemeChange);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animFrameRef.current);
      isAnimatingRef.current = false;
      ro.disconnect();
      scheme?.removeEventListener?.('change', handleSchemeChange);
    };
  }, [seed, theme, dir]);

  return <canvas className="hsk-cb-doodles" ref={ref} aria-hidden="true" />;
});

export default KikuDoodles;
