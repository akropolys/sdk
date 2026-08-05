import { useCallback, useEffect, useRef, useState } from 'react';
import { speechLevel, duckSpeech } from './tts';
import { logVoice } from './voiceLog';

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
// How much of our own playback level to add to the speech threshold while the
// assistant is talking. Browser AEC cancels most of what the speakers emit, but
// never all of it — on laptop speakers at volume, or over Bluetooth, the
// residue crossed a fixed threshold and read as the shopper interrupting. The
// assistant then cut itself off, reopened the mic into the tail of its own
// sentence, and answered that. Gating on the level we are OUTPUTTING is what
// separates a real interruption from our own echo; it costs one already-computed
// number, and it also lets the noise floor keep adapting through playback
// instead of stalling because everything reads as speech.
const ECHO_REJECT = 0.09;

// How far the assistant drops while an interruption is being adjudicated, and
// how long the recogniser gets to confirm one before the duck is released.
const DUCK_LEVEL = 0.25;
const DUCK_FADE_MS = 130;
const CONFIRM_MS = 700;
// Frames of sustained voice-likeness needed to turn a duck into a real
// interruption — roughly a fifth of a second at 60fps, about the shortest a
// deliberate word can be.
const CONFIRM_FRAMES = 12;

// Speech modulates at roughly 4–8 Hz — that is the syllable rate. Fans, road
// noise, air conditioning and hum carry plenty of energy but almost none of
// that modulation, which is what separates them from a voice without a model.
const MOD_WINDOW = 48; // ~0.8s of envelope history at 60fps

