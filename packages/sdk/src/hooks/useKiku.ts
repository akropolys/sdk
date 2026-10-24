import { normalizeEntityImages } from '../entityImages';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { VisitorRequest } from '../conversation';
import { useAkropolysContext } from '../Provider';
import { ChatMessage, ChatSource, VizEvent } from '../stream';
import { ChatAction, ChatAttachment, CaptureTarget } from '../types';
import { resolveDisplayFields } from '../client';
import { setLiveValue } from '../liveValues';
import { useCardFields } from './useCardFields';

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

  appendSpokenExchange: (heard: string, said: string, duration?: number, userAudioUrl?: string, assistantAudioUrl?: string, media?: SpokenMedia) => void;
  stop: () => void;
  stopped: boolean;

  interrupted: boolean;
  continueGenerating: () => void;
  reset: () => void;
  humanPending: boolean; // a person from the site's team has been asked for or is replying
  leaveHuman: () => void;
  requests: VisitorRequest[]; // the visitor's requests for a person on this site, newest first
  activeRequestId: string | null;
  openRequest: (id: string) => void;
  // A key Kiku made for the visitor with their request, until it has been shown to them.
}

interface PendingSend {
  query: string;
  displayQuery?: string;
  attachments?: ChatAttachment[];
  forcedIntent?: string;
  captureTargets?: CaptureTarget[];
}

// What a voice turn showed: photos the visitor attached, and the image the model rendered.
export interface SpokenMedia {
  images?: string[];
  visualization?: string;
  live?: string;
}

interface SpokenExchange {
  heard: string;
  said: string;
  duration?: number;
  userAudioUrl?: string;
  assistantAudioUrl?: string;
  media?: SpokenMedia;
}

function appendSpoken(prev: ChatMessage[], heard: string, said: string, duration?: number, userAudioUrl?: string, assistantAudioUrl?: string, media?: SpokenMedia): ChatMessage[] {
  const next = [...prev];
  const images = media?.images?.length ? media.images : undefined;
  const live = media?.live;
  if (heard || images) next.push({ role: 'user', content: heard, spoken: true, live, audioUrl: userAudioUrl, images });
  if (said || media?.visualization) next.push({
    role: 'assistant',
    content: said,
    spoken: true,
    live,
    thoughtForSeconds: duration && duration > 0 ? Math.round(duration * 10) / 10 : undefined,
    audioUrl: assistantAudioUrl,
    visualization: media?.visualization,
  });
  return next;
}

const CONTINUE_QUERY =
  'Continue your previous answer exactly where it stopped. Do not repeat anything already written — just carry on from the last character.';

function enrichSources(sources: ChatSource[], cardFields: string[]): ChatSource[] {
  return sources.map(s => {
    const d = resolveDisplayFields(s.fields || s, cardFields);
    return {
      ...s,
      name: s.name || d.title,
      image: s.image || d.image || normalizeEntityImages(s.images, undefined, s.url)[0]?.url,
      images: normalizeEntityImages(s.images ?? s.fields?.images ?? d.images, s.image || d.image, s.url),
      details: d.details,
    };
  });
}

