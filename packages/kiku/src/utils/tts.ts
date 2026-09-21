let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let duckGain: GainNode | null = null;
let timeData: Uint8Array | null = null;
let speaking = false;
let smoothed = 0;
export function duckSpeech(level: number, fadeMs = 130): void {
  const g = duckGain;
  if (!g || !ctx) return;
  const now = ctx.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, level)), now + fadeMs / 1000);
}

export function speechLevel(): number {
  if (!speaking) {
    smoothed *= 0.85;
    return smoothed;
  }
  if (!analyser || !timeData) return smoothed;
  analyser.getByteTimeDomainData(timeData as any);
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / timeData.length);
  const level = Math.min(1, rms * 3.2);
  smoothed += (level - smoothed) * (level > smoothed ? 0.6 : 0.12);
  return smoothed;
}

export function stopSpeech() {
  speaking = false;
  if (duckGain && ctx) {
    duckGain.gain.cancelScheduledValues(ctx.currentTime);
    duckGain.gain.value = 1;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch {  }
  }
}