// Evidence weights. Deliberately crude: this score only ever decides whether to
// DUCK, and the recogniser decides whether that was really an interruption. A
// mistuned weight costs a brief dip in volume, never a wrong turn boundary —
// which is the only reason a hand-weighted score is affordable here at all.
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
  // How much of the current recognition's result list has already been sent,
  // and how long that list was when we last looked. Both are per-recognition:
  // a restart hands back an empty list, so both reset with it.
  const consumedRef = useRef(0);
  const resultLenRef = useRef(0);
  const activeRef = useRef(false);
  const pausedRef = useRef(paused);
  // Should recognition be running? This is now the ONLY answer to that
  // question. `recognitionRef` says whether an instance exists, which is a
  // different thing and was being read as if it were the same.
  const wantRestartRef = useRef(false);
  // A stop() has been issued but the browser has not answered with onend yet.
  // Constructing a new recogniser inside this window is what threw
  // InvalidStateError: the ref had already been cleared, so the guard against
  // double-starting saw nothing, the exception was caught into a null ref, and
  // no onend ever arrived to restart it. The session died in silence while the
  // level meter kept animating off the separate getUserMedia stream.
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

  /**
   * How much the current frame looks like a human voice rather than noise,
   * 0..1. Two signals, both read off buffers we already fill every frame:
   *
   *  - modulation: speech rises and falls at the syllable rate; steady sources
   *    (fan, engine, hum) hold a near-constant envelope
   *  - band ratio: voiced speech concentrates in ~300–3400 Hz, while clatter is
   *    broadband and rumble sits below it
   *
   * Neither identifies WHO is speaking. A television or a bystander scores as
   * high as the shopper, and nothing short of speaker identification changes
   * that — this rejects noise, not other people.
   */
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
    logVoice('call', 'commit', text.slice(0, 60) || '(empty)');
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
    // While the shopper holds the floor this term is zero and the threshold is
    // exactly what it always was.
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
      // Assistant is talking. Acoustics alone cannot tell an interruption from
      // a lorry, so they no longer decide one: enough evidence DUCKS the
      // assistant and reopens the mic, and the recogniser — the only component
      // that actually knows what speech is — settles it. A false alarm costs a
      // fade nobody consciously registers, where a hard stop used to sever the
      // sentence and hand the floor to a passing noise.
      // Confirmation is acoustic, not ASR. Bringing recognition up mid-duck to
      // adjudicate looked better on paper, but SpeechRecognition.stop() is
      // asynchronous while the ref clears synchronously, so the restart raced
      // its own teardown: Chrome aborted both, onerror swallows 'aborted' by
      // design, and after a couple of interruptions recognition never came back
      // at all — the microphone appeared live, because the level meter runs off
      // a separate getUserMedia stream, while nothing was being transcribed.
      //
      // Recognition therefore has exactly one owner: the paused effect. What
      // survives is the part that mattered — evidence only DUCKS, and a duck
      // has to hold up over time before it takes the floor, so a door slam
      // fades the answer for a moment instead of ending it.
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
        // Sustained voice-likeness is the confirmation. A transient loses its
        // accumulated evidence faster than it gains it, so only something that
        // keeps sounding like speech survives the window.
        if (voiceLikeness(rms) > DUCK_SCORE) bargeEvidenceRef.current += 1;
        else bargeEvidenceRef.current = Math.max(0, bargeEvidenceRef.current - 2);

        if (bargeEvidenceRef.current >= CONFIRM_FRAMES) {
          duckedRef.current = false;
          bargeEvidenceRef.current = 0;
          duckSpeech(1, 0);
          logVoice('call', 'barge-in-confirmed');
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
      // From `consumed`, not from zero. A continuous session keeps every
      // finalized result in `event.results` for its whole life, so rebuilding
      // from index 0 after a commit re-sent the previous utterance glued to the
      // new one — turn two arrived as "Q1 Q2", turn three as "Q1 Q2 Q3". Each
      // turn re-asked everything already answered, which is what made the loop
      // sound like it was talking to itself.
      let text = '';
      for (let i = consumedRef.current; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      resultLenRef.current = event.results.length;
      text = text.trim();
      if (!text) return;
      if (!transcriptRef.current) logVoice('event', 'onresult-first', text.slice(0, 40));
      transcriptRef.current = text;
      setInterim(text);
      setHearing(true);
    };

    // Never listened for before. It is the only proof the recogniser actually
    // came up: a start() with no onstart is a dead session that still looks
    // alive from the outside.
    recognition.onstart = () => logVoice('event', 'onstart');

    recognition.onerror = (event: any) => {
      const code = event?.error || '';
      // Logged even when benign. 'aborted' is usually harmless, which is
      // exactly why swallowing it silently hid a recogniser that had gone for
      // good — the assumption was never checked against what followed.
      logVoice(code === 'aborted' || code === 'no-speech' ? 'warn' : 'event', 'onerror', code);
      if (code === 'no-speech' || code === 'aborted') return;
      onErrorRef.current?.(code);
    };

    recognition.onend = () => {
      logVoice('event', 'onend', `wantRestart=${wantRestartRef.current} active=${activeRef.current}`);
      recognitionRef.current = null;
      // Chrome ends a continuous session after a stretch of silence. The session
      // is still open, so bring the mic straight back up.
      if (activeRef.current && wantRestartRef.current) {
        setTimeout(() => {
          logVoice('call', 'restart-timer-fired', `wantRestart=${wantRestartRef.current}`);
          startRecognition();
        }, 120);
      }
    };

    recognitionRef.current = recognition;
    try {
      logVoice('call', 'recognition.start', `lang=${recognition.lang}`);
      recognition.start();
    } catch (e: any) {
      // The InvalidStateError case: start() rejected because the previous
      // recogniser has not finished stopping. No onend will follow, so nothing
      // restarts it and the session is over without a single error surfacing.
      logVoice('warn', 'start-threw', e?.name || String(e));
      recognitionRef.current = null;
      onErrorRef.current?.('failed-to-start');
    }
  }, [lang]);

  const stopRecognition = useCallback(() => {
    wantRestartRef.current = false;
    const r = recognitionRef.current;
    recognitionRef.current = null;
    // The ref clears here, synchronously, while the browser's own teardown is
    // still in flight. Anything that reads the ref as "recognition is gone" is
    // reading it too early — which is the divergence this log exists to catch.
    logVoice('call', 'recognition.stop', r ? 'had-instance' : 'no-instance');
    try { r?.stop(); } catch (e: any) { logVoice('warn', 'stop-threw', e?.name || String(e)); }
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
    logVoice('state', `paused=${paused}`);
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

  /**
   * Watches for the failure that has no symptom: the session believes it is
   * listening, the level meter animates off getUserMedia, and SpeechRecognition
   * is gone. Purely diagnostic — it reports the divergence, it does not repair
   * it, because what the repair should be depends on which sequence produced it.
   */
  useEffect(() => {
    if (!active || paused) return;
    const id = setInterval(() => {
      const alive = !!recognitionRef.current;
      const hearingSomething = levelRef.current > floorRef.current + SPEECH_MARGIN;
      if (!alive) {
        logVoice('warn', 'DIVERGENCE', 'listening with no recognition instance');
      } else if (hearingSomething && !transcriptRef.current) {
        // Sound is reaching the analyser but nothing is being transcribed. One
        // sample proves nothing — a pause between words looks identical — so
        // this is a marker to correlate against, not a verdict.
        logVoice('warn', 'audio-without-transcript', `level=${levelRef.current.toFixed(3)}`);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [active, paused]);

  useEffect(() => () => { stop(); }, [stop]);

  return { supported, active, hearing, interim, micLevel, micSpectrum, spectrumBins, start, stop };
}
