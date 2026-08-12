import type { SpeechResult, VoiceRefusal } from '@akropolys/sdk';

export interface SpeakOptions {
  /** AkropolysClient — synthesis runs server-side, so no key touches the page. */
  client: { synthesizeSpeech: (text: string, voice?: string, language?: string, signal?: AbortSignal) => Promise<SpeechResult | null> };
  text: string;
  voice?: string;
  /** The shopper's language name, e.g. "Greek" — steers delivery, not content. */
  language?: string;
  /** BCP-47 tag, used only by the browser-voice fallback. */
  bcp47?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
  /** The server declined to speak. Distinct from a failure — do not retry. */
  onRefused?: (reason: VoiceRefusal) => void;
  /** This shopper's remaining allowance, in seconds of audio. */
  onSecondsLeft?: (seconds: number) => void;
}

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let duckGain: GainNode | null = null;
let timeData: Uint8Array | null = null;
let generation = 0;
let speaking = false;
let smoothed = 0;
let usingFallback = false;

function audio(): { ctx: AudioContext; analyser: AnalyserNode } | null {
  if (typeof window === 'undefined') return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    analyser = ctx!.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.25;
    // Gain sits AFTER the analyser, so speechLevel() reports the true output level even while ducked.
    duckGain = ctx!.createGain();
    duckGain.gain.value = 1;
    analyser.connect(duckGain);
    duckGain.connect(ctx!.destination);
    timeData = new Uint8Array(analyser.fftSize);
  }
  return { ctx: ctx!, analyser: analyser! };
}

/** Rides the output gain to `level` over `fadeMs`. */
export function duckSpeech(level: number, fadeMs = 130): void {
  const g = duckGain;
  if (!g || !ctx) return;
  const now = ctx.currentTime;
  // From the value it actually holds right now, not from whatever it was last
  // told to reach — cancelling mid-ramp otherwise snaps to the old target.
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, level)), now + fadeMs / 1000);
}

/** Live output amplitude, 0..1 — drives the voice-mode visual. */
export function speechLevel(): number {
  if (!speaking) {
    smoothed *= 0.85;
    return smoothed;
  }
  // The browser fallback exposes no audio graph, so the visual would freeze
  // mid-sentence. Drive it from a cadence instead of pretending it's silent.
  if (usingFallback || !analyser || !timeData) {
    const t = Date.now() / 1000;
    return 0.35 + 0.18 * Math.sin(t * 7.1) + 0.1 * Math.sin(t * 3.3);
  }
  analyser.getByteTimeDomainData(timeData as any);
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / timeData.length);
  const level = Math.min(1, rms * 3.2);
  // Asymmetric: a syllable has to land the instant it is heard, while the tail
  // may fall away gently. One symmetric filter here made every onset late.
  smoothed += (level - smoothed) * (level > smoothed ? 0.6 : 0.12);
  return smoothed;
}

/** Fills out with the current output spectrum. False when there is no audio graph to read. */
export function speechSpectrum(out: Uint8Array): boolean {
  if (!speaking || usingFallback || !analyser) return false;
  if (out.length !== analyser.frequencyBinCount) return false;
  analyser.getByteFrequencyData(out as any);
  return true;
}

/** Bin count the spectrum buffer must have, or 0 when unavailable. */
export function spectrumBins(): number {
  return analyser ? analyser.frequencyBinCount : 0;
}

export function isSpeaking(): boolean {
  return speaking;
}

