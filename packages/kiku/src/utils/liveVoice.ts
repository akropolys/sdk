import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'ended';

/** Shaped as the chat stream's ChatSource so both paths render one card. */
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
  /** Site token. Sent as a subprotocol — a browser WebSocket has no headers. */
  token: string;
  kikuId?: string;
  /** Language NAME, e.g. "Persian" — the same value the text chat resolves. */
  language?: string;
  voice?: string;
  onHeard?: (text: string) => void;
  onSaid?: (text: string) => void;
  onRefused?: (code: string) => void;
  onError?: (code: string) => void;
}

const INPUT_RATE = 16000;

// Captures microphone audio, downsamples to the 16kHz the Live API expects and
// posts PCM16 back to the main thread. A worklet rather than ScriptProcessor
// because this runs on the audio thread — a dropped buffer here is a dropped
// syllable, and ScriptProcessor competes with React for the main thread.
//
// Inlined as a Blob rather than shipped as a separate file: the widget is
// embedded in merchant pages under their own CSP and asset pipeline, and a
// second network-fetched module is one more thing to be blocked or mis-served.
const WORKLET_SRC = `
class KikuCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / ${INPUT_RATE};
    // ~40ms of 16kHz audio per message. A render quantum is 128 frames, so
    // sending per block meant ~375 socket writes a second, each with its own
    // JSON envelope and base64 expansion — enough main-thread work to add the
    // very latency the small chunks were meant to avoid. 40ms stays well under
    // the endpointing window while cutting the write rate by an order of
    // magnitude.
    this._chunk = ${Math.round(INPUT_RATE * 0.04)};
    this._acc = new Int16Array(this._chunk);
    this._n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    // Nearest-neighbour decimation. Speech at 16kHz survives it well and it
    // costs nothing; a polyphase filter would be measurably better and is not
    // worth an audio-thread allocation per block.
    const n = Math.floor(ch.length / this._ratio);
    for (let i = 0; i < n; i++) {
      const s = ch[Math.floor(i * this._ratio)];
      const c = s < -1 ? -1 : s > 1 ? 1 : s;
      this._acc[this._n++] = c < 0 ? c * 0x8000 : c * 0x7fff;
      if (this._n === this._chunk) {
        this.port.postMessage(this._acc.buffer, [this._acc.buffer]);
        this._acc = new Int16Array(this._chunk);
        this._n = 0;
      }
    }
    return true;
  }
}
registerProcessor('kiku-capture', KikuCapture);
`;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on
  // anything longer than a few tens of kilobytes.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(s);
}

function fromBase64(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}

