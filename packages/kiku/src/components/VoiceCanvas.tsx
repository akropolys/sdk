import React, { useEffect, useRef } from 'react';
import type { VoicePhase } from '../utils/voiceSession';

export interface VoiceCanvasProps {
  phase: VoicePhase;

  level: () => number;

  spectrum?: (out: Uint8Array) => boolean;

  bins?: () => number;
  className?: string;
}

type RGB = [number, number, number];

function parseColor(css: string, fallback: RGB): RGB {
  const m = css.match(/-?[\d.]+/g);
  if (!m || m.length < 3) return fallback;
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgba(c: RGB, alpha: number): string {
  return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;
}

const BANDS = 24;
const SPECTRUM_FRACTION = 0.42;

export function VoiceCanvas({ phase, level, spectrum, bins, className }: VoiceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const levelRef = useRef(level);
  const spectrumRef = useRef(spectrum);
  const binsRef = useRef(bins);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { spectrumRef.current = spectrum; }, [spectrum]);
  useEffect(() => { binsRef.current = bins; }, [bins]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const style = getComputedStyle(canvas);
    const accent = parseColor(style.getPropertyValue('--hsk-primary') || '', [255, 106, 51]);
    const ink = parseColor(style.getPropertyValue('--hsk-chat-text') || '', [31, 31, 31]);

    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    window.addEventListener('resize', resize);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    const bands = new Float32Array(BANDS);
    let strokes: CanvasGradient[] = [];
    let glow: CanvasGradient | null = null;
    let strokesFor = -1;
    let freqBuf: Uint8Array | null = null;
    let amp = 0;
    let sweep = 0;
    const start = performance.now();

    const follow = (cur: number, target: number, attack: number, release: number) =>
      cur + (target - cur) * (target > cur ? attack : release);

    const readSpectrum = () => {
      const read = spectrumRef.current;
      const n = binsRef.current?.() ?? 0;
      if (!read || !n) return false;
      if (!freqBuf || freqBuf.length !== n) freqBuf = new Uint8Array(n);
      if (!read(freqBuf)) return false;

      const usable = Math.max(BANDS, Math.floor(n * SPECTRUM_FRACTION));
      const per = usable / BANDS;
      for (let b = 0; b < BANDS; b++) {
        const from = Math.floor(b * per);
        const to = Math.max(from + 1, Math.floor((b + 1) * per));
        let sum = 0;
        for (let i = from; i < to; i++) sum += freqBuf[i];
        const v = sum / (to - from) / 255;
        bands[b] = follow(bands[b], v, reduced ? 0.2 : 0.55, reduced ? 0.06 : 0.14);
      }
      return true;
    };

    const synthesizeBands = (t: number, energy: number) => {
      for (let b = 0; b < BANDS; b++) {
        const m = b / (BANDS - 1);
        const shape = Math.pow(1 - m, 1.6) * (0.75 + 0.25 * Math.sin(t * 3.1 + b * 0.7));
        bands[b] = follow(bands[b], shape * energy, 0.3, 0.12);
      }
    };

    const bandAt = (m: number) => {
      const x = Math.min(BANDS - 1, Math.max(0, m * (BANDS - 1)));
      const i = Math.floor(x);
      const f = x - i;
      const a = bands[i];
      const b = bands[Math.min(BANDS - 1, i + 1)];
      return a + (b - a) * f * f * (3 - 2 * f);
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const t = (now - start) / 1000;
      const p = phaseRef.current;

      const live = Math.min(1, levelRef.current());
      const floor = p === 'speaking' ? 0.42 : p === 'listening' ? 0.3 : p === 'thinking' ? 0.28 : 0.12;
      amp = follow(amp, Math.max(floor, live), reduced ? 0.1 : 0.5, reduced ? 0.05 : 0.11);

      if (!readSpectrum()) synthesizeBands(t, Math.max(0.25, amp));

      ctx.clearRect(0, 0, w, h);
      const cy = h / 2;

      sweep = p === 'thinking' ? (sweep + 0.012) % 1.6 : 0;

      const layers = 3;
      if (strokesFor !== w) {
        strokes = [];
        for (let l = 0; l < layers; l++) {
          const depth = l / (layers - 1 || 1);
          const hue = mix(accent, ink, depth * 0.5);
          const g = ctx.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, rgba(hue, 0));
          g.addColorStop(0.5, rgba(hue, 0.9 - depth * 0.35));
          g.addColorStop(1, rgba(hue, 0));
          strokes.push(g);
        }
        glow = ctx.createLinearGradient(0, 0, w, 0);
        glow.addColorStop(0, rgba(accent, 0));
        glow.addColorStop(0.5, rgba(accent, 0.14));
        glow.addColorStop(1, rgba(accent, 0));
        strokesFor = w;
      }
      const maxAmp = h * 0.32;
      const step = Math.max(4, w / 130);

      for (let l = 0; l < layers; l++) {
        const depth = l / (layers - 1 || 1);
        const lag = l * 0.055;
        const scale = 1 - depth * 0.22;

        ctx.beginPath();
        let px = 0;
        let py = cy;
        for (let x = 0; x <= w; x += step) {
          const u = x / w;
          const envelope = Math.pow(Math.sin(Math.PI * u), 0.85);
          const focus = p === 'thinking'
            ? Math.exp(-Math.pow((u - (sweep - 0.3)) * 4.5, 2))
            : 1;

          const band = bandAt(Math.abs(u - 0.5) * 2);
          const tl = t - lag;
          const ripple =
            Math.sin(u * Math.PI * 2 * 2.1 + tl * 7.4) * 0.66 +
            Math.sin(u * Math.PI * 2 * 3.7 - tl * 5.6) * 0.26 +
            Math.sin(u * Math.PI * 2 * 5.9 + tl * 9.1) * 0.08;

          const y =
            cy +
            envelope * focus * scale * maxAmp * amp * (0.6 + band * 1.1) * ripple +
            Math.sin(u * Math.PI * 2 * 0.6 + (t - lag) * 2.2) * envelope * h * 0.01;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
          }
          px = x;
          py = y;
        }
        ctx.quadraticCurveTo(px, py, w, py);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const width = (l === 0 ? 3 : 1.6) * (1 + amp * 0.6);
        if (l === 0) {
          ctx.strokeStyle = glow!;
          ctx.lineWidth = width * 5;
          ctx.stroke();
        }
        ctx.strokeStyle = strokes[l];
        ctx.lineWidth = width;
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