export function stopSpeech() {
  generation++;
  speaking = false;
  // A duck left in place would silently mute the START of the next answer,
  // which looks exactly like TTS having failed.
  if (duckGain && ctx) {
    duckGain.gain.cancelScheduledValues(ctx.currentTime);
    duckGain.gain.value = 1;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

/** Strips markup that would be read aloud, keeping the punctuation needed to phrase a sentence. */
export function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\s*\n\s*\n\s*/g, '. ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

// Sentence-sized chunks keep time-to-first-word short; the terminators cover Latin, CJK, Arabic and Devanagari.
const SENTENCE_END = /([.!?…。！？؟۔।]+["'”’)\]]*\s+)/;
const CHUNK_TARGET = 240;

export function chunkForSpeech(text: string, target = CHUNK_TARGET): string[] {
  const pieces = text.split(SENTENCE_END).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const piece of pieces) {
    if (buf && (buf + piece).length > target) {
      chunks.push(buf.trim());
      buf = '';
    }
    buf += piece;
    // A single sentence longer than the target still has to be broken up, or
    // one runaway paragraph blocks the whole queue.
    while (buf.length > target * 2) {
      const cut = buf.lastIndexOf(' ', target * 2);
      chunks.push(buf.slice(0, cut > target ? cut : target * 2).trim());
      buf = buf.slice(cut > target ? cut : target * 2);
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(c => /\S/.test(c));
}

function playBuffer(a: { ctx: AudioContext; analyser: AnalyserNode }, buf: AudioBuffer, gen: number): Promise<void> {
  return new Promise(resolve => {
    if (gen !== generation) return resolve();
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(a.analyser);
    src.onended = () => resolve();
    // A stop() mid-playback resolves through the generation check on the next
    // chunk; disconnecting here would leave onended unfired.
    src.start();
    const watchdog = setInterval(() => {
      if (gen !== generation) {
        clearInterval(watchdog);
        try { src.stop(); } catch { /* already ended */ }
        resolve();
      }
    }, 100);
    src.onended = () => { clearInterval(watchdog); resolve(); };
  });
}

/** Speaks with the platform voice, falling back to the browser synthesizer only when the server cannot answer. */
export async function speak({
  client,
  text,
  voice,
  language,
  bcp47,
  onStart,
  onEnd,
  onError,
  onRefused,
  onSecondsLeft,
}: SpeakOptions): Promise<void> {
  stopSpeech();
  const gen = ++generation;
  usingFallback = false;

  const clean = cleanTextForSpeech(text);
  if (!clean) { onEnd?.(); return; }

  const a = audio();
  if (!a) { fallbackWebSpeech(clean, bcp47, onStart, onEnd, onError); return; }
  // Autoplay policy: the context starts suspended until a gesture resumes it.
  if (a.ctx.state === 'suspended') { try { await a.ctx.resume(); } catch { /* ignore */ } }

  const chunks = chunkForSpeech(clean);
  const synth = (t: string) => client.synthesizeSpeech(t, voice, language).catch(() => null);

  let started = false;
  let pending = synth(chunks[0]);

  for (let i = 0; i < chunks.length; i++) {
    if (gen !== generation) break;
    const result = await pending;
    pending = i + 1 < chunks.length ? synth(chunks[i + 1]) : Promise.resolve(null);

    // A refusal is a decision, not a hiccup:
    if (result && 'refused' in result && result.refused) {
      onRefused?.(result.refused);
      onEnd?.();
      return;
    }
    if (!result) {
      // Nothing has been heard yet — the browser voice is better than silence.
      if (!started) {
        fallbackWebSpeech(chunks.slice(i).join(' '), bcp47, onStart, onEnd, onError);
        return;
      }
      continue;
    }
    if (result.secondsLeft !== undefined) onSecondsLeft?.(result.secondsLeft);
    if (gen !== generation) break;

    let decoded: AudioBuffer;
    try {
      decoded = await a.ctx.decodeAudioData(result.audio.slice(0));
    } catch (e) {
      onError?.(e);
      continue;
    }
    if (gen !== generation) break;

    if (!started) { started = true; speaking = true; onStart?.(); }
    await playBuffer(a, decoded, gen);
  }

  if (gen === generation) {
    speaking = false;
    onEnd?.();
  }
}

/** Picks the browser voice that actually speaks the shopper's language. */
function pickVoice(tag: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices?.() ?? [];
  if (!voices.length || !tag) return undefined;
  const want = tag.toLowerCase();
  const base = want.split('-')[0];
  const candidates = voices.filter(v => v.lang?.toLowerCase().replace('_', '-') === want);
  const loose = candidates.length
    ? candidates
    : voices.filter(v => v.lang?.toLowerCase().split(/[-_]/)[0] === base);
  if (!loose.length) return undefined;
  // Network voices are the natural-sounding ones; the local set is the robot.
  return loose.find(v => v.localService === false) ?? loose[0];
}

function fallbackWebSpeech(
  text: string,
  bcp47?: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: any) => void
) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onError?.('speech-unavailable');
    onEnd?.();
    return;
  }
  const gen = generation;
  usingFallback = true;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const tag = bcp47 || document.documentElement.lang || navigator.language || '';
    if (tag) utterance.lang = tag;
    const v = pickVoice(tag);
    if (v) utterance.voice = v;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => { speaking = true; onStart?.(); };
    utterance.onend = () => {
      if (gen !== generation) return;
      speaking = false;
      onEnd?.();
    };
    utterance.onerror = (e) => {
      speaking = false;
      onError?.(e);
      onEnd?.();
    };
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    speaking = false;
    onError?.(e);
    onEnd?.();
  }
}
