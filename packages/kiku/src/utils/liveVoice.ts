import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';

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
  /**
   * One completed spoken turn: what the shopper said and what came back.
   * Fires on turn_complete rather than per chunk, so the caller receives whole
   * exchanges instead of having to reassemble a stream of fragments.
   */
  onExchange?: (exchange: { heard: string; said: string }) => void;
  onRefused?: (code: string) => void;
  onError?: (code: string) => void;
  /**
   * Hold the microphone without tearing the session down. Disables the track
   * itself rather than only dropping frames, so the browser's own recording
   * indicator goes dark too — a mute that leaves the tab showing "recording" is
   * not a mute anyone should be asked to trust.
   */
  muted?: boolean;
}

const INPUT_RATE = 16000;

// Captures microphone audio, downsamples to the 16kHz the Live API expects and posts PCM16 back to the main thread.
const WORKLET_SRC = `
class KikuCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / ${INPUT_RATE};
    // ~40ms of 16kHz audio per message.
    this._chunk = ${Math.round(INPUT_RATE * 0.04)};
    this._acc = new Int16Array(this._chunk);
    this._n = 0;
    // Fractional read position, carried across blocks. Flooring per block
    // dropped the remainder every 128 frames — ~1% of samples at 44.1kHz,
    // which is ~600ms of clock skew a minute against the model's timeline.
    this._pos = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    // Nearest-neighbour decimation.
    while (this._pos < ch.length) {
      const i = this._pos | 0;
      // Linear interpolation, not nearest neighbour: at non-integer ratios
      // nearest neighbour adds audible jitter to the very envelope the
      // endpoint detector reads.
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
  const [hearing, setHearing] = useState(false);
  // What the assistant is talking about, pushed when retrieval returns rather
  // than inferred afterwards from the words it chose.
  const [sources, setSources] = useState<LiveSource[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Playback scheduling.
  const playAtRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const outRateRef = useRef(24000);

  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  // The microphone and the session are acquired in parallel, so capture waits
  // for whichever finishes last. Streaming before the model is listening buries
  // the opening words in a socket buffer, and they arrive as a burst the
  // endpoint detector reads as one long unfinished turn.
  const readyRef = useRef(false);
  const armCaptureRef = useRef<(() => void) | null>(null);

  // The turn being spoken right now, accumulated from the transcript frames.
  const turnHeardRef = useRef('');
  const turnSaidRef = useRef('');

  /**
   * Hands a finished exchange to the caller and clears the buffers.
   *
   * A turn the model never transcribed is dropped rather than reported: a
   * cough or a barge-in that produced no words would otherwise append an empty
   * message to the transcript.
   */
  const flushExchange = useCallback(() => {
    const heard = turnHeardRef.current.trim();
    const said = turnSaidRef.current.trim();
    turnHeardRef.current = '';
    turnSaidRef.current = '';
    if (!heard && !said) return;
    optsRef.current.onExchange?.({ heard, said });
  }, []);

  /**
   * A short rising cue at the moment the microphone actually opens.
   *
   * Capture cannot arm until the session is ready, so there is a real window —
   * roughly a second — where the interface is up and the mic is not live. People
   * filled it by talking, and lost the front of their first sentence. A phone
   * call solves this with a connect tone; so does this.
   */
  const chirp = useCallback(() => {
    const ctx = ctxRef.current;
    const out = outAnalyserRef.current;
    if (!ctx || !out) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(out);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    // Two steps up: an opening gesture rather than a notification.
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.09);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.24);
  }, []);

  const beginCapture = useCallback(() => {
    if (!readyRef.current) return;
    const arm = armCaptureRef.current;
    if (!arm) return;
    armCaptureRef.current = null;
    arm();
    chirp();
  }, [chirp]);

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

  // Thinking counts as output: the hold tone is what is audible, so it is what
  // the filament should be shaped by.
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

  /** Drops everything queued for playback. */
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
    setState(s => (s === 'speaking' || s === 'idle' || s === 'ended' ? s : 'speaking'));
  }, []);

  // Function calling on this model is synchronous: the model says nothing at
  // all from the moment it asks for a search until the result is back. Silence
  // there reads as a dropped call, so the widget holds the floor itself — two
  // soft tones breathing under the waveform, synthesized rather than fetched so
  // it costs nothing and works in every language.
  const holdRef = useRef<{ stop: () => void } | null>(null);

  const stopHold = useCallback(() => {
    holdRef.current?.stop();
    holdRef.current = null;
  }, []);

  const startHold = useCallback(() => {
    const ctx = ctxRef.current;
    const out = outAnalyserRef.current;
    if (!ctx || !out || holdRef.current) return;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(out);

    // A fifth apart, quiet, slowly pulsing — present without competing with
    // the answer that follows it.
    const oscs = [220, 330].map((hz, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.28;
      o.connect(g).connect(gain);
      o.start();
      return o;
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 0.25);

    holdRef.current = {
      stop: () => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        // Faded, not cut: an abrupt stop is a click right before the answer.
        gain.gain.linearRampToValueAtTime(0, t + 0.18);
        for (const o of [...oscs, lfo]) {
          try { o.stop(t + 0.2); } catch { /* already stopped */ }
        }
      },
    };
  }, []);

  // Releases everything the session holds. Shared by stop() and by the socket
  // closing on its own — the session budget running out, a refusal, or the
  // provider dropping. Only stop() knew how to do this before, so a
  // server-initiated close left the microphone open with the tab's recording
  // indicator lit, and a hold tone playing with no UI left to stop it.
  const teardown = useCallback((finalState: LiveState) => {
    // Closing mid-turn still happened: keep whatever was said rather than
    // discarding the exchange the shopper just had.
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
    ctxRef.current?.close().catch(() => { /* ignore */ });
    ctxRef.current = null;
    setState(finalState);
    setHearing(false);
    setSources([]);
  }, [flushExchange, flushPlayback, stopHold]);

  const stop = useCallback(() => {
    try { wsRef.current?.send(JSON.stringify({ type: 'close' })); } catch { /* closing */ }
    try { wsRef.current?.close(); } catch { /* already closed */ }
    teardown('idle');
  }, [teardown]);

  const start = useCallback(async () => {
    if (wsRef.current) return;
    setState('connecting');
    const o = optsRef.current;

    // Started before the microphone, not after it. The permission prompt on a
    // first visit is seconds long, and the session handshake used to wait
    // behind all of it.
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
          readyRef.current = true;
          setState('listening');
          beginCapture();
          break;
        case 'audio':
          stopHold();
          if (f.audio) enqueue(fromBase64(f.audio));
          break;
        // The model has recognised speech, which the mic level alone cannot
        // tell anyone: a loud room moves the waveform just as well.
        case 'hearing':
          setHearing(true);
          break;
        case 'thinking':
          setHearing(false);
          setState('thinking');
          startHold();
          break;
        // Collected in refs, never in state: the overlay deliberately shows no
        // running transcript, so re-rendering per fragment would buy nothing
        // and cost a render on every syllable.
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

    ws.onclose = () => { if (wsRef.current === ws) teardown('ended'); };
    // Closing a socket that is still CONNECTING fires an error event, so a
    // failure we caused ourselves — a mic we could not open — would arrive here
    // and be reported as a network fault. The shopper was then told to check a
    // connection that was fine, while the real cause went unmentioned.
    let abandoned = false;
    ws.onerror = () => { if (!abandoned) optsRef.current.onError?.('connection'); };

    let stream: MediaStream;
    try {
      // An insecure origin has no navigator.mediaDevices at all, so reaching for
      // getUserMedia there throws a TypeError rather than a permissions error.
      // Named explicitly, since "not-allowed" is what maps to the message that
      // tells the shopper to use https.
      if (!navigator.mediaDevices?.getUserMedia) throw { name: 'NotAllowedError' };
      // AEC matters even though the model does its own interruption detection:
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e: any) {
      abandoned = true;
      try { ws.close(); } catch { /* never opened */ }
      wsRef.current = null;
      setState('idle');
      o.onError?.(e?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture');
      return;
    }
    // The socket is opened ahead of the permission prompt, so it can die while
    // the prompt is still up — a refusal, or the handshake timing out. teardown
    // already ran and found nothing to release, and nothing will run again, so
    // adopting this stream now would leave the microphone open for good.
    if (wsRef.current !== ws) {
      stream.getTracks().forEach(t => t.stop());
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

    try {
      const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);
      // Second await, same window: teardown may have closed this context while
      // the worklet was loading, and building nodes on it would throw into the
      // catch below and report an audio fault for a socket that simply ended.
      if (wsRef.current !== ws) return;

      const node = new AudioWorkletNode(ctx, 'kiku-capture');
      nodeRef.current = node;
      node.port.onmessage = e => {
        if (ws.readyState !== WebSocket.OPEN) return;
        // Muting disables the track, so what arrives here is already digital
        // silence — and it is deliberately still sent. Cutting the stream dead
        // instead leaves the server's endpointing waiting on an utterance that
        // never finishes, so the turn never closes and the model has nothing to
        // reply to; silence is what actually ends a turn. It also keeps the
        // socket warm, which is why unmuting resumes instantly with none of the
        // preparation the first connection needs.
        ws.send(JSON.stringify({ type: 'audio', audio: toBase64(e.data) }));
      };
      const srcNode = ctx.createMediaStreamSource(stream);
      armCaptureRef.current = () => {
        srcNode.connect(inAnalyser);
        srcNode.connect(node);
        // Not connected to destination: the capture node's own output is the
        // shopper's microphone, and routing it to the speakers is feedback.
      };
      beginCapture();
    } catch {
      optsRef.current.onError?.('audio-worklet');
      stop();
    }
  }, [beginCapture, enqueue, flushExchange, flushPlayback, startHold, stopHold, stop, teardown]);

  useEffect(() => () => { stop(); }, [stop]);

  // Muting has to reach the track, not just the send path. Leaving the track
  // enabled kept the tab's recording dot lit and the OS mic indicator on, which
  // is indistinguishable from still being listened to — and the session is long
  // lived, so this runs whenever the toggle moves, not only at start.
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) track.enabled = !opts.muted;
  }, [opts.muted, state]);

  return { state, hearing, sources, secondsLeft, micLevel, micSpectrum, spectrumBins, start, stop };
}
