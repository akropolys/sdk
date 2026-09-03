import { useCallback, useEffect, useRef, useState } from 'react';

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

  language?: string;
  voice?: string;

  onExchange?: (exchange: { heard: string; said: string }) => void;
  onRefused?: (code: string) => void;
  onError?: (code: string) => void;

  muted?: boolean;
}

const INPUT_RATE = 16000;

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

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
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
  const [hearing, setHearing] = useState(false);
  const [sources, setSources] = useState<LiveSource[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const playAtRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const outRateRef = useRef(24000);

  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  const readyRef = useRef(false);
  const armCaptureRef = useRef<(() => void) | null>(null);

  const turnHeardRef = useRef('');
  const turnSaidRef = useRef('');

  const flushExchange = useCallback(() => {
    const heard = turnHeardRef.current.trim();
    const said = turnSaidRef.current.trim();
    turnHeardRef.current = '';
    turnSaidRef.current = '';
    if (!heard && !said) return;
    optsRef.current.onExchange?.({ heard, said });
  }, []);

  const chirp = useCallback(() => {
    // Silent - no synthetic beeps during live voice
  }, []);

  const beginCapture = useCallback(() => {
    if (!readyRef.current) return;
    if (ctxRef.current && ctxRef.current.state === 'suspended') {
      ctxRef.current.resume().catch(() => {});
    }
    const arm = armCaptureRef.current;
    if (!arm) return;
    armCaptureRef.current = null;
    arm();
  }, []);

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
    for (const src of sourcesRef.current) {
      try { src.onended = null; src.stop(); } catch {  }
    }
    sourcesRef.current.clear();
    playAtRef.current = 0;
  }, []);

  const enqueue = useCallback((pcm: Int16Array) => {
    const ctx = ctxRef.current;
    const out = outAnalyserRef.current;
    if (!ctx || !out || pcm.length === 0) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const rate = outRateRef.current;
    const buf = ctx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    const len = pcm.length;
    for (let i = 0; i < len; i++) {
      ch[i] = pcm[i] / 0x8000;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);

    const now = ctx.currentTime;
    const at = Math.max(now + 0.01, playAtRef.current || now + 0.01);
    src.start(at);
    playAtRef.current = at + buf.duration;

    sourcesRef.current.add(src);
    src.onended = () => {
      sourcesRef.current.delete(src);
      if (sourcesRef.current.size === 0) {
        playAtRef.current = 0;
        setState(s => (s === 'speaking' ? 'listening' : s));
      }
    };
    setState(s => (s === 'speaking' || s === 'idle' || s === 'ended' ? s : 'speaking'));
  }, []);

  const stopHold = useCallback(() => {
    // Silent - no drone
  }, []);

  const startHold = useCallback(() => {
    // Silent - clean natural voice only
  }, []);

  const teardown = useCallback((finalState: LiveState) => {
    flushExchange();
    wsRef.current = null;
    readyRef.current = false;
    armCaptureRef.current = null;
    stopHold();
    flushPlayback();
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    outAnalyserRef.current = null;
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
    ws.onmessage = ev => {
      let f: any;
      try { f = JSON.parse(ev.data); } catch { return; }
      switch (f.type) {
        case 'ready':
          if (f.sampleRate) outRateRef.current = f.sampleRate;
          if (typeof f.secondsLeft === 'number') setSecondsLeft(f.secondsLeft);
          readyRef.current = true;
          setState('listening');
          beginCapture();
          break;
        case 'audio':
          stopHold();
          if (f.audio) enqueue(fromBase64(f.audio));
          break;
        case 'hearing':
          setHearing(true);
          break;
        case 'thinking':
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
          stopHold();
          flushPlayback();
          setHearing(false);
          setState('listening');
          break;
        case 'turn_complete':
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
  }, [beginCapture, enqueue, flushExchange, flushPlayback, startHold, stopHold, stop, teardown]);

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
    const url = new URL(base + '/voice/live', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('siteId', o.siteId);
    if (o.kikuId) url.searchParams.set('kikuId', o.kikuId);
    if (o.language) url.searchParams.set('language', o.language);
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

    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      if (!ctxRef.current || ctxRef.current.state === 'closed') {
        ctxRef.current = new AC({ latencyHint: 'interactive' });
      }
      if (ctxRef.current.state === 'suspended') {
        ctxRef.current.resume().catch(() => {});
      }
    }

    const base = o.apiUrl.replace(/\/+$/, '');
    const url = new URL(base + '/voice/live', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('siteId', o.siteId);
    if (o.kikuId) url.searchParams.set('kikuId', o.kikuId);
    if (o.language) url.searchParams.set('language', o.language);
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
          autoGainControl: false,
          channelCount: 1,
        },
      });
    } catch (e: any) {
      abandoned = true;
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

    const ctx = ctxRef.current && ctxRef.current.state !== 'closed' ? ctxRef.current : (AC ? new AC({ latencyHint: 'interactive' }) : null);
    if (!ctx) return;
    ctxRef.current = ctx;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const inAnalyser = ctx.createAnalyser();
    inAnalyser.fftSize = 1024;
    inAnalyser.smoothingTimeConstant = 0.25;
    analyserRef.current = inAnalyser;

    const outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 1024;
    outAnalyser.smoothingTimeConstant = 0.25;
    outAnalyser.connect(ctx.destination);
    outAnalyserRef.current = outAnalyser;

    try {
      const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);
      if (wsRef.current !== ws) {
        stream.getTracks().forEach(t => t.stop());
        ctx.close().catch(() => {});
        return;
      }

      const node = new AudioWorkletNode(ctx, 'kiku-capture');
      nodeRef.current = node;
      node.port.onmessage = e => {
        const curWs = wsRef.current;
        if (!curWs || curWs.readyState !== WebSocket.OPEN) return;
        curWs.send(JSON.stringify({ type: 'audio', audio: toBase64(e.data) }));
      };
      const srcNode = ctx.createMediaStreamSource(stream);
      armCaptureRef.current = () => {
        srcNode.connect(inAnalyser);
        srcNode.connect(node);
      };
      beginCapture();
    } catch {
      optsRef.current.onError?.('audio-worklet');
      stop();
    }
  }, [beginCapture, enqueue, flushExchange, flushPlayback, startHold, stopHold, stop, teardown]);

  useEffect(() => () => { stop(); }, [stop]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) track.enabled = !opts.muted;
  }, [opts.muted, state]);

  return { state, phase: state, hearing, sources, secondsLeft, micLevel, micSpectrum, spectrumBins, start, stop };
}
