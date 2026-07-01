import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAkropolysContext } from '../Provider';
import { ChatMessage, ChatSource } from '../stream';
import { ChatAction, ChatAttachment } from '../types';
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
  lastAction: ChatAction | null;
  lastIntent: string | null;
  send: (query: string, displayQuery?: string, attachments?: ChatAttachment[]) => Promise<void>;
  reset: () => void;
}

export function useKiku(options: UseKikuOptions = {}): UseKikuReturn {
  const client = useAkropolysContext();
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages ?? []);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [referencedIds, setReferencedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<ChatAction | null>(null);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const activeStreamRef = useRef<any | null>(null);

  // Streaming pace buffer — decouples on-screen typing speed from how fast (or
  // bursty) the network delivers tokens, so a fast backend still "types" smoothly.
  const targetTextRef = useRef('');
  const displayedLenRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const streamDoneRef = useRef(false);

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

  const send = useCallback(async (query: string, displayQuery?: string, attachments?: ChatAttachment[]) => {
    if (!query.trim() || loading) return;

    // Abort previous stream if any
    activeStreamRef.current?.destroy();

    // Optimistically add user message (with image thumbnails if provided)
    const userMsg: ChatMessage = {
      role: 'user',
      content: displayQuery ?? query,
      images: attachments?.filter(a => a.type === 'image').map(a => a.data),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setStreaming(false);
    setError(null);
    setReferencedIds([]);

    try {
      // History excludes the message we just added
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      
      // Get the stream — pass attachments for vision-capable backends
      const stream = client.chat(query, history, attachments);
      activeStreamRef.current = stream;

      let messageInitialized = false;
      let lastMeta: any = null;

      // Reveal buffered text a little each animation frame. Speed scales with the
      // backlog so it never lags far behind, but always reads as deliberate typing.
      const tick = () => {
        const target = targetTextRef.current;
        const remaining = target.length - displayedLenRef.current;
        if (remaining > 0) {
          const step = Math.max(2, Math.ceil(remaining * 0.15));
          displayedLenRef.current = Math.min(target.length, displayedLenRef.current + step);
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

      stream.on('meta', (meta: any) => {
        lastMeta = meta;
        setSources(meta.sources ?? []);
        if (meta.intent) setLastIntent(meta.intent);
        if (meta.action) setLastAction(meta.action);
        
        onMetaRef.current?.(meta);
      });

      stream.on('entity_ref', (ref: any) => {
        if (ref?.id) {
          setReferencedIds(prev => prev.includes(ref.id) ? prev : [...prev, ref.id]);
        }
      });

      stream.on('token', (token: string) => {
        if (!messageInitialized) {
          setLoading(false);
          setStreaming(true);
          targetTextRef.current = '';
          displayedLenRef.current = 0;
          streamDoneRef.current = false;
          setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
          messageInitialized = true;
          rafRef.current = requestAnimationFrame(tick);
        }
        // Buffer the token; the rAF loop reveals it at a smooth pace.
        targetTextRef.current += token;

        onTokenRef.current?.(token);
      });

      stream.on('done', (fullMessage: string) => {
        setLoading(false);
        streamDoneRef.current = true;
        // Let the pacing loop finish revealing buffered text — it flips streaming
        // off once caught up. If nothing streamed, settle immediately.
        if (rafRef.current == null) {
          setStreaming(false);
        }

        const metaAction = lastMeta?.action;
        const metaCheckout = lastMeta?.checkout;

        const isCartAction = metaAction?.type === 'add_to_cart'
          || metaAction?.type === 'remove_from_cart'
          || metaAction?.type === 'clear_cart'
          || metaAction?.type === 'view_cart';

        if (isCartAction || metaCheckout) {
          setMessages(prev => {
            const next = [...prev];
            if (next.length > 0 && next[next.length - 1].role === 'assistant') {
              next[next.length - 1] = {
                ...next[next.length - 1],
                cartSnapshot: metaCheckout,
                actionType: metaAction?.type,
              };
            }
            return next;
          });
          
          window.dispatchEvent(new CustomEvent('akropolys:cart_updated', { detail: metaCheckout }));
        }

        if (metaAction?.type === 'checkout') {
          window.dispatchEvent(new CustomEvent('akropolys:trigger_checkout', { detail: metaCheckout }));
        }
        if (metaAction?.type === 'awaiting_payment') {
          window.dispatchEvent(new CustomEvent('akropolys:awaiting_payment', { detail: metaAction }));
        }

        if (metaCheckout && client.onCheckout) {
          client.onCheckout(metaCheckout);
        }

        onDoneRef.current?.(fullMessage);
      });

      stream.on('error', (err: Error) => {
        streamDoneRef.current = true;
        stopPacing();
        setLoading(false);
        setStreaming(false);
        setError(err.message);
        // Remove the user query from message history on failure
        setMessages(prev => prev.slice(0, -1));
        onErrorRef.current?.(err);
      });

    } catch (err: any) {
      setLoading(false);
      setStreaming(false);
      setError(err?.message ?? 'Chat request failed');
      setMessages(prev => prev.slice(0, -1));
      onErrorRef.current?.(err);
    }
  }, [client, messages, loading]);

  const reset = useCallback(() => {
    activeStreamRef.current?.destroy();
    stopPacing();
    streamDoneRef.current = true;
    targetTextRef.current = '';
    displayedLenRef.current = 0;
    setMessages([]);
    setSources([]);
    setReferencedIds([]);
    setStreaming(false);
    setError(null);
    setLoading(false);
    setLastAction(null);
    setLastIntent(null);
  }, []);

  const resolvedSources = useMemo(() => {
    return sources.map(s => {
      const display = resolveDisplayFields(s.fields || s, client?.display);
      return {
        ...s,
        name: s.name || display.title,
        price: s.price || display.price,
        image: s.image || display.image,
        brand: s.brand || display.subtitle,
        currency: s.currency || (typeof display.price === 'string' && display.price.match(/[A-Za-z]{3}/)?.[0]) || 'KES',
      };
    });
  }, [sources, client?.display]);

  return { messages, sources: resolvedSources, referencedIds, loading, streaming, error, lastAction, lastIntent, send, reset };
}

