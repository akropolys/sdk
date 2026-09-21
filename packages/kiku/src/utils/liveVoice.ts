import { useCallback, useEffect, useRef, useState } from 'react';
import { chime } from './chime';
import { AdpcmEncoder, decodeAdpcm } from './adpcm';

export type LiveState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';

export interface LiveSource {
  id?: string;
  url?: string;
  name: string;
  price?: string;
  currency?: string;
  image?: string;
  brand?: string;
  availability?: string;
}

export interface LiveVoiceOptions {
  apiUrl: string;
  siteId: string;

  token: string;
  kikuId?: string;
  name?: string;

  language?: string;
  voice?: string;

  onExchange?: (exchange: { heard: string; said: string; duration?: number }) => void;
  onRefused?: (code: string) => void;
  onError?: (code: string) => void;

  muted?: boolean;
}

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
// Ultra-low latency playback buffer: 80ms initial buffer starts audio instantly
const START_BUFFER_SEC = 0.08;
const REFILL_BUFFER_SEC = 0.12;
const SCHEDULE_LEAD = 0.03;
const FLUSH_FADE = 0.08;
const MAX_PENDING_CHUNKS = 250; // 10s of 40ms chunks held until the server is ready
const HEARING_LEVEL = 0.12;
const HEARING_HOLD_MS = 500;
const IDLE_CLOSE_MS = 60_000;

const WORKLET_SRC = `
class KikuCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / ${INPUT_RATE};
    this._chunk = ${Math.round(INPUT_RATE * 0.04)};
    this._acc = new Int16Array(this._chunk);
    this._n = 0;
    this._pos = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this._pos < ch.length) {
      const i = this._pos | 0;
      const frac = this._pos - i;
      const a = ch[i];
      const b = i + 1 < ch.length ? ch[i + 1] : a;
      const s = a + (b - a) * frac;
      const c = s < -1 ? -1 : s > 1 ? 1 : s;
      this._acc[this._n++] = c < 0 ? c * 0x8000 : c * 0x7fff;
      if (this._n === this._chunk) {
        this.port.postMessage(this._acc.buffer, [this._acc.buffer]);
        this._acc = new Int16Array(this._chunk);
        this._n = 0;
      }
      this._pos += this._ratio;
    }
    this._pos -= ch.length;
    return true;
  }
}
registerProcessor('kiku-capture', KikuCapture);
`;

