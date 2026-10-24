const SOUND_KEY = 'hsk-sounds';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function soundsEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundsEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {  }
  if (on) primeChimes();
}

export function primeChimes(): void {
  if (typeof window === 'undefined') return;
  try {
    const session = (navigator as any).audioSession;
    if (session && session.type !== 'playback') session.type = 'playback';
  } catch {  }
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
    ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

function droplet(at: number, f0: number, glide: number, dur: number, gain: number): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, f0 * glide), at + dur);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.9;
  lp.frequency.setValueAtTime(Math.min(18000, f0 * 7), at);
  lp.frequency.exponentialRampToValueAtTime(Math.max(80, f0 * 1.5), at + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(lp);
  lp.connect(g);
  g.connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

// Not a tone: a filtered noise burst, so it reads as contact rather than pitch.
function tick(at: number, gain: number): void {
  if (!ctx || !master) return;
  const n = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 5;
  const g = ctx.createGain();
  g.gain.value = gain;

  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(at);
}

/** 'off' | 'unsupported' | AudioContext state - so a silent phone can say why. */
export function chimeState(): string {
  if (!soundsEnabled()) return 'off';
  if (!ctx) return 'unsupported';
  return ctx.state;
}

export type ChimeEvent = 'reply' | 'interrupt' | 'pin' | 'send' | 'connect' | 'heard';

function connectChime(at: number): void {
  if (!ctx || !master) return;

  // D5 (587.33 Hz) warm initial chime
  droplet(at, 587.33, 0.985, 0.16, 0.38);

  // F#5 (739.99 Hz) ascending major third
  droplet(at + 0.048, 739.99, 0.985, 0.18, 0.42);

  // A5 (880.00 Hz) fifth + D6 (1174.66 Hz) high glass shimmer with silky decay
  droplet(at + 0.096, 880.00, 0.985, 0.28, 0.46);
  droplet(at + 0.105, 1174.66, 0.985, 0.22, 0.22);

  // Subtle organic acoustic strike transient on the peak note
  tick(at + 0.096, 0.16);
}

function heardChime(at: number): void {
  if (!ctx || !master) return;
  droplet(at, 659.25, 0.97, 0.09, 0.26);
}

/** force plays even while muted - the toggle has to be able to demonstrate itself. */
export function chime(event: ChimeEvent, force = false): void {
  if (!force && !soundsEnabled()) return;
  primeChimes();
  if (!ctx || !master || ctx.state === 'closed') return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const t = ctx.currentTime + 0.01;
  switch (event) {
    case 'connect':
      connectChime(t);
      break;
    case 'heard':
      heardChime(t);
      break;
    case 'reply':
      droplet(t, 440, 0.94, 0.13, 0.5);
      droplet(t + 0.09, 660, 0.94, 0.16, 0.42);
      break;
    case 'interrupt':
      droplet(t, 520, 0.62, 0.17, 0.4);
      break;
    case 'send':
      droplet(t, 300, 1.16, 0.1, 0.22);
      break;
    case 'pin':
      tick(t, 0.35);
      droplet(t + 0.02, 880, 0.97, 0.07, 0.22);
      break;
  }
}
