import { useCallback, useEffect, useRef, useState } from 'react';
import { chime, primeChimes } from './chime';
import { AdpcmEncoder, decodeAdpcm } from './adpcm';
import { float32ToWav, int16ToWav } from './wav';
import { downscaleImage } from './downscaleImage';
import { VoiceRecovery, recoveredTurns } from './voiceRecovery';

export type LiveState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';

export interface LiveSource {
  id?: string;
  url?: string;
  name: string;
  image?: string;
  images?: import('@akropolys/sdk').EntityImageInput[];
  fields?: Record<string, any>;
}

export interface LiveVoiceExchange {
  heard: string;
  said: string;
  duration?: number;
  userAudioUrl?: string;
  audioUrl?: string;
  // Photos attached and the image rendered this turn, so chat keeps them after voice closes.
  images?: string[];
  visualization?: string;
}

export interface LiveVoiceOptions {
  apiUrl: string;
  siteId: string;

  token: string;
  // The site server's signature over kikuId, for sites that require one.
  proof?: string;
  kikuId?: string;
  // The chat session: a photo parked here is the scene the voice model edits.
  sessionId?: string;
  name?: string;
  storeScene?: (image: string) => Promise<boolean>;

  language?: string;
  voice?: string;

  onExchange?: (exchange: LiveVoiceExchange) => void;
  onRefused?: (code: string) => void;
  onError?: (code: string) => void;

  muted?: boolean;
}

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
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

// A browser cannot set headers on a socket, so the key and the proof ride as subprotocols and stay out of the address.
function voiceProtocols(o: LiveVoiceOptions): string[] {
  return o.proof ? ['akropolys.token.' + o.token, 'akropolys.proof.' + o.proof] : ['akropolys.token.' + o.token];
}

