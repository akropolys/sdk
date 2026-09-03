import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAkropolysContext } from '../Provider';
import { ChatMessage, ChatSource, VizEvent } from '../stream';
import { ChatAction, ChatAttachment, CaptureTarget } from '../types';
import { resolveDisplayFields } from '../client';
import { setLiveValue } from '../liveValues';

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

  queuedMessage: ChatMessage | null;

  sendQueuedNow: () => void;

  appendSpokenExchange: (heard: string, said: string) => void;
  stop: () => void;
  stopped: boolean;

  interrupted: boolean;
  continueGenerating: () => void;
  reset: () => void;
}

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

function enrichSources(sources: ChatSource[], display?: import('../types').DisplayConfig): ChatSource[] {
  return sources.map(s => {
    const d = resolveDisplayFields(s.fields || s, display);
    return {
      ...s,
      name: s.name || d.title,
      price: s.price || d.price,
      image: s.image || d.image,
      brand: s.brand || d.subtitle,
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<ChatAction | null>(null);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [allowedActions, setAllowedActions] = useState<string[] | null>(null);
  const activeStreamRef = useRef<any | null>(null);
  const pendingRef = useRef<PendingSend | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<ChatMessage | null>(null);
  const spokenQueueRef = useRef<SpokenExchange[]>([]);
  const loadingRef = useRef(false);
  const streamingRef = useRef(false);
  loadingRef.current = loading;
  streamingRef.current = streaming;

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

  useEffect(() => {
    return () => {
      activeStreamRef.current?.destroy();
      stopPacing();
    };
  }, [stopPacing]);

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

  const videoPollsRef = useRef<Set<string>>(new Set());
  const videoTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      videoPollsRef.current.clear();
      videoTimeoutsRef.current.forEach(t => clearTimeout(t));
      videoTimeoutsRef.current.clear();
    };
  }, []);

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
        let videoUrl = res.videoUrl;
        if (videoUrl.startsWith('/') && client?.apiUrl) {
          videoUrl = `${client.apiUrl.replace(/\/+$/, '')}${videoUrl}`;
        }
        settle({ visualization: videoUrl, visualizationType: 'video' });
        return;
      }
      if (res?.status === 'FAILED') {
        settle({});
        return;
      }
      delay = Math.min(delay * 1.4, 20000);
      const timer = setTimeout(() => {
        videoTimeoutsRef.current.delete(timer);
        tick();
      }, delay);
      videoTimeoutsRef.current.add(timer);
    };

    const initialTimer = setTimeout(() => {
      videoTimeoutsRef.current.delete(initialTimer);
      tick();
    }, delay);
    videoTimeoutsRef.current.add(initialTimer);
  }, [client]);

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

    stream.on('live_ref', (ref: { key: string; fields?: Record<string, string>; at?: number }) => {
      if (ref?.fields && typeof ref.fields === 'object') {
        setLiveValue(ref.key, ref.fields, typeof ref.at === 'number' ? ref.at : undefined);
      }
      ensureAssistantMessage();
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          const keys = last.liveKeys ?? [];
          if (!keys.includes(ref.key)) {
            next[next.length - 1] = { ...last, liveKeys: [...keys, ref.key] };
          }
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
        followVideoJob(viz.jobId);
        return;
      }
      ensureAssistantMessage();
      setMessages(prev => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          let vizUrl = viz.status === 'done' ? viz.url : undefined;
          if (vizUrl && vizUrl.startsWith('/') && client?.apiUrl) {
            vizUrl = `${client.apiUrl.replace(/\/+$/, '')}${vizUrl}`;
          }
          const mType = viz.status === 'done' ? (viz.mediaType || (vizUrl?.includes('/videos/') ? 'video' : 'image')) : undefined;
          next[next.length - 1] = {
            ...next[next.length - 1],
            visualizing: false,
            ...(viz.status === 'done' && vizUrl ? { visualization: vizUrl, visualizationType: mType } : {}),
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

      const metaAction = lastMeta?.action;
      const builtin = ['search', 'capture', 'capture_all', 'delete', 'view_history', 'request_kiku_key', 'visualize', 'open_memory'];

      if (metaAction?.type && !builtin.includes(metaAction.type)) {
        const items = (lastMeta?.sources ?? []).filter((s: any) => s?.id && turnRefs.includes(s.id));
        const detail = { ...metaAction, items };
        window.dispatchEvent(new CustomEvent('akropolys:action', { detail }));
        client.onAction?.(detail);
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
          if (next.length > 0 && next[next.length - 1].role === 'assistant' && !next[next.length - 1].content) {
            next = next.slice(0, -1);
          }
          return next;
        });
      }
      onErrorRef.current?.(err);
    });
  }, [client, startPacing, stopPacing]);

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

  useEffect(() => {
    if (loading || streaming) return;

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
    const history = settled.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, {
      role: 'user',
      content: pending.displayQuery ?? pending.query,
      images: pending.attachments?.filter(a => a.type === 'image').map(a => a.preview || a.data),
    }]);
    beginTurn(history, pending.query, pending.attachments, pending.forcedIntent, pending.captureTargets);
  }, [loading, streaming, messages, beginTurn]);

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
    videoPollsRef.current.clear();
    videoTimeoutsRef.current.forEach(t => clearTimeout(t));
    videoTimeoutsRef.current.clear();
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

  const stop = useCallback(() => {
    activeStreamRef.current?.destroy();
    stopPacing();
    streamDoneRef.current = true;
    setLoading(false);
    setStreaming(false);
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
    setMessages(prev => prev.map(m => m.visualizing ? { ...m, visualizing: false } : m));
  }, [stopPacing]);

  const sendQueuedNow = useCallback(() => {
    if (!pendingRef.current) return;
    stop();
  }, [stop]);

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

