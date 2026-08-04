import { useCallback, useEffect, useRef, useState } from 'react';

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

// Web Speech fires isFinal on its own schedule — often mid-thought, after a
// breath — which is why utterances were being sent before the speaker finished.
// Endpointing is decided here instead, from actual microphone energy.
const DEFAULT_SILENCE_MS = 1100;
// Below this RMS the room counts as quiet. Calibrated against the noise floor
// measured while the session starts, so a noisy café doesn't read as speech.
const SPEECH_MARGIN = 0.012;
const BARGE_IN_MS = 320;

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
  const activeRef = useRef(false);
  const pausedRef = useRef(paused);
  const wantRestartRef = useRef(false);

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

  const commit = useCallback(() => {
    const text = transcriptRef.current.trim();
    transcriptRef.current = '';
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
    const speech = rms > floorRef.current + SPEECH_MARGIN;
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
      // Assistant is talking: sustained speech means the shopper cut in.
      if (loudSinceRef.current && now - loudSinceRef.current > BARGE_IN_MS) {
        loudSinceRef.current = 0;
        onBargeInRef.current?.();
      }
    } else if (transcriptRef.current.trim() && now - lastLoudRef.current > silenceMs) {
      commit();
    }

    rafRef.current = requestAnimationFrame(monitor);
  }, [commit, silenceMs]);

  const startRecognition = useCallback(() => {
    if (recognitionRef.current || !activeRef.current) return;
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = lang || document.documentElement.lang || navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    // Continuous, because a per-utterance session hands control of when to stop
    // to the browser — exactly the decision this hook needs to make itself.
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
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
      // Chrome ends a continuous session after a stretch of silence. The session
      // is still open, so bring the mic straight back up.
      if (activeRef.current && wantRestartRef.current) {
        setTimeout(() => startRecognition(), 120);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      onErrorRef.current?.('failed-to-start');
    }
  }, [lang]);

  const stopRecognition = useCallback(() => {
    wantRestartRef.current = false;
    const r = recognitionRef.current;
    recognitionRef.current = null;
    try { r?.stop(); } catch { /* already stopped */ }
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
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
      stopRecognition();
    } else {
      lastLoudRef.current = Date.now();
      wantRestartRef.current = true;
      startRecognition();
    }
  }, [paused, active, startRecognition, stopRecognition]);

  useEffect(() => () => { stop(); }, [stop]);

  return { supported, active, hearing, interim, micLevel, micSpectrum, spectrumBins, start, stop };
}