function liveUrl(o: LiveVoiceOptions, voiceOverride?: string): string {
  const base = o.apiUrl.replace(/\/+$/, '');
  const path = base.endsWith('/voice/live') ? base : base + '/voice/live';
  const url = new URL(path, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('siteId', o.siteId);
  if (o.kikuId) url.searchParams.set('kikuId', o.kikuId);
  if (o.sessionId) url.searchParams.set('sessionId', o.sessionId);
  if (o.name) url.searchParams.set('name', o.name);
  if (o.language) url.searchParams.set('language', o.language);
  url.searchParams.set('codec', 'adpcm');
  const v = voiceOverride || o.voice;
  if (v) url.searchParams.set('voice', v);
  return url.toString();
}

export interface LiveTurn {
  role: 'user' | 'assistant';
  text: string;
  done: boolean;
}

// One square in the image row: an attached photo, or a render (pending while it is made).
export interface LiveImage {
  id: number;
  url: string;
  pending: boolean;
  // A photo the visitor attached, still uploading.
  sending?: boolean;
}

export function useLiveVoice(opts: LiveVoiceOptions) {
  const [state, setState] = useState<LiveState>('idle');
  const [hearing, setHearing] = useState(false);
  const [sources, setSources] = useState<LiveSource[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [photos, setPhotos] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const startedRef = useRef(false);
  const recoveryRef = useRef(new VoiceRecovery());
  const recoverRef = useRef<() => boolean>(() => false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedRef = useRef(false);
  const lastCaptureRef = useRef(0);
  const captureResumeAtRef = useRef(0);
  const openOnReadyRef = useRef(false);
  const micAttachRef = useRef<(() => void) | null>(null);
  const lastLoudRef = useRef(0);
  const botSpeakingRef = useRef(false);
  const spokeLoggedRef = useRef(false);
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
  useEffect(() => {
    optsRef.current = opts;
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getAudioTracks()) {
        track.enabled = !opts.muted;
      }
    }
  }, [opts]);

  const readyRef = useRef(false);
  const pendingRef = useRef<ArrayBuffer[]>([]);
  const encoderRef = useRef(new AdpcmEncoder());
  const workletCtxRef = useRef<Promise<AudioContext | null> | null>(null);

  const turnHeardRef = useRef('');
  const turnSaidRef = useRef('');
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const turnsRef = useRef<LiveTurn[]>([]);
  turnsRef.current = turns;
  // Earlier calls in this chat, handed to each new socket so the model remembers them.
  const historyRef = useRef<LiveTurn[]>([]);
  const [images, setImages] = useState<LiveImage[]>([]);
  const imageIdRef = useRef(0);
  // What this turn showed, handed to chat with the exchange.
  const turnImagesRef = useRef<string[]>([]);
  const turnVizRef = useRef<string | undefined>(undefined);
  const turnStartRef = useRef<number | null>(null);
  const turnBotAudioChunksRef = useRef<Float32Array[]>([]);
  const turnUserAudioChunksRef = useRef<Int16Array[]>([]);

  const flushExchange = useCallback(() => {
    const heard = turnHeardRef.current.trim();
    const said = turnSaidRef.current.trim();
    const duration = turnStartRef.current ? Math.max(0.1, (Date.now() - turnStartRef.current) / 1000) : undefined;

    let audioUrl: string | undefined;
    if (turnBotAudioChunksRef.current.length > 0) {
      try {
        const blob = float32ToWav(turnBotAudioChunksRef.current, outRateRef.current);
        audioUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.error('[kiku] failed to encode bot audio wav:', e);
      }
    }

    let userAudioUrl: string | undefined;
    if (turnUserAudioChunksRef.current.length > 0) {
      try {
        const blob = int16ToWav(turnUserAudioChunksRef.current, INPUT_RATE);
        userAudioUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.error('[kiku] failed to encode user audio wav:', e);
      }
    }

    const images = turnImagesRef.current.length ? turnImagesRef.current : undefined;
    const visualization = turnVizRef.current;

    turnHeardRef.current = '';
    turnSaidRef.current = '';
    turnStartRef.current = null;
    turnBotAudioChunksRef.current = [];
    turnUserAudioChunksRef.current = [];
    turnImagesRef.current = [];
    turnVizRef.current = undefined;

    if (!heard && !said && !images && !visualization) return;
    optsRef.current.onExchange?.({ heard, said, duration, userAudioUrl, audioUrl, images, visualization });
  }, []);

  const chirp = useCallback(() => {
    // Silent - no synthetic beeps during live voice
  }, []);

  const sendAudio = useCallback((buf: ArrayBuffer) => {
    lastCaptureRef.current = Date.now();
    if (optsRef.current.muted) return;
    const pcm = new Int16Array(buf);
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 8) {
      const v = Math.abs(pcm[i]);
      if (v > peak) peak = v;
    }
    if (peak > 1200) lastLoudRef.current = Date.now();
    const ws = wsRef.current;
    if (!readyRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;
    // A half-open socket can stay OPEN while its queue grows without bound.
    if (ws.bufferedAmount > 256 * 1024) {
      if (!recoverRef.current()) optsRef.current.onError?.('connection');
      return;
    }
    turnUserAudioChunksRef.current.push(new Int16Array(buf.slice(0)));
    try { ws.send(encoderRef.current.encode(new Int16Array(buf))); }
    catch { if (!recoverRef.current()) optsRef.current.onError?.('connection'); }
  }, []);

  const flushPending = useCallback(() => {
    pendingRef.current = [];
  }, []);

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

  const warmContext = useCallback(() => {
    if (typeof window === 'undefined') return;
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
        replyingRef.current = false;
        setState(s => (s === 'speaking' ? 'listening' : s));
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

  const startHold = useCallback(() => {}, []);

  const teardown = useCallback((finalState: LiveState) => {
    if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    if (connectTimerRef.current !== null) clearTimeout(connectTimerRef.current);
    retryTimerRef.current = connectTimerRef.current = null;
    hasConnectedRef.current = false;
    captureResumeAtRef.current = 0;
    flushExchange();
    const closing = wsRef.current;
    wsRef.current = null;
    try { closing?.close(); } catch { }
    readyRef.current = false;
    pendingRef.current = [];
    workletCtxRef.current = null;
    replyingRef.current = false;
    heldRef.current = [];
    heldSecRef.current = 0;
    stopHold();
    flushPlayback();
    micAttachRef.current = null;
    if (nodeRef.current) nodeRef.current.port.onmessage = null;
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
    startedRef.current = false;
    openOnReadyRef.current = false;
  }, [flushExchange, flushPlayback, stopHold]);

  const stop = useCallback(() => {
    try { wsRef.current?.send(JSON.stringify({ type: 'close' })); } catch {  }
    try { wsRef.current?.close(); } catch {  }
    teardown('idle');
  }, [teardown]);

  const sendOpen = useCallback((ws: WebSocket) => {
    const history = [...historyRef.current, ...turnsRef.current.filter(x => x.done)]
      .filter(x => x.text)
      .map(x => ({ role: x.role, text: x.text }));
    try { ws.send(JSON.stringify({ type: 'open', history })); } catch { }
  }, []);

  const attachWsHandlers = useCallback((ws: WebSocket) => {
    let abandoned = false;
    if (connectTimerRef.current !== null) clearTimeout(connectTimerRef.current);
    connectTimerRef.current = setTimeout(() => {
      if (wsRef.current !== ws || readyRef.current) return;
      if (!recoverRef.current()) {
        optsRef.current.onError?.('connection');
        stop();
      }
    }, 30_000);
    ws.binaryType = 'arraybuffer';
    encoderRef.current = new AdpcmEncoder();
    ws.onopen = () => {
      if (wsRef.current !== ws || !openOnReadyRef.current) return;
      openOnReadyRef.current = false;
      sendOpen(ws);
    };
    ws.onmessage = ev => {
      if (wsRef.current !== ws) return;
      if (ev.data instanceof ArrayBuffer) {
        if (!botSpeakingRef.current) {
          botSpeakingRef.current = true;
          const said = turnSaidRef.current.trim();
          if (said) {
            setTurns(prev => {
              const next = prev.slice();
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'user' && !next[i].done) next[i] = { ...next[i], done: true };
              }
              next.push({ role: 'assistant', text: said, done: false });
              return next;
            });
          }
        }
        if (!spokeLoggedRef.current && lastLoudRef.current) {
          spokeLoggedRef.current = true;
          console.log('[kiku] wait from last speech to first audio: ' + (Date.now() - lastLoudRef.current) + 'ms');
        }
        stopHold();
        const pcm = decodeAdpcm(ev.data);
        turnBotAudioChunksRef.current.push(pcm.slice());
        enqueue(pcm);
        return;
      }
      let f: any;
      try { f = JSON.parse(ev.data); } catch { return; }
      switch (f.type) {
        case 'ready':
          if (connectTimerRef.current !== null) clearTimeout(connectTimerRef.current);
          connectTimerRef.current = null;
          hasConnectedRef.current = true;
          lastCaptureRef.current = Date.now();
          if (f.sampleRate) {
            outRateRef.current = f.sampleRate;
            if (f.sampleRate !== OUTPUT_RATE) {
              console.warn(`[kiku] live audio rate ${f.sampleRate} != context ${OUTPUT_RATE}; per-buffer resampling will click at every chunk seam`);
            }
          }
          if (typeof f.secondsLeft === 'number') setSecondsLeft(f.secondsLeft);
          setPhotos(f.photos === true);
          readyRef.current = true;
          setState('listening');
          flushPending();
          micAttachRef.current?.();
          micAttachRef.current = null;
          // A designed tone, not the model clearing its throat.
          chime('connect', true);
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
          if (f.tool === 'visualize') {
            setImages(prev => (prev.some(i => i.pending) ? prev : [...prev, { id: ++imageIdRef.current, url: '', pending: true }]));
          }
          break;
        case 'viz':
          // A url fills the waiting square; none means the render failed and the square goes.
          if (typeof f.url === 'string' && f.url) {
            turnVizRef.current = f.url;
            setImages(prev => prev.map(i => (i.pending ? { ...i, url: f.url, pending: false } : i)));
          } else {
            setImages(prev => prev.filter(i => !i.pending));
          }
          break;
        case 'heard':
          if (sourcesRef.current.size === 0) playAtRef.current = 0;
          if (!turnStartRef.current) {
            turnStartRef.current = Date.now();
            chime('heard');
          }
          turnHeardRef.current += f.text;
          setTurns(prev => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'user' && !last.done) {
              next[next.length - 1] = { ...last, text: turnHeardRef.current.trim() };
            } else {
              next.push({ role: 'user', text: turnHeardRef.current.trim(), done: false });
            }
            return next;
          });
          setHearing(false);
          setState('thinking');
          startHold();
          break;
        case 'said':
          turnSaidRef.current += f.text;
          if (!botSpeakingRef.current) break;
          setTurns(prev => {
            const next = prev.slice();
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'user' && !next[i].done) next[i] = { ...next[i], done: true };
            }
            const last = next[next.length - 1];
            const text = turnSaidRef.current.trim();
            if (last && last.role === 'assistant' && !last.done) {
              next[next.length - 1] = { ...last, text };
            } else {
              next.push({ role: 'assistant', text, done: false });
            }
            return next;
          });
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
          spokeLoggedRef.current = false;
          botSpeakingRef.current = false;
          lastLoudRef.current = 0;
          setTurns(prev => prev.map(x => (x.done ? x : { ...x, done: true })));
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
          if (f.code === 'session_expiring' && recoverRef.current()) return;
          optsRef.current.onError?.(f.code || 'unavailable');
          stop();
          break;
      }
    };

    ws.onclose = ev => {
      if (wsRef.current !== ws) return;
      if (connectTimerRef.current !== null) clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
      if (VoiceRecovery.canRetry(ev.code) && recoverRef.current()) return;
      if (ev.code === 4402) {
        abandoned = true;
        optsRef.current.onError?.(ev.reason === 'site' ? 'siteLimit' : 'limit');
      }
      teardown('ended');
    };
    // Browsers follow errors with close; decide there so an error cannot tear down
    // the microphone before a recoverable close is handled.
    ws.onerror = () => { if (!abandoned && wsRef.current === ws) console.warn('[kiku] voice transport interrupted'); };
  }, [dropHeld, enqueue, flushExchange, flushPending, flushPlayback, releaseHeld, sendOpen, startHold, stopHold, stop, teardown]);

  const hotReconnect = useCallback((newVoice?: string) => {
    const oldWs = wsRef.current;
    wsRef.current = null; // ignore late frames and close events from the old socket
    readyRef.current = false;
    // Keep what was actually heard/spoken, including an interrupted final turn.
    turnsRef.current = recoveredTurns(turnsRef.current, turnHeardRef.current, turnSaidRef.current);
    setTurns(turnsRef.current);
    setImages(prev => prev.filter(image => !image.pending));
    flushExchange();
    botSpeakingRef.current = false;
    spokeLoggedRef.current = false;
    replyingRef.current = false;
    dropHeld();
    setState('connecting');
    flushPlayback();
    stopHold();
    if (oldWs) {
      try { oldWs.send(JSON.stringify({ type: 'close' })); } catch { }
      try { oldWs.close(); } catch { }
    }
    const o = optsRef.current;
    // A new socket arms and waits; the shopper already tapped, so claim it on open.
    openOnReadyRef.current = true;
    const ws = new WebSocket(liveUrl(o, newVoice), voiceProtocols(o));
    wsRef.current = ws;
    attachWsHandlers(ws);
  }, [attachWsHandlers, dropHeld, flushExchange, flushPlayback, stopHold]);

  const recover = useCallback(() => {
    if (!startedRef.current || !hasConnectedRef.current || !nodeRef.current) return false;
    if (retryTimerRef.current !== null) return true;
    const delay = recoveryRef.current.nextDelay();
    if (delay === null) {
      optsRef.current.onError?.('connection');
      stop();
      return true;
    }
    const oldWs = wsRef.current;
    wsRef.current = null;
    readyRef.current = false;
    if (connectTimerRef.current !== null) clearTimeout(connectTimerRef.current);
    connectTimerRef.current = null;
    try { oldWs?.close(); } catch { }
    flushPlayback();
    dropHeld();
    stopHold();
    setHearing(false);
    setState('connecting');
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (startedRef.current) hotReconnect();
    }, delay);
    return true;
  }, [dropHeld, flushPlayback, hotReconnect, stop, stopHold]);
  recoverRef.current = recover;

  // Mobile browsers can suspend the audio context without closing the socket.
  // Resume capture while visible, and surface a failure if the microphone stays dead.
  useEffect(() => {
    const checkCapture = () => {
      if (!startedRef.current || !readyRef.current || !nodeRef.current || document.visibilityState === 'hidden') return;
      const ctx = ctxRef.current;
      if (!ctx) return;
      const now = Date.now();
      if (now - lastCaptureRef.current < 10_000) { captureResumeAtRef.current = 0; return; }
      if (!captureResumeAtRef.current) {
        captureResumeAtRef.current = now;
        void ctx.resume().catch(() => {});
      } else if (now - captureResumeAtRef.current > 10_000) {
        optsRef.current.onError?.('audio-capture');
        stop();
      }
    };
    const timer = window.setInterval(checkCapture, 2_000);
    document.addEventListener('visibilitychange', checkCapture);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', checkCapture); };
  }, [stop]);

  const currentVoiceRef = useRef(opts.voice);
  useEffect(() => {
    if (currentVoiceRef.current !== opts.voice) {
      currentVoiceRef.current = opts.voice;
      if (wsRef.current && (state === 'listening' || state === 'thinking' || state === 'speaking')) {
        hotReconnect(opts.voice);
      }
    }
  }, [opts.voice, state, hotReconnect]);

  const start = useCallback(async (history: LiveTurn[] = []) => {
    if (startedRef.current && (wsRef.current || retryTimerRef.current !== null)) return;
    startedRef.current = true;
    recoveryRef.current = new VoiceRecovery();
    hasConnectedRef.current = false;
    setState('connecting');
    const o = optsRef.current;
    pendingRef.current = [];
    // This call's own turns; earlier calls arrive as history and are shown by the overlay.
    historyRef.current = history;
    turnsRef.current = [];
    setTurns([]);
    setImages([]);
    turnHeardRef.current = '';
    turnSaidRef.current = '';

    // Resumed inside the tap, the one moment a browser allows it.
    const ctxReady = audioContext();
    ctxRef.current?.resume().catch(() => {});
    primeChimes();

    let ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendOpen(ws);
    } else if (ws && ws.readyState === WebSocket.CONNECTING) {
      openOnReadyRef.current = true;
    } else {
      ws = new WebSocket(liveUrl(o), voiceProtocols(o));
      wsRef.current = ws;
      openOnReadyRef.current = true;
      attachWsHandlers(ws);
    }

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
      const attach = () => {
        if (wsRef.current !== ws || !nodeRef.current) return;
        try { srcNode.connect(inAnalyser); } catch { }
        try { srcNode.connect(node); } catch { }
      };
      if (readyRef.current) {
        attach();
      } else {
        micAttachRef.current = attach;
      }
    } catch {
      optsRef.current.onError?.('audio-worklet');
      stop();
    }
  }, [attachWsHandlers, audioContext, sendAudio, sendOpen, stop]);

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

  const prewarm = useCallback(() => {
    warmContext();
  }, [warmContext]);

  useEffect(() => () => { stop(); }, [stop]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) track.enabled = !opts.muted;
  }, [opts.muted, state]);

  const attachPhoto = useCallback(async (file: File): Promise<boolean> => {
    const store = optsRef.current.storeScene;
    if (!store || !file.type.startsWith('image/')) return false;
    let image: string;
    try {
      image = await downscaleImage(file);
    } catch {
      return false;
    }
    const id = ++imageIdRef.current;
    setImages(prev => [...prev, { id, url: image, pending: false, sending: true }]);
    if (!(await store(image))) {
      setImages(prev => prev.filter(i => i.id !== id));
      return false;
    }
    setImages(prev => prev.map(i => (i.id === id ? { ...i, sending: false } : i)));
    turnImagesRef.current.push(image);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'text',
        text: '(The visitor just attached a photo. You cannot see it. In one short sentence, ask what they would like changed in it.)',
      }));
    }
    return true;
  }, []);

  // A typed question into the live call — how a tapped card asks about itself.
  const ask = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && text.trim()) ws.send(JSON.stringify({ type: 'text', text }));
  }, []);

  return { state, phase: state, hearing, sources, secondsLeft, photos, turns, images, micLevel, micSpectrum, spectrumBins, start, stop, prewarm, attachPhoto, ask };
}