export function useKiku(options: UseKikuOptions = {}): UseKikuReturn {
  const client = useAkropolysContext();
  const cardFields = useCardFields();
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

  const stopFlush = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const onTokenRef = useRef(options.onToken);
  const onMetaRef = useRef(options.onMeta);
  const onDoneRef = useRef(options.onDone);
  const onErrorRef = useRef(options.onError);

  const [conversationId, setConversationId] = useState<string | null>(() => client?.api.conversation?.id ?? null);
  const lastSentAtRef = useRef(0);
  const [humanStatus, setHumanStatus] = useState<string | null>(null);
  // A request found at mount is replayed once, so a reload or page change keeps what was said to the team.
  const resumeRef = useRef({ id: conversationId, upTo: client?.api.conversation?.cursor ?? 0, shown: 0, auto: true });

  const [requests, setRequests] = useState<VisitorRequest[]>([]);
  const [attached, setAttached] = useState(0);

  const loadRequests = useCallback(async (): Promise<VisitorRequest[]> => {
    if (!client) return [];
    const list = await client.api.myRequests().catch(() => [] as VisitorRequest[]);
    setRequests(list);
    return list;
  }, [client]);

  // Lets go of the request in this browser without ending it; it stays in the visitor's requests.
  const detach = useCallback(() => {
    client?.api.forgetConversation();
    resumeRef.current = { id: null, upTo: 0, shown: 0, auto: false };
    setConversationId(null);
    setHumanStatus(null);
    loadRequests();
  }, [client, loadRequests]);

  // Shows one of the visitor's requests in the chat, replacing whatever was on screen.
  const openRequest = useCallback(async (id: string) => {
    if (!client) return;
    const last = await client.api.resumeRequest(id);
    if (last === null) return;
    activeStreamRef.current?.destroy();
    stopFlush();
    streamDoneRef.current = true;
    pendingRef.current = null;
    setQueuedMessage(null);
    setLoading(false);
    setStreaming(false);
    setMessages([]);
    resumeRef.current = { id, upTo: last, shown: 0, auto: false };
    setHumanStatus(null);
    setConversationId(id);
    setAttached(n => n + 1);
  }, [client, stopFlush]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const leaveHuman = useCallback(() => {
    client?.api.leaveConversation();
    setConversationId(null);
    setHumanStatus(null);
    setTimeout(loadRequests, 600);
  }, [client, loadRequests]);

  // While a person may reply, keep one live connection and add each human reply to the conversation.
  useEffect(() => {
    if (!client || !conversationId) return;
    const abort = new AbortController();
    let status: string | null = null;
    const resume = resumeRef.current;
    let askedAt = 0;
    // Nobody replies once the team has handed back or closed; asking again reattaches.
    let finished = false;
    const replaying = () => resume.id === conversationId && resume.shown < resume.upTo;
    const onEvent = (e: { type: string; message?: { id: number; role: string; text: string; at: string; kind?: string }; status?: string }) => {
      if (abort.signal.aborted) return;
      if (e.type === 'message' && e.message) {
        client.api.seenConversationMessage(e.message.id);
        if (replaying()) {
          if (e.message.id <= resume.shown) return;
          resume.shown = e.message.id;
          const { role, text } = e.message;
          const at = new Date(e.message.at).getTime();
          if (e.message.kind === 'joined') setMessages(prev => [...prev, { role: 'assistant', content: '', statusStage: 'team_joined' }]);
          if (role === 'visitor' && text) setMessages(prev => [...prev, { role: 'user', content: text }]);
          if (role === 'human') {
            const waited = askedAt ? Math.max(1, Math.round((at - askedAt) / 1000)) : undefined;
            setMessages(prev => [...prev, { role: 'assistant', content: text, human: true, repliedSeconds: waited }]);
            setReferencedIds([]);
            setSources([]);
          }
          if (role === 'visitor') { askedAt = at; lastSentAtRef.current = Math.max(lastSentAtRef.current, at); }
          if (!replaying() && role === 'visitor' && (status === 'waiting' || status === 'human')) {
            setMessages(prev => [...prev, { role: 'assistant', content: '', statusStage: 'with_team' }]);
          }
          return;
        }
        if (e.message.kind === 'joined') {
          setMessages(prev => [...prev, { role: 'assistant', content: '', statusStage: 'team_joined' }]);
          return;
        }
        if (e.message.role === 'system' && (status === 'kiku' || status === 'closed')) {
          const stage = status === 'kiku' ? 'back_with_kiku' : 'team_closed';
          setMessages(prev => [...prev, { role: 'assistant', content: '', statusStage: stage }]);
          finished = true;
          abort.abort();
          return;
        }
        if (e.message.role !== 'human') return;
        const waited = lastSentAtRef.current ? Math.max(1, Math.round((new Date(e.message.at).getTime() - lastSentAtRef.current) / 1000)) : undefined;
        const text = e.message.text;
        setMessages(prev => [...prev, { role: 'assistant', content: text, human: true, repliedSeconds: waited && waited > 0 ? waited : undefined }]);
        setReferencedIds([]);
        setSources([]);
        return;
      }
      if (e.type === 'status' && e.status) {
        if (status !== null && status !== e.status) loadRequests();
        status = e.status;
        setHumanStatus(e.status);
      }
    };
    (async () => {
      // A remembered request nobody is on any more comes back only if it holds a reply not yet seen.
      if (resume.auto && resume.id === conversationId) {
        const state = await client.api.conversationState().catch(() => null);
        if (abort.signal.aborted) return;
        resume.auto = false;
        if (state && state.status !== 'waiting' && state.status !== 'human' && state.unread === 0) {
          detach();
          return;
        }
      }
      let wait = 3000;
      while (!abort.signal.aborted) {
        const code = await client.api.conversationEvents(onEvent, abort.signal, replaying() ? resume.shown : undefined).catch(() => 0);
        if (finished || (code === 200 && (status === 'kiku' || status === 'closed'))) return;
        if (code === 404) {
          client.api.forgetConversation();
          setConversationId(null);
          return;
        }
        wait = code === 200 ? 3000 : Math.min(wait * 2, 60000);
        await new Promise(r => setTimeout(r, wait));
      }
    })();
    return () => abort.abort();
  }, [client, conversationId, attached, loadRequests, detach]);

  useEffect(() => {
    onTokenRef.current = options.onToken;
    onMetaRef.current = options.onMeta;
    onDoneRef.current = options.onDone;
    onErrorRef.current = options.onError;
  }, [options.onToken, options.onMeta, options.onDone, options.onError]);

  useEffect(() => {
    return () => {
      activeStreamRef.current?.destroy();
      stopFlush();
    };
  }, [stopFlush]);

  const startFlush = useCallback(() => {
    if (rafRef.current != null) return;
    // Tokens are flushed once per frame; the reveal speed belongs to the renderer.
    const tick = () => {
      const target = targetTextRef.current;
      if (target.length > displayedLenRef.current) {
        displayedLenRef.current = target.length;
        const shown = target;
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
        startFlush();
      } else if (continuing) {
        setLoading(false);
        setStreaming(true);
        startFlush();
      }
    };

    stream.on('meta', (meta: any) => {
      lastMeta = meta;
      setSources(meta.sources ?? []);
      if (meta.intent) setLastIntent(meta.intent);
      if (Array.isArray(meta.allowedActions)) setAllowedActions(meta.allowedActions);
      if (meta.action) setLastAction(meta.action);
      // A key Kiku made quietly, with a save or a request for a person, is kept here without asking anything of the visitor.
      if (meta.action?.kikuKey && client) {
        client.setKikuKey(meta.action.kikuKey);
        if (meta.action.kikuPub) client.setKikuPub(meta.action.kikuPub);
      }
      if (meta.action?.type === 'request_human' && meta.action.conversationId && client) {

        client.api.openConversation(meta.action.conversationId, meta.action.conversationToken);
        setConversationId(client.api.conversation?.id ?? null);
        setAttached(n => n + 1);
        setHumanStatus('waiting');
        loadRequests();
      }
      onMetaRef.current?.(meta);
    });

    stream.on('status', (st: any) => {
      if (st?.message) {
        ensureAssistantMessage();
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, statusMessage: st.message, statusStage: st.stage };
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
              visualizationType: viz.status === 'generating_video' ? 'video' : 'image',
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
            sources: enrichSources(rawSources, client?.api.cardFields ?? []),
            referencedIds: turnRefs,
            intent: lastMeta?.intent,
          };
        }
        return next;
      });

      onDoneRef.current?.(fullMessage);
    });

    stream.on('error', (err: Error) => {
      streamDoneRef.current = true;
      stopFlush();
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
  }, [client, startFlush, stopFlush]);

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
    lastSentAtRef.current = Date.now();

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
      for (const ex of spoken) settled = appendSpoken(settled, ex.heard, ex.said, ex.duration, ex.userAudioUrl, ex.assistantAudioUrl, ex.media);
      setMessages(prev => {
        let next = prev;
        for (const ex of spoken) next = appendSpoken(next, ex.heard, ex.said, ex.duration, ex.userAudioUrl, ex.assistantAudioUrl, ex.media);
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
    stopFlush();
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
    detach();
  }, [detach, stopFlush]);

  const stop = useCallback(() => {
    activeStreamRef.current?.destroy();
    stopFlush();
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
  }, [stopFlush]);

  const sendQueuedNow = useCallback(() => {
    if (!pendingRef.current) return;
    stop();
  }, [stop]);

  const appendSpokenExchange = useCallback((heard: string, said: string, duration?: number, userAudioUrl?: string, assistantAudioUrl?: string, media?: SpokenMedia) => {
    const h = heard.trim();
    const s = said.trim();
    if (!h && !s && !media?.images?.length && !media?.visualization) return;
    if (loadingRef.current || streamingRef.current) {
      spokenQueueRef.current.push({ heard: h, said: s, duration, userAudioUrl, assistantAudioUrl, media });
      return;
    }
    setMessages(prev => appendSpoken(prev, h, s, duration, userAudioUrl, assistantAudioUrl, media));
  }, []);

  const resolvedSources = useMemo(
    () => enrichSources(sources, cardFields),
    [sources, cardFields]
  );

  return { messages, sources: resolvedSources, referencedIds, loading, streaming, error, errorCode, lastAction, lastIntent, allowedActions, send, queuedMessage, sendQueuedNow, appendSpokenExchange, stop, stopped, interrupted, continueGenerating, reset, humanPending: !!conversationId && (humanStatus === 'waiting' || humanStatus === 'human'), leaveHuman,
    // A visitor with no Kiku identity still sees the one request this browser remembers.
    requests: requests.length > 0 || !conversationId ? requests : [{ id: conversationId, status: (humanStatus ?? 'waiting') as VisitorRequest['status'], summary: '' }],
    activeRequestId: conversationId, openRequest };
}
