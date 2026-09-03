import { useCallback, useEffect, useRef, useState } from 'react';
import { speechLevel, duckSpeech } from './tts';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceSessionOptions {
  /** BCP-47 tag for recognition. */
  lang?: string;

  onUtterance: (text: string) => void;
  /** Raw SpeechRecognition error code. */
  onError?: (code: string) => void;

  onBargeIn?: () => void;
  /** Silence, in ms, that ends an utterance. */
  silenceMs?: number;

  paused?: boolean;
}

const DEFAULT_SILENCE_MS = 1100;
const SPEECH_MARGIN = 0.012;
const BARGE_IN_MS = 320;
const ECHO_REJECT = 0.09;

const DUCK_LEVEL = 0.25;
const DUCK_FADE_MS = 130;
const CONFIRM_MS = 700;
const CONFIRM_FRAMES = 12;

const MOD_WINDOW = 48; // ~0.8s of envelope history at 60fps

const W_ENERGY = 0.45;
const W_MODULATION = 0.35;
const W_BAND = 0.20;
const DUCK_SCORE = 0.55;

export function useVoiceSession({
  lang,
  onUtterance,
  onError,
  onBargeIn,
  silenceMs = DEFAULT_SILENCE_MS,
  paused = false,
}: VoiceSessionOptions) {
  const [active, setActive] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [interim, setInterim] = useState('');
  const [supported, setSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  const levelRef = useRef(0);
  const floorRef = useRef(0.008);
  const lastLoudRef = useRef(0);
  const loudSinceRef = useRef(0);
  const transcriptRef = useRef('');
  const consumedRef = useRef(0);
  const resultLenRef = useRef(0);
  const activeRef = useRef(false);
  const pausedRef = useRef(paused);
  const wantRestartRef = useRef(false);
  const stoppingRef = useRef(false);

  const onUtteranceRef = useRef(onUtterance);
  const onErrorRef = useRef(onError);
  const onBargeInRef = useRef(onBargeIn);
  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onBargeInRef.current = onBargeIn; }, [onBargeIn]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  const micLevel = useCallback(() => levelRef.current, []);

  const micSpectrum = useCallback((out: Uint8Array) => {
    const a = analyserRef.current;
    if (!a || out.length !== a.frequencyBinCount) return false;
    a.getByteFrequencyData(out as any);
    return true;
  }, []);

  const spectrumBins = useCallback(() => analyserRef.current?.frequencyBinCount ?? 0, []);

  const envRef = useRef<number[]>([]);
  const freqRef = useRef<Uint8Array | null>(null);
  const duckedRef = useRef(false);
  const duckAtRef = useRef(0);
  const bargeEvidenceRef = useRef(0);

  const voiceLikeness = useCallback((rms: number): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;

    const env = envRef.current;
    env.push(rms);
    if (env.length > MOD_WINDOW) env.shift();

    let modulation = 0;
    if (env.length >= 12) {
      let mean = 0;
      for (const v of env) mean += v;
      mean /= env.length;
      if (mean > 0.0001) {
        let variance = 0;
        for (const v of env) variance += (v - mean) * (v - mean);
        modulation = Math.min(1, Math.sqrt(variance / env.length) / mean / 0.6);
      }
    }

    let band = 0;
    if (!freqRef.current || freqRef.current.length !== analyser.frequencyBinCount) {
      freqRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    const freq = freqRef.current;
    analyser.getByteFrequencyData(freq as any);
    const nyquist = (audioCtxRef.current?.sampleRate ?? 48000) / 2;
    const per = nyquist / freq.length;
    const lo = Math.floor(300 / per);
    const hi = Math.min(freq.length - 1, Math.ceil(3400 / per));
    let inBand = 0, total = 0;
    for (let i = 0; i < freq.length; i++) {
      total += freq[i];
      if (i >= lo && i <= hi) inBand += freq[i];
    }
    if (total > 0) band = inBand / total;

    const energy = Math.min(1, rms / (floorRef.current + SPEECH_MARGIN * 3));
    return W_ENERGY * energy + W_MODULATION * modulation + W_BAND * band;
  }, []);

  const commit = useCallback(() => {
    const text = transcriptRef.current.trim();
    transcriptRef.current = '';
    consumedRef.current = resultLenRef.current;
    setInterim('');
    setHearing(false);
    if (text) {
      wantRestartRef.current = false;
      const r = recognitionRef.current;
      recognitionRef.current = null;
      try { r?.stop(); } catch { }
      onUtteranceRef.current(text);
    }
  }, []);

  const monitor = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return;

    analyser.getByteTimeDomainData(data as any);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const lvl = Math.min(1, rms * 4);
    levelRef.current += (lvl - levelRef.current) * (lvl > levelRef.current ? 0.6 : 0.12);

    const now = Date.now();
    const echo = pausedRef.current ? speechLevel() * ECHO_REJECT : 0;
    const speech = rms > floorRef.current + SPEECH_MARGIN + echo;
    if (speech) {
      lastLoudRef.current = now;
      if (!loudSinceRef.current) loudSinceRef.current = now;
    } else {
      loudSinceRef.current = 0;
      floorRef.current = Math.min(floorRef.current * 1.02 + 0.00002, Math.max(0.004, rms));
    }

    if (pausedRef.current) {
      if (!duckedRef.current) {
        if (loudSinceRef.current && now - loudSinceRef.current > BARGE_IN_MS &&
            voiceLikeness(rms) > DUCK_SCORE) {
          loudSinceRef.current = 0;
          duckedRef.current = true;
          duckAtRef.current = now;
          bargeEvidenceRef.current = 0;
          duckSpeech(DUCK_LEVEL, DUCK_FADE_MS);
        }
      } else {
        if (voiceLikeness(rms) > DUCK_SCORE) bargeEvidenceRef.current += 1;
        else bargeEvidenceRef.current = Math.max(0, bargeEvidenceRef.current - 2);

        if (bargeEvidenceRef.current >= CONFIRM_FRAMES) {
          duckedRef.current = false;
          bargeEvidenceRef.current = 0;
          duckSpeech(1, 0);
          onBargeInRef.current?.();
        } else if (now - duckAtRef.current > CONFIRM_MS) {
          duckedRef.current = false;
          bargeEvidenceRef.current = 0;
          duckSpeech(1, DUCK_FADE_MS * 2);
        }
      }
    } else if (transcriptRef.current.trim() && now - lastLoudRef.current > silenceMs) {
      commit();
    }

    rafRef.current = requestAnimationFrame(monitor);
  }, [commit, silenceMs, voiceLikeness]);

  const startRecognition = useCallback(() => {
    if (recognitionRef.current || !activeRef.current) return;
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    consumedRef.current = 0;
    resultLenRef.current = 0;
    recognition.lang = lang || document.documentElement.lang || navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = consumedRef.current; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      resultLenRef.current = event.results.length;
      text = text.trim();
      if (!text) return;
      transcriptRef.current = text;
      setInterim(text);
      setHearing(true);
    };

    recognition.onerror = (event: any) => {
      const code = event?.error || '';
      if (code === 'no-speech' || code === 'aborted') return;
      onErrorRef.current?.(code);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (activeRef.current && wantRestartRef.current) {
        setTimeout(() => {
          startRecognition();
        }, 120);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e: any) {
      recognitionRef.current = null;
      onErrorRef.current?.('failed-to-start');
    }
  }, [lang]);

  const stopRecognition = useCallback(() => {
    wantRestartRef.current = false;
    const r = recognitionRef.current;
    recognitionRef.current = null;
    try { r?.stop(); } catch {  }
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    duckedRef.current = false;
    bargeEvidenceRef.current = 0;
    envRef.current = [];
    duckSpeech(1, 0);
    wantRestartRef.current = false;
    setActive(false);
    setHearing(false);
    setInterim('');
    transcriptRef.current = '';
    levelRef.current = 0;
    const r = recognitionRef.current;
    recognitionRef.current = null;
    try { r?.abort(); } catch {  }
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {  });
    audioCtxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current || !supported) return;
    activeRef.current = true;
    setActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.25;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.fftSize);
      floorRef.current = 0.008;
      lastLoudRef.current = Date.now();
      rafRef.current = requestAnimationFrame(monitor);
    } catch (e: any) {
      activeRef.current = false;
      setActive(false);
      onErrorRef.current?.(e?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture');
      return;
    }
    wantRestartRef.current = true;
    startRecognition();
  }, [supported, monitor, startRecognition]);

  useEffect(() => {
    if (!active) return;
    if (paused) {
      transcriptRef.current = '';
      setInterim('');
      duckedRef.current = false;
      bargeEvidenceRef.current = 0;
      envRef.current = [];
      stopRecognition();
    } else {
      duckedRef.current = false;
      lastLoudRef.current = Date.now();
      wantRestartRef.current = true;
      startRecognition();
    }
  }, [paused, active, startRecognition, stopRecognition]);

  useEffect(() => {
    if (!active || paused) return;
    const id = setInterval(() => {
      const alive = !!recognitionRef.current;
      const hearingSomething = levelRef.current > floorRef.current + SPEECH_MARGIN;
      if (!alive) {
      } else if (hearingSomething && !transcriptRef.current) {
      }
    }, 2000);
    return () => clearInterval(id);
  }, [active, paused]);

  useEffect(() => () => { stop(); }, [stop]);

  return { supported, active, hearing, interim, micLevel, micSpectrum, spectrumBins, start, stop };
}
