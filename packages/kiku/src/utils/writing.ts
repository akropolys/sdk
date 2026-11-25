const SLOW_FRAME_MS = 28;
const SLOW_FRAMES = 24;

let slow = (() => {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory !== undefined && nav.deviceMemory < 4) || (nav.hardwareConcurrency || 8) <= 2;
})();
let frames = 0;
let total = 0;

export function writingSlow(): boolean {
  return slow;
}

export function noteFrame(dt: number) {
  if (slow || dt <= 0 || dt > 250) return;
  frames++;
  total += dt;
  if (frames < SLOW_FRAMES) return;
  if (total / frames > SLOW_FRAME_MS) slow = true;
  frames = 0;
  total = 0;
}

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const MARKER = /^[ \t]*(?:[-*+•]|\d{1,3}[.)]|#{1,6})[ \t]+(?:\*\*)?/;
const MAYBE_MARKER = /^[ \t]*(?:[-*+•]|\d{1,3}[.)]?|#{1,6})?[ \t]*$/;
const LINK = /^!?\[[^\]\n]*\]\([^)\n]*\)/;
const MAYBE_LINK = /^!?\[[^\]\n]*(?:\](?:\([^)\n]*)?)?$/;

// Where a reveal may stop in markdown source.
export function snapReveal(text: string, at: number, done: boolean): number {
  const len = text.length;
  let i = Math.max(0, Math.min(at, len));
  if (i === 0) return 0;
  const ls = text.lastIndexOf('\n', i - 1) + 1;

  let lb = text.lastIndexOf('[', i - 1);
  if (lb >= ls) {
    if (lb > ls && text[lb - 1] === '!') lb--;
    const rest = text.slice(lb);
    const full = LINK.exec(rest);
    if (full) {
      if (i < lb + full[0].length) i = lb + full[0].length;
    } else if (!done && MAYBE_LINK.test(rest)) {
      i = lb;
    }
  }

  if (i > 0 && i < len && text[i - 1] === '*' && text[i] === '*') i++;
  else if (!done && i === len && text[i - 1] === '*' && text[i - 2] !== '*') i--;

  const nl = text.indexOf('\n', ls);
  const end = nl < 0 ? len : nl;
  const line = text.slice(ls, end);
  const m = MARKER.exec(line);
  if (m) {
    const after = ls + m[0].length;
    if (i > ls && i <= after) {
      const lone = text[after] === '*' && after + 1 >= len;
      if (after < end && !(lone && !done)) i = after + 1;
      else if (!done) i = ls;
    }
  } else if (!done && nl < 0 && i > ls && MAYBE_MARKER.test(line)) {
    i = ls;
  }
  return i;
}