export function useLiveVoice(opts: LiveVoiceOptions) {
  const [state, setState] = useState<LiveState>('idle');
  const [hearing, setHearing] = useState(false);
  const [sources, setSources] = useState<LiveSource[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const playAtRef = useRef(0);
  const replyingRef = useRef(false);
  const heldRef = useRef<Float32Array[]>([]);
  const heldSecRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const outGainRef = useRef<GainNode | null>(null);
  const outRateRef = useRef(OUTPUT_RATE);

  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  const readyRef = useRef(false);
  const pendingRef = useRef<ArrayBuffer[]>([]);
  const encoderRef = useRef(new AdpcmEncoder());
  const workletCtxRef = useRef<Promise<AudioContext | null> | null>(null);

  const turnHeardRef = useRef('');
  const turnSaidRef = useRef('');
  const turnStartRef = useRef<number | null>(null);

  const flushExchange = useCallback(() => {
    const heard = turnHeardRef.current.trim();
    const said = turnSaidRef.current.trim();
    const duration = turnStartRef.current ? Math.max(0.1, (Date.now() - turnStartRef.current) / 1000) : undefined;
    turnHeardRef.current = '';
    turnSaidRef.current = '';
    turnStartRef.current = null;
    if (!heard && !said) return;
    optsRef.current.onExchange?.({ heard, said, duration });
  }, []);

  const chirp = useCallback(() => {
    // Silent - no synthetic beeps during live voice
  }, []);

  const sendAudio = useCallback((buf: ArrayBuffer) => {
    const ws = wsRef.current;
    if (!readyRef.current || !ws || ws.readyState !== WebSocket.OPEN) {
      const q = pendingRef.current;
      q.push(buf);
      if (q.length > MAX_PENDING_CHUNKS) q.shift();
      return;
    }
    ws.send(encoderRef.current.encode(new Int16Array(buf)));
  }, []);

  const flushPending = useCallback(() => {
    const q = pendingRef.current;
    pendingRef.current = [];
    for (const buf of q) sendAudio(buf);
  }, [sendAudio]);

  // Built once per context and reused, so tapping voice only waits for the mic.
  const audioContext = useCallback((): Promise<AudioContext | null> => {
    const held = ctxRef.current;
    if (workletCtxRef.current && held && held.state !== 'closed') return workletCtxRef.current;
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return Promise.resolve(null);
    const ctx = new AC({ latencyHint: 'interactive', sampleRate: OUTPUT_RATE });
    ctxRef.current = ctx;
    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    workletCtxRef.current = ctx.audioWorklet.addModule(blobUrl)
      .then(() => ctx)
      .catch(() => null)
      .finally(() => URL.revokeObjectURL(blobUrl));
    return workletCtxRef.current;
  }, []);

  const prewarm = useCallback(() => {
    if (typeof window === 'undefined' || wsRef.current) return;
    void audioContext();
  }, [audioContext]);

  const micLevel = useCallback(() => {
    const a = analyserRef.current;
    if (!a) return 0;
    const d = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(d);
    let sum = 0;
    for (let i = 0; i < d.length; i++) { const v = (d[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / d.length) * 4);
  }, []);

  const outbound = state === 'speaking' || state === 'thinking';

  const micSpectrum = useCallback((out: Uint8Array) => {
    const a = outbound ? outAnalyserRef.current : analyserRef.current;
    if (!a || out.length !== a.frequencyBinCount) return false;
    a.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
    return true;
  }, [outbound]);

  const spectrumBins = useCallback(
    () => (outbound ? outAnalyserRef.current : analyserRef.current)?.frequencyBinCount ?? 0,
    [outbound]
  );

  const flushPlayback = useCallback(() => {
    const g = outGainRef.current;
    const ctx = ctxRef.current;
    if (!g || !ctx || ctx.state === 'closed') {
      playAtRef.current = 0;
      for (const src of sourcesRef.current) {
        try { src.onended = null; src.stop(); } catch { }
      }
      sourcesRef.current.clear();
      return;
    }
    const now = ctx.currentTime;
    const fadeEnd = now + FLUSH_FADE;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, fadeEnd);
    g.gain.setValueAtTime(1, fadeEnd);
    for (const src of sourcesRef.current) {
      try { src.onended = null; src.stop(fadeEnd); } catch { }
    }
    sourcesRef.current.clear();
    playAtRef.current = fadeEnd; // next turn must not open inside the fade
  }, []);

  const schedule = useCallback((chunk: Float32Array) => {
    const ctx = ctxRef.current;
    const out = outAnalyserRef.current;
    if (!ctx || !out || chunk.length === 0) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const buf = ctx.createBuffer(1, chunk.length, outRateRef.current);
    buf.getChannelData(0).set(chunk);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);

    const now = ctx.currentTime;
    const at = playAtRef.current > now ? playAtRef.current : now + SCHEDULE_LEAD;
    src.start(at);
    playAtRef.current = at + buf.duration;

    sourcesRef.current.add(src);
    src.onended = () => {
      sourcesRef.current.delete(src);
      if (sourcesRef.current.size === 0) {
        playAtRef.current = 0;
        if (!replyingRef.current) setState(s => (s === 'speaking' ? 'listening' : s));
      }
    };
    setState(s => (s === 'speaking' || s === 'idle' || s === 'ended' ? s : 'speaking'));
  }, []);

  const releaseHeld = useCallback(() => {
    const held = heldRef.current;
    heldRef.current = [];
    heldSecRef.current = 0;
    for (const chunk of held) schedule(chunk);
  }, [schedule]);

  const dropHeld = useCallback(() => {
    heldRef.current = [];
    heldSecRef.current = 0;
  }, []);

  const enqueue = useCallback((chunk: Float32Array) => {
    const ctx = ctxRef.current;
    if (!ctx || chunk.length === 0) return;
    const playing = playAtRef.current > ctx.currentTime;
    if (playing && heldRef.current.length === 0) {
      schedule(chunk);
      return;
    }
    const target = replyingRef.current ? REFILL_BUFFER_SEC : START_BUFFER_SEC;
    heldRef.current.push(chunk);
    heldSecRef.current += chunk.length / outRateRef.current;
    if (heldSecRef.current >= target) {
      replyingRef.current = true;
      releaseHeld();
    }
  }, [schedule, releaseHeld]);

  const holdTimerRef = useRef<any>(null);
  const holdGainRef = useRef<GainNode | null>(null);

  const stopHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    const g = holdGainRef.current;
    const ctx = ctxRef.current;
    if (g && ctx && ctx.state !== 'closed') {
      const now = ctx.currentTime;
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0.0001, now + 0.04);
      } catch {}
      setTimeout(() => {
        try { g.disconnect(); } catch {}
        if (holdGainRef.current === g) holdGainRef.current = null;
      }, 50);
    }
  }, []);

  const startHold = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state === 'closed' || holdTimerRef.current) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const masterHold = ctx.createGain();
    masterHold.gain.setValueAtTime(0.0001, ctx.currentTime);
    masterHold.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.08);
    masterHold.connect(outGainRef.current || ctx.destination);
    holdGainRef.current = masterHold;

    // Gentle warm pentatonic lullaby motif notes: E4, G4, A4, C5, D5, E5
    const motif = [329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
    let noteIdx = 0;

    const playChime = () => {
      const c = ctxRef.current;
      const g = holdGainRef.current;
      if (!c || c.state === 'closed' || !g) return;
      const t = c.currentTime + 0.01;
      const freq = motif[noteIdx % motif.length];
      noteIdx++;

      // Soft sine tone with gentle bell/lullaby decay
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      const noteGain = c.createGain();
      noteGain.gain.setValueAtTime(0.0001, t);
      noteGain.gain.linearRampToValueAtTime(0.55, t + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);

      osc.connect(noteGain);
      noteGain.connect(g);

      osc.start(t);
      osc.stop(t + 0.45);
    };

    playChime();
    holdTimerRef.current = setInterval(playChime, 480);
  }, []);

  const teardown = useCallback((finalState: LiveState) => {
    flushExchange();
    wsRef.current = null;
    readyRef.current = false;
    pendingRef.current = [];
    workletCtxRef.current = null;
    replyingRef.current = false;
    heldRef.current = [];
    heldSecRef.current = 0;
    stopHold();
    flushPlayback();
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    outAnalyserRef.current = null;
    outGainRef.current = null;
    ctxRef.current?.close().catch(() => {  });
    ctxRef.current = null;
    setState(finalState);
    setHearing(false);
    setSources([]);
  }, [flushExchange, flushPlayback, stopHold]);

  const stop = useCallback(() => {
    try { wsRef.current?.send(JSON.stringify({ type: 'close' })); } catch {  }
    try { wsRef.current?.close(); } catch {  }
    teardown('idle');
  }, [teardown]);

  const attachWsHandlers = useCallback((ws: WebSocket) => {
    let abandoned = false;
    ws.binaryType = 'arraybuffer';
    encoderRef.current = new AdpcmEncoder();
    ws.onmessage = ev => {
      if (ev.data instanceof ArrayBuffer) {
        stopHold();
        enqueue(decodeAdpcm(ev.data));
        return;
      }
      let f: any;
      try { f = JSON.parse(ev.data); } catch { return; }
      switch (f.type) {
        case 'ready':
          if (f.sampleRate) {
            outRateRef.current = f.sampleRate;
            if (f.sampleRate !== OUTPUT_RATE) {
              console.warn(`[kiku] live audio rate ${f.sampleRate} != context ${OUTPUT_RATE}; per-buffer resampling will click at every chunk seam`);
            }
          }
          if (typeof f.secondsLeft === 'number') setSecondsLeft(f.secondsLeft);
          readyRef.current = true;
          setState('listening');
          flushPending();
          break;
        case 'hearing':
          if (!turnStartRef.current) turnStartRef.current = Date.now();
          setHearing(true);
          break;
        case 'thinking':
          if (!turnStartRef.current) turnStartRef.current = Date.now();
          setHearing(false);
          setState('thinking');
          startHold();
          break;
        case 'heard':
          turnHeardRef.current += f.text;
          break;
        case 'said':
          turnSaidRef.current += f.text;
          break;
        case 'interrupted':
          replyingRef.current = false;
          dropHeld();
          stopHold();
          flushPlayback();
          chime('interrupt');
          setHearing(false);
          setState('listening');
          break;
        case 'turn_complete':
          releaseHeld();
          replyingRef.current = false;
          stopHold();
          setHearing(false);
          flushExchange();
          break;
        case 'sources':
          if (Array.isArray(f.sources) && f.sources.length) setSources(f.sources);
          break;
        case 'seconds':
          if (typeof f.secondsLeft === 'number') setSecondsLeft(f.secondsLeft);
          break;
        case 'refused':
          optsRef.current.onRefused?.(f.code || 'guest');
          stop();
          break;
        case 'error':
          optsRef.current.onError?.(f.code || 'unavailable');
          stop();
          break;
      }
    };

    ws.onclose = ev => {
      if (wsRef.current !== ws) return;
      if (ev.code === 4402) {
        abandoned = true;
        optsRef.current.onError?.(ev.reason === 'site' ? 'siteLimit' : 'limit');
      }
      teardown('ended');
    };
    ws.onerror = () => { if (!abandoned && wsRef.current === ws) optsRef.current.onError?.('connection'); };
  }, [dropHeld, enqueue, flushExchange, flushPending, flushPlayback, releaseHeld, startHold, stopHold, stop, teardown]);

  const hotReconnect = useCallback((newVoice?: string) => {
    const oldWs = wsRef.current;
    readyRef.current = false;
    setState('connecting');
    flushPlayback();
    stopHold();
    if (oldWs) {
      try { oldWs.send(JSON.stringify({ type: 'close' })); } catch { }
      try { oldWs.close(); } catch { }
    }
    const o = optsRef.current;
    const base = o.apiUrl.replace(/\/+$/, '');
    const path = base.endsWith('/voice/live') ? base : base + '/voice/live';
    const url = new URL(path, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('siteId', o.siteId);
    if (o.kikuId) url.searchParams.set('kikuId', o.kikuId);
    if (o.name) url.searchParams.set('name', o.name);
    if (o.language) url.searchParams.set('language', o.language);
    url.searchParams.set('codec', 'adpcm');
    if (newVoice || o.voice) url.searchParams.set('voice', (newVoice || o.voice)!);

    const ws = new WebSocket(url.toString(), ['akropolys.token.' + o.token]);
    wsRef.current = ws;
    attachWsHandlers(ws);
  }, [attachWsHandlers, flushPlayback, stopHold]);

  const currentVoiceRef = useRef(opts.voice);
  useEffect(() => {
    if (currentVoiceRef.current !== opts.voice) {
      currentVoiceRef.current = opts.voice;
      if (wsRef.current && (state === 'listening' || state === 'thinking' || state === 'speaking')) {
        hotReconnect(opts.voice);
      }
    }
  }, [opts.voice, state, hotReconnect]);

  const start = useCallback(async () => {
    if (wsRef.current) return;
    setState('connecting');
    const o = optsRef.current;
    pendingRef.current = [];

    // Resumed inside the tap, the one moment a browser allows it.
    const ctxReady = audioContext();
    ctxRef.current?.resume().catch(() => {});

    const base = o.apiUrl.replace(/\/+$/, '');
    const path = base.endsWith('/voice/live') ? base : base + '/voice/live';
    const url = new URL(path, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('siteId', o.siteId);
    if (o.kikuId) url.searchParams.set('kikuId', o.kikuId);
    if (o.name) url.searchParams.set('name', o.name);
    if (o.language) url.searchParams.set('language', o.language);
    url.searchParams.set('codec', 'adpcm');
    if (o.voice) url.searchParams.set('voice', o.voice);

    const ws = new WebSocket(url.toString(), ['akropolys.token.' + o.token]);
    wsRef.current = ws;
    attachWsHandlers(ws);

    let stream: MediaStream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw { name: 'NotAllowedError' };
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e: any) {
      try { ws.close(); } catch {  }
      wsRef.current = null;
      setState('idle');
      o.onError?.(e?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture');
      return;
    }
    if (wsRef.current !== ws) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    streamRef.current = stream;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !optsRef.current.muted;
    }

    const ctx = await ctxReady;
    if (wsRef.current !== ws) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    if (!ctx) {
      optsRef.current.onError?.('audio-worklet');
      stop();
      return;
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const inAnalyser = ctx.createAnalyser();
    inAnalyser.fftSize = 1024;
    inAnalyser.smoothingTimeConstant = 0.25;
    analyserRef.current = inAnalyser;

    const outGain = ctx.createGain();
    outGain.gain.value = 1;
    outGain.connect(ctx.destination);
    outGainRef.current = outGain;

    const outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 1024;
    outAnalyser.smoothingTimeConstant = 0.25;
    outAnalyser.connect(outGain);
    outAnalyserRef.current = outAnalyser;

    try {
      const node = new AudioWorkletNode(ctx, 'kiku-capture');
      nodeRef.current = node;
      node.port.onmessage = e => sendAudio(e.data);
      const srcNode = ctx.createMediaStreamSource(stream);
      srcNode.connect(inAnalyser);
      srcNode.connect(node);
    } catch {
      optsRef.current.onError?.('audio-worklet');
      stop();
    }
  }, [attachWsHandlers, audioContext, sendAudio, stop]);

  // The model sends no partial transcripts, so "hearing" comes from the mic itself.
  useEffect(() => {
    if (state !== 'listening') {
      setHearing(false);
      return;
    }
    let lastLoud = 0;
    let on = false;
    // Replies re-enter listening, so this clock only runs while nobody is talking.
    const quietSince = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      if (!optsRef.current.muted && micLevel() > HEARING_LEVEL) lastLoud = now;
      if (now - Math.max(lastLoud, quietSince) > IDLE_CLOSE_MS) {
        window.clearInterval(id);
        optsRef.current.onError?.('idle');
        stop();
        return;
      }
      const next = now - lastLoud < HEARING_HOLD_MS;
      if (next !== on) {
        on = next;
        setHearing(next);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [state, micLevel, stop]);

  useEffect(() => () => { stop(); }, [stop]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) track.enabled = !opts.muted;
  }, [opts.muted, state]);

  return { state, phase: state, hearing, sources, secondsLeft, micLevel, micSpectrum, spectrumBins, start, stop, prewarm };
}
