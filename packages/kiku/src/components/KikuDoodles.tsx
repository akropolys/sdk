import React, { useEffect, useRef } from 'react';

/**
 * Procedural texture behind the chat thread. Composed at runtime rather than
 * shipped as a tile: any tile repeats, and the eye finds the seam immediately.
 */

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

/** Value noise on a 256-lattice; enough to drift density without a gradient field. */
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

/** Bridson blue-noise sampling. Even spacing without the alignment of a grid. */
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


/* Two glyph classes. `motifs` are the Greco-Roman set and stay near-upright — a
   rotated column reads as a mistake. `specks` are abstract, rotate freely, and
   just carry rhythm between the motifs. Both draw centred on the origin at
   roughly `s` across, with control points nudged so no two are identical. */
type Glyph = (ctx: CanvasRenderingContext2D, s: number, rng: Rng) => void;

const wob = (rng: Rng, k: number) => (rng() - 0.5) * k;

const motifs: Glyph[] = [
  // fluted column
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
  // temple front
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
  // amphora
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
  // olive sprig
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
  // olives on a stem
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
  // laurel wreath
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
  // meander fret
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
  // arch
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
  // sun
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
  // lyre
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
  // swallow
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

/* Scribbles carry the hand. They are the only family with no symmetry and no
   repeated construction, so they are what stops the field reading as a set of
   stamps — every one is a different walk. */
const scribbles: Glyph[] = [
  // loose wander
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
  // spiral
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
  // hatch
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
  // loops
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

const rgb = (s: string): [number, number, number] => {
  const p = s.split(',').map(n => parseFloat(n.trim()));
  return [p[0] || 0, p[1] || 0, p[2] || 0];
};

function mix(a: string, b: string, k: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
}

function compose(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ink: string,
  tint: string,
  seed: number,
) {
  ctx.clearRect(0, 0, w, h);
  const rng = mulberry32(seed);
  const noise = makeNoise(mulberry32(seed ^ 0x9e3779b9));

  const area = w * h;
  const target = Math.max(40, Math.min(520, Math.round(area / 3100)));
  const raw = target / 0.48;
  const r = Math.max(26, Math.sqrt((0.7 * area) / raw));
  const pts = poisson(w, h, r, rng);

  // Two octaves, both low frequency: a couple of lattice cells across the panel
  // for the broad empty regions, a few more for clustering inside them.
  const fa = 4.4 / Math.max(w, h);
  const fb = fa * 2.6;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The gradient is evaluated per mark rather than painted as a CanvasGradient:
  // a gradient object is transformed by the CTM, so it would drag along with
  // every translate. A mark is at most 36px across, so a ramp inside one is
  // invisible anyway — what reads is tone drifting across the whole field.
  const reach = Math.hypot(w, h);
  const angle = rng() * Math.PI * 2;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const poleX = w * (0.18 + rng() * 0.64);
  const poleY = h * (0.12 + rng() * 0.5);

  for (const [x, y] of pts) {
    const d = noise(x * fa, y * fa) * 0.72 + noise(x * fb, y * fb) * 0.28;
    const t = Math.min(1, Math.max(0, (d - 0.26) / 0.44));
    if (rng() > t * t * (3 - 2 * t)) continue;

    const roll = rng();

    // Warm bloom around the pole, tone falling off along the field axis.
    const bloom = Math.max(0, 1 - Math.hypot(x - poleX, y - poleY) / (reach * 0.72)) ** 1.6;
    const axis = ((x - w / 2) * ca + (y - h / 2) * sa) / reach + 0.5;
    const alpha = (0.03 + rng() * 0.038) * (0.62 + axis * 0.72) * (1 + bloom * 0.5);

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = Math.min(alpha, 0.11);
    ctx.strokeStyle = mix(ink, tint, bloom * 0.85);
    ctx.fillStyle = ctx.strokeStyle;

    if (roll < 0.5) {
      ctx.rotate(wob(rng, 0.16));
      ctx.lineWidth = 0.7 + rng() * 0.4;
      motifs[(rng() * motifs.length) | 0](ctx, 20 + rng() * 16, rng);
    } else if (roll < 0.82) {
      ctx.rotate(rng() * Math.PI * 2);
      ctx.lineWidth = 0.6 + rng() * 0.5;
      scribbles[(rng() * scribbles.length) | 0](ctx, 16 + rng() * 20, rng);
    } else {
      ctx.rotate(rng() * Math.PI * 2);
      ctx.lineWidth = 0.6 + rng() * 0.4;
      specks[(rng() * specks.length) | 0](ctx, 7 + rng() * 7, rng);
    }
    ctx.restore();
  }
}

export default function KikuDoodles({ seed = '', theme }: { seed?: string; theme?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;

    const numeric = hashSeed(seed || 'kiku');
    let frame = 0;

    // Measured from the canvas itself, not its parent: `inset: 0` plus an
    // explicit 100% size already lays it out, and writing the backing store
    // does not feed back into layout.
    const draw = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cs = getComputedStyle(cv);
      const ink = cs.getPropertyValue('--hsk-doodle-ink').trim() || '31,31,31';
      const tint = cs.getPropertyValue('--hsk-doodle-tint').trim() || ink;
      compose(ctx, w, h, ink, tint, numeric);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(cv);
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    scheme?.addEventListener?.('change', schedule);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      scheme?.removeEventListener?.('change', schedule);
    };
    // `theme` is in the deps because an explicit theme prop changes the ink
    // without firing the prefers-color-scheme listener.
  }, [seed, theme]);

  return <canvas className="hsk-cb-doodles" ref={ref} aria-hidden="true" />;
}