export function useLiveVoice(opts: LiveVoiceOptions) {
  const [state, setState] = useState<LiveState>('idle');
  const [heard, setHeard] = useState('');
  const [said, setSaid] = useState('');
  // What the assistant is talking about, pushed when retrieval returns rather
  // than inferred afterwards from the words it chose.
  const [sources, setSources] = useState<LiveSource[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Playback scheduling. Output is a stream of PCM chunks, not discrete files,
  // so each is scheduled to start exactly where the previous one ends — gaps
  // between them are audible as a stutter in the middle of a word.
  const playAtRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const outRateRef = useRef(24000);

  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  /** Live input amplitude, 0..1 — drives the waveform while listening. */
  const micLevel = useCallback(() => {
    const a = analyserRef.current;
    if (!a) return 0;
    const d = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(d);
    let sum = 0;
    for (let i = 0; i < d.length; i++) { const v = (d[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / d.length) * 4);
  }, []);

  const micSpectrum = useCallback((out: Uint8Array) => {
    const a = state === 'speaking' ? outAnalyserRef.current : analyserRef.current;
    if (!a || out.length !== a.frequencyBinCount) return false;
    a.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
    return true;
  }, [state]);

  const spectrumBins = useCallback(
    () => (state === 'speaking' ? outAnalyserRef.current : analyserRef.current)?.frequencyBinCount ?? 0,
    [state]
  );

  /**
   * Drops everything queued for playback. Called on `interrupted`, which the
   * model sends when it detects the shopper talking over it — anything already
   * buffered is answering a question they have moved on from, and playing it
   * out is exactly the talking-over this rewrite exists to end.
   */
  const flushPlayback = useCallback(() => {
    for (const src of sourcesRef.current) {
      try { src.onended = null; src.stop(); } catch { /* already ended */ }
    }
    sourcesRef.current.clear();
    playAtRef.current = 0;
  }, []);

  const enqueue = useCallback((pcm: Int16Array) => {
    const ctx = ctxRef.current;
    const out = outAnalyserRef.current;
    if (!ctx || !out || pcm.length === 0) return;

    const rate = outRateRef.current;
    const buf = ctx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);

    // A small lead so the first chunk is not scheduled in the past, which the
    // browser renders as a click.
    const now = ctx.currentTime;
    const at = Math.max(now + 0.02, playAtRef.current || now + 0.02);
    src.start(at);
    playAtRef.current = at + buf.duration;

    sourcesRef.current.add(src);
    src.onended = () => {
      sourcesRef.current.delete(src);
      if (sourcesRef.current.size === 0) setState(s => (s === 'speaking' ? 'listening' : s));
    };
    setState(s => (s === 'listening' || s === 'connecting' ? 'speaking' : s));
  }, []);

  const stop = useCallback(() => {
    try { wsRef.current?.send(JSON.stringify({ type: 'close' })); } catch { /* closing */ }
    try { wsRef.current?.close(); } catch { /* already closed */ }
    wsRef.current = null;
    flushPlayback();
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    outAnalyserRef.current = null;
    ctxRef.current?.close().catch(() => { /* ignore */ });
    ctxRef.current = null;
    setState('idle');
    setHeard('');
    setSources([]);
  }, [flushPlayback]);

  const start = useCallback(async () => {
    if (wsRef.current) return;
    setState('connecting');
    const o = optsRef.current;

    let stream: MediaStream;
    try {
      // AEC matters even though the model does its own interruption detection:
      // without it the assistant's own voice is captured and streamed back as
      // shopper speech, and the model interrupts itself.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e: any) {
      setState('idle');
      o.onError?.(e?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture');
      return;
    }
    streamRef.current = stream;

    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;

    const inAnalyser = ctx.createAnalyser();
    inAnalyser.fftSize = 1024;
    inAnalyser.smoothingTimeConstant = 0.25;
    analyserRef.current = inAnalyser;

    const outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 1024;
    outAnalyser.smoothingTimeConstant = 0.25;
    outAnalyser.connect(ctx.destination);
    outAnalyserRef.current = outAnalyser;

    const base = o.apiUrl.replace(/\/+$/, '');
    const url = new URL(base + '/voice/live', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('siteId', o.siteId);
    if (o.kikuId) url.searchParams.set('kikuId', o.kikuId);
    if (o.language) url.searchParams.set('language', o.language);
    if (o.voice) url.searchParams.set('voice', o.voice);

    // The token rides the subprotocol rather than the query string: URLs are
    // logged by every proxy between here and Cloud Run.
    const ws = new WebSocket(url.toString(), ['akropolys.token.' + o.token]);
    wsRef.current = ws;

    ws.onmessage = ev => {
      let f: any;
      try { f = JSON.parse(ev.data); } catch { return; }
      switch (f.type) {
        case 'ready':
          if (f.sampleRate) outRateRef.current = f.sampleRate;
          if (typeof f.secondsLeft === 'number') setSecondsLeft(f.secondsLeft);
          setState('listening');
          break;
        case 'audio':
          if (f.audio) enqueue(fromBase64(f.audio));
          break;
        case 'heard':
          setHeard(prev => prev + f.text);
          optsRef.current.onHeard?.(f.text);
          break;
        case 'said':
          setSaid(prev => prev + f.text);
          optsRef.current.onSaid?.(f.text);
          break;
        case 'interrupted':
          flushPlayback();
          setState('listening');
          break;
        case 'sources':
          if (Array.isArray(f.sources) && f.sources.length) setSources(f.sources);
          break;
        case 'turn_complete':
          setHeard('');
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

    ws.onclose = () => { if (wsRef.current === ws) { wsRef.current = null; setState('ended'); } };
    ws.onerror = () => optsRef.current.onError?.('connection');

    ws.onopen = async () => {
      try {
        const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);

        const node = new AudioWorkletNode(ctx, 'kiku-capture');
        nodeRef.current = node;
        node.port.onmessage = e => {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify({ type: 'audio', audio: toBase64(e.data) }));
        };
        const srcNode = ctx.createMediaStreamSource(stream);
        srcNode.connect(inAnalyser);
        srcNode.connect(node);
        // Not connected to destination: the capture node's own output is the
        // shopper's microphone, and routing it to the speakers is feedback.
      } catch (e: any) {
        optsRef.current.onError?.('audio-worklet');
        stop();
      }
    };
  }, [enqueue, flushPlayback, stop]);

  useEffect(() => () => { stop(); }, [stop]);

  return { state, heard, said, sources, secondsLeft, micLevel, micSpectrum, spectrumBins, start, stop };
}
