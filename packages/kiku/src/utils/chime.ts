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
  // Without this iOS routes Web Audio through the ambient session, which the
  // hardware ring/silent switch mutes outright. Safari 16.4+ / iOS 17.
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
    master.gain.value = 0.34;
    master.connect(ctx.destination);
    // A context built inside the gesture still starts suspended on iOS, and
    // resuming alone is not enough - it stays muted until something has
    // actually played, so this pushes one silent frame through.
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

// Minor pentatonic off G, so any two scouts sound related rather than random.
const STEPS = [0, 3, 5, 7, 10];
const ROOT = 392;

function pitchFor(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  const step = STEPS[h % STEPS.length];
  const octave = (h >> 3) % 2;
  return ROOT * Math.pow(2, step / 12 + octave);
}

function squelch(at: number, gain: number): void {
  if (!ctx || !master) return;
  const dur = 0.16;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 7;
  bp.frequency.setValueAtTime(2200, at);
  bp.frequency.exponentialRampToValueAtTime(320, at + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/** 'off' | 'unsupported' | AudioContext state - so a silent phone can say why. */
export function chimeState(): string {
  if (!soundsEnabled()) return 'off';
  if (!ctx) return 'unsupported';
  return ctx.state;
}

export type ChimeEvent = 'reply' | 'scout' | 'interrupt' | 'pin' | 'send';

/** seed varies the pitch within an event - pass a scout's species id. */
/** force plays even while muted - the toggle has to be able to demonstrate itself. */
export function chime(event: ChimeEvent, seed?: string, force = false): void {
  if (!force && !soundsEnabled()) return;
  primeChimes();
  if (!ctx || !master || ctx.state === 'closed') return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const t = ctx.currentTime + 0.01;
  switch (event) {
    case 'reply':
      droplet(t, 440, 0.94, 0.13, 0.5);
      droplet(t + 0.09, 660, 0.94, 0.16, 0.42);
      break;
    case 'scout': {
      const f = pitchFor(seed || 'scout');
      droplet(t, f, 0.92, 0.15, 0.45);
      droplet(t + 0.075, f * 1.5, 0.93, 0.17, 0.32);
      break;
    }
    case 'interrupt':
      droplet(t, 520, 0.62, 0.17, 0.4);
      break;
    case 'send':
      squelch(t, 0.3);
      droplet(t + 0.012, 300, 1.35, 0.11, 0.3);
      break;
    case 'pin':
      tick(t, 0.35);
      droplet(t + 0.02, 880, 0.97, 0.07, 0.22);
      break;
  }
}
