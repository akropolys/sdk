import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAkropolysContext } from '../Provider';
import { ChatMessage, ChatSource, VizEvent } from '../stream';
import { ChatAction, ChatAttachment, CaptureTarget } from '../types';
import { resolveDisplayFields } from '../client';

interface UseKikuOptions {
  initialMessages?: ChatMessage[];
  onToken?: (token: string) => void;
  onMeta?: (meta: any) => void;
  onDone?: (fullMessage: string) => void;
  onError?: (error: Error) => void;
}

interface UseKikuReturn {
  messages: ChatMessage[];
  sources: ChatSource[];
  referencedIds: string[];
  loading: boolean;
  streaming: boolean;
  error: string | null;
  errorCode: string | null;
  lastAction: ChatAction | null;
  lastIntent: string | null;
  allowedActions: string[] | null;
  send: (query: string, displayQuery?: string, attachments?: ChatAttachment[], forcedIntent?: string, captureTargets?: CaptureTarget[]) => Promise<void>;
  /** The message waiting for the current turn to finish, or null. Deliberately
   *  kept out of `messages` until it is dispatched — every stream write targets
   *  the last message and expects it to be the assistant's. */
  queuedMessage: ChatMessage | null;
  /** Interrupts the current turn and dispatches the queued message right away. */
  sendQueuedNow: () => void;
  /**
   * Records a spoken exchange in the transcript. Voice runs its own session
   * with its own context, so nothing said aloud reached the text history —
   * a typed follow-up after a call could not resolve so much as a pronoun.
   */
  appendSpokenExchange: (heard: string, said: string) => void;
  stop: () => void;
  stopped: boolean;
  /** true when the stream died mid-answer (network, provider) — a partial answer is on screen and continueGenerating can resume it */
  interrupted: boolean;
  continueGenerating: () => void;
  reset: () => void;
}

// A send() that arrived while the previous turn was still in flight, held
// until that turn settles.
interface PendingSend {
  query: string;
  displayQuery?: string;
  attachments?: ChatAttachment[];
  forcedIntent?: string;
  captureTargets?: CaptureTarget[];
}

interface SpokenExchange {
  heard: string;
  said: string;
}

function appendSpoken(prev: ChatMessage[], heard: string, said: string): ChatMessage[] {
  const next = [...prev];
  if (heard) next.push({ role: 'user', content: heard, spoken: true });
  if (said) next.push({ role: 'assistant', content: said, spoken: true });
  return next;
}

const CONTINUE_QUERY =
  'Continue your previous answer exactly where it stopped. Do not repeat anything already written — just carry on from the last character.';

// Fills a raw ChatSource's display fields (name/price/image/brand/currency) from
// the developer's display config, leaving any value the server already set.
function enrichSources(sources: ChatSource[], display?: import('../types').DisplayConfig): ChatSource[] {
  return sources.map(s => {
    const d = resolveDisplayFields(s.fields || s, display);
    return {
      ...s,
      name: s.name || d.title,
      price: s.price || d.price,
      image: s.image || d.image,
      brand: s.brand || d.subtitle,
      // No hardcoded fallback: labelling a USD listing as KES misstates the
      // price. Prefer the entity's own currency field, then a code embedded in
      // the price string, then nothing — the card renders the bare number
      // rather than inventing a denomination.
      currency:
        s.currency ||
        (typeof (s.fields as any)?.currency === 'string' ? (s.fields as any).currency : '') ||
        (typeof d.price === 'string' ? d.price.match(/[A-Z]{3}/)?.[0] : '') ||
        undefined,
    };
  });
}

