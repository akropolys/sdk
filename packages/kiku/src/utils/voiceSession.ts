import { useCallback, useEffect, useRef, useState } from 'react';
import { speechLevel, duckSpeech } from './tts';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceSessionOptions {
  /** BCP-47 tag for recognition. */
  lang?: string;
  /** Fired once per completed utterance, after the speaker has actually stopped. */
  onUtterance: (text: string) => void;
  /** Raw SpeechRecognition error code. */
  onError?: (code: string) => void;
  /** The speaker interrupted the assistant — stop talking and listen. */
  onBargeIn?: () => void;
  /** Silence, in ms, that ends an utterance. */
  silenceMs?: number;
  /** Suspend capture (e.g. while the assistant is speaking) without ending the session. */
  paused?: boolean;
}

// Web Speech fires isFinal mid-thought, so endpointing is decided here from microphone energy instead.
const DEFAULT_SILENCE_MS = 1100;
// Below this RMS the room counts as quiet. Calibrated against the noise floor
// measured while the session starts, so a noisy café doesn't read as speech.
const SPEECH_MARGIN = 0.012;
const BARGE_IN_MS = 320;
// How much of our own playback level to add to the speech threshold, so echo doesn't read as a barge-in.
const ECHO_REJECT = 0.09;

// How far the assistant drops while an interruption is being adjudicated, and
// how long the recogniser gets to confirm one before the duck is released.
const DUCK_LEVEL = 0.25;
const DUCK_FADE_MS = 130;
const CONFIRM_MS = 700;
// Frames of sustained voice-likeness needed to turn a duck into a real interruption (~0.2s at 60fps).
const CONFIRM_FRAMES = 12;

// Speech modulates at roughly 4–8 Hz — that is the syllable rate.
const MOD_WINDOW = 48; // ~0.8s of envelope history at 60fps

// Evidence weights.
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
  // How much of the current recognition's result list has already been sent. Per-recognition: a restart resets both.
  const consumedRef = useRef(0);
  const resultLenRef = useRef(0);
  const activeRef = useRef(false);
  const pausedRef = useRef(paused);
  // Should recognition be running? This is now the ONLY answer to that question.
  const wantRestartRef = useRef(false);
  // A stop() has been issued but the browser has not answered with onend yet.
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

  /** Live microphone amplitude, 0..1 — drives the voice-mode visual. */
  const micLevel = useCallback(() => levelRef.current, []);

  /** Current input spectrum, so the visual follows timbre, not just volume. */
  const micSpectrum = useCallback((out: Uint8Array) => {
    const a = analyserRef.current;
    if (!a || out.length !== a.frequencyBinCount) return false;
    a.getByteFrequencyData(out as any);
    return true;
  }, []);

  /** Bin count the spectrum buffer must have, or 0 before the mic is open. */
  const spectrumBins = useCallback(() => analyserRef.current?.frequencyBinCount ?? 0, []);

  // Rolling envelope history, for the 4–8 Hz modulation test.
  const envRef = useRef<number[]>([]);
  const freqRef = useRef<Uint8Array | null>(null);
  const duckedRef = useRef(false);
  const duckAtRef = useRef(0);
  const bargeEvidenceRef = useRef(0);

  /** How much the current frame looks like a human voice rather than noise, 0..1. */
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
        // Coefficient of variation, so the answer is about SHAPE rather than
        // loudness — a quiet voice and a loud one modulate alike.
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
    // Everything seen so far belongs to the turn being sent. Anything spoken
    // after this point starts the next one from a clean slate.
    consumedRef.current = resultLenRef.current;
    setInterim('');
    setHearing(false);
    if (text) onUtteranceRef.current(text);
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
    // Only our own output is subtracted, and only while it is actually playing.
    const echo = pausedRef.current ? speechLevel() * ECHO_REJECT : 0;
    const speech = rms > floorRef.current + SPEECH_MARGIN + echo;
    if (speech) {
      lastLoudRef.current = now;
      if (!loudSinceRef.current) loudSinceRef.current = now;
    } else {
      loudSinceRef.current = 0;
      // Track the quietest recent level as the room's floor, so the threshold
      // follows the environment rather than a number picked in a silent office.
      floorRef.current = Math.min(floorRef.current * 1.02 + 0.00002, Math.max(0.004, rms));
    }

    if (pausedRef.current) {
      // Assistant is talking.
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
        // Sustained voice-likeness is the confirmation.
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
    // A fresh recognition starts with an empty result list, so a carried-over
    // index would skip past real speech and swallow the first utterance.
    consumedRef.current = 0;
    resultLenRef.current = 0;
    recognition.lang = lang || document.documentElement.lang || navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    // Continuous, because a per-utterance session hands control of when to stop
    // to the browser — exactly the decision this hook needs to make itself.
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      // From `consumed`, not from zero.
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

    // Never listened for before.
    
    recognition.onerror = (event: any) => {
      const code = event?.error || '';
      // Logged even when benign.
      if (code === 'no-speech' || code === 'aborted') return;
      onErrorRef.current?.(code);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      // Chrome ends a continuous session after a stretch of silence. The session
      // is still open, so bring the mic straight back up.
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
      // The InvalidStateError case:
      recognitionRef.current = null;
      onErrorRef.current?.('failed-to-start');
    }
  }, [lang]);

  const stopRecognition = useCallback(() => {
    wantRestartRef.current = false;
    const r = recognitionRef.current;
    recognitionRef.current = null;
    // The ref clears here, synchronously, while the browser's own teardown is still in flight.
    try { r?.stop(); } catch { /* already stopped */ }
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
    try { r?.abort(); } catch { /* ignore */ }
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => { /* ignore */ });
    audioCtxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current || !supported) return;
    activeRef.current = true;
    setActive(true);
    try {
      // Browser AEC/NS matter here: without them the assistant's own voice
      // coming out of the speakers reads as the shopper talking.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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

  // Recognition is torn down while the assistant speaks — leaving it running
  // transcribes the answer back as a new question.
  useEffect(() => {
    if (!active) return;
    if (paused) {
      transcriptRef.current = '';
      setInterim('');
      // Whoever last held the floor, the adjudication that was in flight is
      // void — a duck carried across a handover would mute the new answer.
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

  /** Watches for the failure that has no symptom: */
  useEffect(() => {
    if (!active || paused) return;
    const id = setInterval(() => {
      const alive = !!recognitionRef.current;
      const hearingSomething = levelRef.current > floorRef.current + SPEECH_MARGIN;
      if (!alive) {
      } else if (hearingSomething && !transcriptRef.current) {
        // Sound is reaching the analyser but nothing is being transcribed.
      }
    }, 2000);
    return () => clearInterval(id);
  }, [active, paused]);

  useEffect(() => () => { stop(); }, [stop]);

  return { supported, active, hearing, interim, micLevel, micSpectrum, spectrumBins, start, stop };
}
