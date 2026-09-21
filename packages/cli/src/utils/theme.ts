const NO_COLOR = Boolean(process.env.NO_COLOR) || !process.stdout.isTTY;
const TRUECOLOR = /truecolor|24bit/i.test(process.env.COLORTERM || '');

export type RGB = [number, number, number];

export const BRAND: RGB = [255, 90, 31];
export const EMBER: RGB = [255, 182, 72];
export const MUTED: RGB = [138, 138, 133];

export function rgb(color: RGB, text: string): string {
  if (NO_COLOR) return text;
  if (!TRUECOLOR) return `\x1b[38;5;${to256(color)}m${text}\x1b[39m`;
  return `\x1b[38;2;${color[0]};${color[1]};${color[2]}m${text}\x1b[39m`;
}

function to256([r, g, b]: RGB): number {
  const q = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

export function mix(from: RGB, to: RGB, t: number): RGB {
  const clamped = Math.min(1, Math.max(0, t));
  return [
    Math.round(from[0] + (to[0] - from[0]) * clamped),
    Math.round(from[1] + (to[1] - from[1]) * clamped),
    Math.round(from[2] + (to[2] - from[2]) * clamped),
  ];
}

export function gradient(text: string, from: RGB = BRAND, to: RGB = EMBER): string {
  const chars = [...text];
  return chars
    .map((ch, i) => (ch === ' ' ? ch : rgb(mix(from, to, chars.length < 2 ? 0 : i / (chars.length - 1)), ch)))
    .join('');
}

export const dim = (text: string) => rgb(MUTED, text);
export const bold = (text: string) => (NO_COLOR ? text : `\x1b[1m${text}\x1b[22m`);

// The arch is kiku's mark; the wordmark carries the same ramp as the loader so
// the whole run reads as one object.
export function banner(): string {
  const arch = [' ▟███▙ ', '▐█   █▌'];
  const left = arch.map((row, i) => rgb(mix(BRAND, EMBER, i / 2), row));
  return [
    `${left[0]}  ${bold(gradient('AKROPOLYS'))}`,
    `${left[1]}  ${dim('the conversational layer for the living web')}`,
  ].join('\n');
}

const ANSI = /\x1b\[[0-9;]*m/g;
const width = (text: string) => text.replace(ANSI, '').length;

export function box(title: string, rows: [string, string][]): string {
  const inner = Math.max(
    title.length + 6,
    ...rows.map(([label, value]) => width(label) + width(value) + 6),
  );
  const top = `${dim('╭─')}${bold(gradient(` ${title} `))}${dim('─'.repeat(inner - title.length - 5))}${dim('╮')}`;
  const body = rows.map(([label, value]) => {
    const gap = ' '.repeat(inner - width(label) - width(value) - 4);
    return `${dim('│')} ${dim(label)}${gap}${value} ${dim('│')}`;
  });
  return [top, ...body, dim(`╰${'─'.repeat(inner - 2)}╯`)].join('\n');
}
