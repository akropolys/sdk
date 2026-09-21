import pc from 'picocolors';
import { BRAND, EMBER, mix, rgb } from './theme';

const COLS = 6;
const FRAME_MS = 90;
const CLEAR_LINE = '\x1b[K';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

const CHARS: Record<string, string> = { '11': '█', '10': '▀', '01': '▄', '00': '·' };

// A 2-row grid drawn with half-blocks, so the whole thing stays on one line and
// clears with a single carriage return.
function frame(tick: number): string {
  const cycle = COLS + 3;
  const head = tick % cycle;
  let out = '';
  for (let c = 0; c < COLS; c++) {
    const d = head - c;
    const top = d >= 0 && d <= 2;
    const bottom = d >= 1 && d <= 3;
    const ch = CHARS[`${top ? 1 : 0}${bottom ? 1 : 0}`];
    out += ch === '·' ? pc.dim(ch) : rgb(mix(BRAND, EMBER, c / (COLS - 1)), ch);
  }
  return out;
}

export interface GridSpinner {
  start(message: string): void;
  message(message: string): void;
  stop(message: string, symbol?: string): void;
}

export function gridSpinner(): GridSpinner {
  let timer: NodeJS.Timeout | null = null;
  let tick = 0;
  let current = '';
  const stream = process.stdout;
  const interactive = Boolean(stream.isTTY);

  const render = () => {
    stream.write(`\r${pc.gray('│')}  ${frame(tick)}  ${current}${CLEAR_LINE}`);
    tick += 1;
  };

  return {
    start(message: string) {
      current = message;
      if (!interactive) {
        stream.write(`${pc.gray('│')}  ${message}\n`);
        return;
      }
      stream.write(`${pc.gray('│')}\n${HIDE_CURSOR}`);
      render();
      timer = setInterval(render, FRAME_MS);
    },
    message(message: string) {
      current = message;
    },
    stop(message: string, symbol = pc.green('◇')) {
      if (timer) clearInterval(timer);
      timer = null;
      if (!interactive) {
        stream.write(`${pc.gray('│')}  ${message}\n`);
        return;
      }
      stream.write(`\r${symbol}  ${message}${CLEAR_LINE}\n`);
      stream.write(SHOW_CURSOR);
    },
  };
}