export function useKiku(options: UseKikuOptions = {}): UseKikuReturn {
  const client = useAkropolysContext();
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages ?? []);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [referencedIds, setReferencedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept beside the message, not folded into it: the message is the server's
  // English, and this is the only thing that can look up the shopper's own.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<ChatAction | null>(null);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  // Which action tags this site+plan actually permits, as resolved by the
  // server each turn. null = not yet known (before the first reply).
  const [allowedActions, setAllowedActions] = useState<string[] | null>(null);
  const activeStreamRef = useRef<any | null>(null);
  // A second send() while a turn is in flight queues here instead of racing
  // the stream that's already running — the two were sharing one `loading`
  // flag that goes false on the first token, long before the turn is done.
  const pendingRef = useRef<PendingSend | null>(null);
  // Held beside the transcript, not inside it: consumeStream writes every
  // token, thought and status into messages[length-1] on the assumption that
  // it is the assistant's turn. A queued user bubble sitting there instead
  // silently swallowed the entire answer.
  const [queuedMessage, setQueuedMessage] = useState<ChatMessage | null>(null);
  // Spoken turns that landed while a text turn was streaming, waiting for it to
  // settle. The voice socket fires outside React's render, so the flags it
  // checks have to be refs — a closure over `loading` would be a stale read.
  const spokenQueueRef = useRef<SpokenExchange[]>([]);
  const loadingRef = useRef(false);
  const streamingRef = useRef(false);
  loadingRef.current = loading;
  streamingRef.current = streaming;

  // Streaming pace buffer — decouples on-screen typing speed from how fast (or
  // bursty) the network delivers tokens, so a fast backend still "types" smoothly.
  const targetTextRef = useRef('');
  const displayedLenRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const streamDoneRef = useRef(false);
  const paceClockRef = useRef(0);
  const paceCarryRef = useRef(0);

  const stopPacing = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Keep references to options callbacks to avoid hook dependencies issues
  const onTokenRef = useRef(options.onToken);
  const onMetaRef = useRef(options.onMeta);
  const onDoneRef = useRef(options.onDone);
  const onErrorRef = useRef(options.onError);

  useEffect(() => {
    onTokenRef.current = options.onToken;
    onMetaRef.current = options.onMeta;
    onDoneRef.current = options.onDone;
    onErrorRef.current = options.onError;
  }, [options.onToken, options.onMeta, options.onDone, options.onError]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      activeStreamRef.current?.destroy();
      stopPacing();
    };
  }, [stopPacing]);

  // Reveal buffered text at a steady characters-per-second rate rather than a
  // fraction of the backlog: a proportional step decays exponentially, which
  // dumps each network slab in a few frames and then crawls. Rate is chosen to
  // clear the current backlog over PACE_CATCHUP seconds, clamped either side so
  // it never crawls and never flashes.
  const startPacing = useCallback(() => {
    if (rafRef.current != null) return;
    const PACE_CATCHUP = 0.4;   // seconds to absorb the current backlog
    const PACE_MIN = 140;       // chars/sec floor — a readable typing pace
    const PACE_MAX = 1400;      // chars/sec ceiling for a big backlog
    paceClockRef.current = 0;
    paceCarryRef.current = 0;
    const tick = (now: number) => {
      const target = targetTextRef.current;
      const remaining = target.length - displayedLenRef.current;
      const dt = paceClockRef.current === 0 ? 1 / 60 : Math.min(0.05, (now - paceClockRef.current) / 1000);
      paceClockRef.current = now;
      if (remaining > 0) {
        const rate = Math.min(PACE_MAX, Math.max(PACE_MIN, remaining / PACE_CATCHUP));
        const advance = paceCarryRef.current + rate * dt;
        const whole = Math.floor(advance);
        paceCarryRef.current = advance - whole;
        if (whole < 1) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        displayedLenRef.current = Math.min(target.length, displayedLenRef.current + whole);
        const shown = target.slice(0, displayedLenRef.current);
        setMessages(prev => {
          const next = [...prev];
          if (next.length > 0 && next[next.length - 1].role === 'assistant') {
            next[next.length - 1] = { ...next[next.length - 1], content: shown };
          }
          return next;
        });
      }
      if (displayedLenRef.current < targetTextRef.current.length || !streamDoneRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setStreaming(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Video jobs the client is still following, so a re-render or a second video
  // in the same conversation can't start duplicate pollers for one job.
  const videoPollsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const polls = videoPollsRef.current;
    return () => polls.clear();
  }, []);

  /**
   * Follows a video job after the chat stream has closed.
   *
   * Generation takes minutes; the turn ends in seconds. The server therefore
   * closes the stream with a `pending` event carrying the job id, and nothing
   * was listening for it — so every finished video was stored and billed while
   * the shopper watched a spinner that never resolved.
   *
   * Backs off as it goes: quick at first for a fast render, then sparse, giving
   * up after ~10 minutes rather than polling a dead job forever.
   */
  const followVideoJob = useCallback((jobId: string) => {
    if (!jobId || videoPollsRef.current.has(jobId)) return;
    videoPollsRef.current.add(jobId);

    const deadline = Date.now() + 10 * 60 * 1000;
    let delay = 4000;

    const settle = (patch: Partial<ChatMessage>) => {
      videoPollsRef.current.delete(jobId);
      setMessages(prev => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'assistant') {
            next[i] = { ...next[i], visualizing: false, ...patch };
            break;
          }
        }
        return next;
      });
    };

    const tick = async () => {
      if (!videoPollsRef.current.has(jobId)) return;
      if (Date.now() > deadline) {
        settle({});
        return;
      }
      const res = await client.api?.getVideoStatus?.(jobId);
      if (res?.status === 'SUCCESS' && res.videoUrl) {
        settle({ visualization: res.videoUrl, visualizationType: 'video' });
        return;
      }
      if (res?.status === 'FAILED') {
        settle({});
        return;
      }
      delay = Math.min(delay * 1.4, 20000);
      setTimeout(tick, delay);
    };

    setTimeout(tick, delay);
  }, [client]);

  // Wires a chat stream to state. `continuing` resumes into the assistant bubble
  // already on screen (after a manual stop) instead of opening a new one.
  const consumeStream = useCallback((stream: any, continuing: boolean, baseText: string) => {
    let messageInitialized = continuing;
    let lastMeta: any = null;
    const turnRefs: string[] = [];
    const sentAt = Date.now();
    let thoughtStamped = continuing;

    if (continuing) {
      targetTextRef.current = baseText;
      displayedLenRef.current = baseText.length;
      streamDoneRef.current = false;
    }

    // Starts the assistant bubble + pacing loop on first token or viz-generating.
    // In continue mode the bubble exists; we only flip state + start pacing.
    const ensureAssistantMessage = () => {
      if (!messageInitialized) {
        setLoading(false);
        setStreaming(true);
        targetTextRef.current = '';
        displayedLenRef.current = 0;
        streamDoneRef.current = false;
        messageInitialized = true;
        startPacing();
      } else if (continuing) {
        setLoading(false);
        setStreaming(true);
        startPacing();
      }
    };

    stream.on('meta', (meta: any) => {
      lastMeta = meta;
      setSources(meta.sources ?? []);
      if (meta.intent) setLastIntent(meta.intent);
      if (Array.isArray(meta.allowedActions)) setAllowedActions(meta.allowedActions);
      if (meta.action) setLastAction(meta.action);
      onMetaRef.current?.(meta);
    });

    stream.on('status', (st: any) => {
      if (st?.message) {
        ensureAssistantMessage();
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, statusMessage: st.message };
          }
          return next;
        });
      }
    });

    stream.on('entity_ref', (ref: any) => {
      if (ref?.id) {
        if (!turnRefs.includes(ref.id)) turnRefs.push(ref.id);
        setReferencedIds(prev => prev.includes(ref.id) ? prev : [...prev, ref.id]);
      }
    });

    stream.on('knowledge_images', (refs: any[]) => {
      ensureAssistantMessage();
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, knowledgeImages: refs };
        }
        return next;
      });
    });

    stream.on('stale_notice', (items: any[]) => {
      ensureAssistantMessage();
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, staleNotices: items };
        }
        return next;
      });
    });

    stream.on('thinking', (text: string) => {
      ensureAssistantMessage();
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, thinking: last.thinking ? last.thinking + '\n' + text : text };
        }
        return next;
      });
    });

    stream.on('token', (token: string) => {
      ensureAssistantMessage();
      if (!thoughtStamped) {
        // First answer token: everything before this was retrieval + reasoning.
        thoughtStamped = true;
        const secs = Math.max(1, Math.round((Date.now() - sentAt) / 1000));
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, thoughtForSeconds: secs };
          }
          return next;
        });
      }
      targetTextRef.current += token;
      onTokenRef.current?.(token);
    });

    stream.on('viz', (viz: VizEvent) => {
      if (viz.status === 'generating' || viz.status === 'generating_video') {
        ensureAssistantMessage();
        setMessages(prev => {
          const next = [...prev];
          if (next.length > 0 && next[next.length - 1].role === 'assistant') {
            next[next.length - 1] = {
              ...next[next.length - 1],
              visualizing: true,
              visualizingText: viz.status === 'generating_video' ? 'Generating video…' : 'Visualizing…'
            };
          }
          return next;
        });
        return;
      }
      if (viz.status === 'pending') {
        // The stream is about to close with the video still rendering. Keep the
        // placeholder up and follow the job over HTTP instead — otherwise the
        // finished video is stored, billed, and never shown to anyone.
        followVideoJob(viz.jobId);
        return;
      }
      setMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          const mType = viz.status === 'done' ? (viz.mediaType || (viz.url.includes('/videos/') ? 'video' : 'image')) : undefined;
          next[next.length - 1] = {
            ...next[next.length - 1],
            visualizing: false,
            ...(viz.status === 'done' ? { visualization: viz.url, visualizationType: mType } : {}),
          };
        }
        return next;
      });
    });

    stream.on('done', (fullMessage: string) => {
      setLoading(false);
      streamDoneRef.current = true;
      if (rafRef.current == null) {
        setStreaming(false);
      }

      setMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          const rawSources: ChatSource[] = lastMeta?.sources ?? [];
          next[next.length - 1] = {
            ...next[next.length - 1],
            sources: enrichSources(rawSources, client?.display),
            referencedIds: turnRefs,
            intent: lastMeta?.intent,
          };
        }
        return next;
      });

      // Developer-registered actions go out as a DOM event + onAction; built-ins (incl. server-driven visualize) don't.
      const metaAction = lastMeta?.action;
      const builtin = ['search', 'capture', 'capture_all', 'delete', 'view_history', 'request_kiku_key', 'visualize', 'open_memory'];

      if (metaAction?.type && !builtin.includes(metaAction.type)) {
        const items = (lastMeta?.sources ?? []).filter((s: any) => s?.id && turnRefs.includes(s.id));
        const detail = { ...metaAction, items };
        window.dispatchEvent(new CustomEvent('akropolys:action', { detail }));
        client.onAction?.(detail);
        // Sugar for the common case: if the resolved action is add-to-cart and the
        // developer wired onAddToCart, hand them the items to add to their own store.
        const kind = String(metaAction.type).replace(/[^a-z]/gi, '').toLowerCase();
        if ((kind === 'addtocart' || kind === 'cart') && client.onAddToCart && items.length > 0) {
          client.onAddToCart(items);
        }
      }

      onDoneRef.current?.(fullMessage);
    });

    stream.on('error', (err: Error) => {
      streamDoneRef.current = true;
      stopPacing();
      setLoading(false);
      setStreaming(false);
      const partial = targetTextRef.current;
      if (continuing || (messageInitialized && partial)) {
        // A partial answer is on screen — keep it, flush what was buffered, and
        // offer resume instead of erasing the shopper's question and half an answer.
        displayedLenRef.current = partial.length;
        setMessages(prev => {
          const next = [...prev];
          if (next.length > 0 && next[next.length - 1].role === 'assistant') {
            next[next.length - 1] = { ...next[next.length - 1], content: partial };
          }
          return next;
        });
        setInterrupted(true);
      } else {
        setError(err.message);
        setErrorCode((err as Error & { code?: string }).code ?? null);
        setMessages(prev => {
          let next = prev;
          if (next.length > 0 && next[next.length - 1].role === 'assistant') next = next.slice(0, -1);
          if (next.length > 0 && next[next.length - 1].role === 'user') next = next.slice(0, -1);
          return next;
        });
      }
      onErrorRef.current?.(err);
    });
  }, [client, startPacing, stopPacing]);

  // Starts a turn against the given history and wires its stream. Shared by an
  // immediate send and a queued message being drained once the turn ahead of
  // it settles — both need the exact same state resets and stream wiring.
  const beginTurn = useCallback((
    history: { role: 'user' | 'assistant'; content: string }[],
    query: string,
    attachments?: ChatAttachment[],
    forcedIntent?: string,
    captureTargets?: CaptureTarget[],
  ) => {
    setMessages(prev => [...prev, { role: 'assistant', content: '', thinking: '' }]);
    setLoading(true);
    setStreaming(true);
    setStopped(false);
    setInterrupted(false);
    setError(null);
    setErrorCode(null);
    setReferencedIds([]);
    setLastAction(null);
    setLastIntent(null);
    targetTextRef.current = '';
    displayedLenRef.current = 0;

    try {
      const stream = client.chat(query, history, attachments, forcedIntent, captureTargets);
      activeStreamRef.current = stream;
      consumeStream(stream, false, '');
    } catch (err: any) {
      setLoading(false);
      setStreaming(false);
      setError(err?.message ?? 'Chat request failed');
      setMessages(prev => prev.slice(0, -1)); // only the assistant placeholder is ours to remove here
      onErrorRef.current?.(err);
    }
  }, [client, consumeStream]);

  const send = useCallback(async (query: string, displayQuery?: string, attachments?: ChatAttachment[], forcedIntent?: string, captureTargets?: CaptureTarget[]) => {
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: displayQuery ?? query,
      images: attachments?.filter(a => a.type === 'image').map(a => a.preview || a.data),
    };

    // A turn is already running: queue behind it rather than racing it — a
    // second send() used to arrive while `loading` had already gone false
    // (it flips on the first token, well before the answer finishes) and
    // `destroy()` the stream still typing out the first answer.
    if (loading || streaming) {
      if (pendingRef.current) return; // one queued message at a time
      pendingRef.current = { query, displayQuery, attachments, forcedIntent, captureTargets };
      setQueuedMessage({ ...userMsg, queued: true });
      return;
    }

    setMessages(prev => [...prev, userMsg]);
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    beginTurn(history, query, attachments, forcedIntent, captureTargets);
  }, [messages, loading, streaming, beginTurn]);

  // Drains the queued message the instant the turn ahead of it settles,
  // whichever way it settles (finished, errored, or force-interrupted by
  // sendQueuedNow below) — one path for all three instead of three copies.
  useEffect(() => {
    if (loading || streaming) return;

    // Spoken turns first: they happened while the text turn was still running,
    // so they belong ahead of the queued message both in the transcript and in
    // the history that message is answered against.
    let settled = messages;
    if (spokenQueueRef.current.length > 0) {
      const spoken = spokenQueueRef.current;
      spokenQueueRef.current = [];
      for (const ex of spoken) settled = appendSpoken(settled, ex.heard, ex.said);
      setMessages(prev => {
        let next = prev;
        for (const ex of spoken) next = appendSpoken(next, ex.heard, ex.said);
        return next;
      });
    }

    if (!pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    setQueuedMessage(null);
    // History is the transcript as it stands, before this message joins it —
    // the same contract send() uses, so the queued turn sees the answer it
    // was waiting for.
    const history = settled.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, {
      role: 'user',
      content: pending.displayQuery ?? pending.query,
      images: pending.attachments?.filter(a => a.type === 'image').map(a => a.preview || a.data),
    }]);
    beginTurn(history, pending.query, pending.attachments, pending.forcedIntent, pending.captureTargets);
  }, [loading, streaming, messages, beginTurn]);

  // Resume a stopped/interrupted answer. With a partial answer on screen it
  // appends into the same assistant bubble; stopped before any answer arrived,
  // it re-runs the question fresh.
  const continueGenerating = useCallback(() => {
    if (loading || streaming) return;
    const last = messages[messages.length - 1];
    if (!last) return;

    activeStreamRef.current?.destroy();
    setStopped(false);
    setInterrupted(false);
    setLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      if (last.role === 'assistant') {
        const history = messages.map(m => ({ role: m.role, content: m.content }));
        const stream = client.chat(CONTINUE_QUERY, history);
        activeStreamRef.current = stream;
        consumeStream(stream, true, last.content || '');
      } else {
        const history = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
        const stream = client.chat(last.content, history);
        activeStreamRef.current = stream;
        consumeStream(stream, false, '');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message ?? 'Chat request failed');
      onErrorRef.current?.(err);
    }
  }, [client, messages, loading, streaming, consumeStream]);

  const reset = useCallback(() => {
    activeStreamRef.current?.destroy();
    stopPacing();
    streamDoneRef.current = true;
    targetTextRef.current = '';
    displayedLenRef.current = 0;
    pendingRef.current = null;
    spokenQueueRef.current = [];
    setQueuedMessage(null);
    setMessages([]);
    setSources([]);
    setReferencedIds([]);
    setStreaming(false);
    setStopped(false);
    setInterrupted(false);
    setError(null);
    setErrorCode(null);
    setLoading(false);
    setLastAction(null);
    setLastIntent(null);
  }, []);

  // Halts the in-flight response without reverting the question or the partial answer already shown.
  const stop = useCallback(() => {
    activeStreamRef.current?.destroy();
    stopPacing();
    streamDoneRef.current = true;
    setLoading(false);
    setStreaming(false);
    // Flush any buffered-but-not-yet-typed text so nothing is lost on resume.
    if (targetTextRef.current) {
      const full = targetTextRef.current;
      displayedLenRef.current = full.length;
      setMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          next[next.length - 1] = { ...next[next.length - 1], content: full };
        }
        return next;
      });
    }
    setStopped(true);
    // A viz 'done'/'failed' event will never arrive now — clear the spinner.
    setMessages(prev => prev.map(m => m.visualizing ? { ...m, visualizing: false } : m));
  }, [stopPacing]);

  // Interrupts the running turn so the queued message goes out now instead of
  // waiting for the answer ahead of it to finish typing. stop() flips loading
  // and streaming false, which the drain effect above is watching for — this
  // just triggers that same path early rather than duplicating it.
  const sendQueuedNow = useCallback(() => {
    if (!pendingRef.current) return;
    stop();
  }, [stop]);

  // Held back while a text turn is streaming, for the same reason a second
  // send() is: consumeStream writes every token into messages[length-1] on the
  // assumption that it is the assistant's turn, and appending here mid-stream
  // moves that slot — the rest of the typed answer lands in the spoken bubble.
  const appendSpokenExchange = useCallback((heard: string, said: string) => {
    const h = heard.trim();
    const s = said.trim();
    if (!h && !s) return;
    if (loadingRef.current || streamingRef.current) {
      spokenQueueRef.current.push({ heard: h, said: s });
      return;
    }
    setMessages(prev => appendSpoken(prev, h, s));
  }, []);

  const resolvedSources = useMemo(
    () => enrichSources(sources, client?.display),
    [sources, client?.display]
  );

  return { messages, sources: resolvedSources, referencedIds, loading, streaming, error, errorCode, lastAction, lastIntent, allowedActions, send, queuedMessage, sendQueuedNow, appendSpokenExchange, stop, stopped, interrupted, continueGenerating, reset };
}

