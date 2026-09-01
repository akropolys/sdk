
export interface Point { x: number; y: number }

export type MarkGesture = 'ring' | 'cross' | 'scribble' | 'arrow' | 'text';

export interface MarkRegion {
  gesture: MarkGesture;
    box: [number, number, number, number];
  to?: [number, number];
  text?: string;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(pts: Point[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i]);
  return n;
}

function bbox(pts: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

const clamp1000 = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));

function norm(b: ReturnType<typeof bbox>, w: number, h: number): [number, number, number, number] {
  return [
    clamp1000((b.minY / h) * 1000),
    clamp1000((b.minX / w) * 1000),
    clamp1000((b.maxY / h) * 1000),
    clamp1000((b.maxX / w) * 1000),
  ];
}

function overlaps(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  const [ay0, ax0, ay1, ax1] = a;
  const [by0, bx0, by1, bx1] = b;
  const iw = Math.min(ax1, bx1) - Math.max(ax0, bx0);
  const ih = Math.min(ay1, by1) - Math.max(ay0, by0);
  if (iw <= 0 || ih <= 0) return false;
  const smaller = Math.min((ax1 - ax0) * (ay1 - ay0), (bx1 - bx0) * (by1 - by0));
  return smaller > 0 && (iw * ih) / smaller > 0.35;
}

const union = (
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] =>
  [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

interface Classified { gesture: MarkGesture; box: [number, number, number, number]; to?: [number, number]; straight: boolean }

function classifyStroke(pts: Point[], w: number, h: number): Classified | null {
  if (pts.length < 2) return null;
  const b = bbox(pts);
  const box = norm(b, w, h);
  const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  if (diag < 4) return null; // a tap, not a gesture

  const len = pathLength(pts);
  const endGap = dist(pts[0], pts[pts.length - 1]);
  const straightness = len / Math.max(endGap, 1e-6);

  if (endGap / diag < 0.3 && len > diag * 1.8) return { gesture: 'ring', box, straight: false };

  if (straightness < 1.25) {
    return {
      gesture: 'arrow',
      box,
      to: [clamp1000((pts[pts.length - 1].y / h) * 1000), clamp1000((pts[pts.length - 1].x / w) * 1000)],
      straight: true,
    };
  }

  return { gesture: 'scribble', box, straight: false };
}

export function buildMarkRegions(
  actions: ReadonlyArray<{ kind: string; points?: Point[]; x?: number; y?: number; value?: string; tool?: string }>,
  width: number,
  height: number,
): MarkRegion[] {
  if (!width || !height) return [];

  const strokes: Classified[] = [];
  const texts: MarkRegion[] = [];

  for (const a of actions) {
    if (a.kind === 'text' && a.value && typeof a.x === 'number' && typeof a.y === 'number') {
      const p = { x: a.x, y: a.y };
      texts.push({ gesture: 'text', box: norm(bbox([p, p]), width, height), text: a.value });
      continue;
    }
    if (a.kind === 'stroke' && a.tool !== 'eraser' && a.points) {
      const c = classifyStroke(a.points, width, height);
      if (c) strokes.push(c);
    }
  }

  const used = new Set<number>();
  const out: MarkRegion[] = [];
  for (let i = 0; i < strokes.length; i++) {
    if (used.has(i)) continue;
    let cur = strokes[i];
    for (let j = i + 1; j < strokes.length; j++) {
      if (used.has(j) || !cur.straight || !strokes[j].straight) continue;
      if (!overlaps(cur.box, strokes[j].box)) continue;
      used.add(j);
      cur = { gesture: 'cross', box: union(cur.box, strokes[j].box), straight: false };
    }
    used.add(i);
    out.push(cur.gesture === 'arrow'
      ? { gesture: 'arrow', box: cur.box, to: cur.to }
      : { gesture: cur.gesture, box: cur.box });
  }

  return [...out, ...texts];
}
