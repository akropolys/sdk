import { useState, useCallback, useRef, useMemo } from 'react';
import { useAkropolysContext } from '../components/AkropolysProvider';
import { CartPayload } from '../types';
import { resolveDisplayFields } from '../client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Cart snapshot attached to assistant messages that mutated the cart */
  cartSnapshot?: CartPayload;
  /** The action type that triggered this message (for pill rendering) */
  actionType?: string;
}

export interface ChatSource {
  id?: string;
  url?: string;
  fields?: Record<string, any>;
  name?: string;
  price?: string;
  currency?: string;
  category?: string;
  image?: string;
  brand?: string;
  availability?: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  sources: ChatSource[];
  referencedIds: string[];
  loading: boolean;
  /** True while real tokens are arriving from the server */
  streaming: boolean;
  error: string | null;
  lastAction: any | null;
  lastIntent: string | null;
  send: (query: string, displayQuery?: string) => Promise<void>;
  reset: () => void;
}

// ── SSE line parser ───────────────────────────────────────────────────────────
// Cerebras tokens contain literal `\n` escape sequences that we convert back to
// real newlines. The server also sends `event:meta` and `event:done` frames.

interface SSEFrame {
  event: string;  // '' = plain data, 'meta', 'done', 'error'
  data: string;
}

function parseSSEChunk(raw: string): SSEFrame[] {
  const frames: SSEFrame[] = [];
  const blocks = raw.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data = line.slice(5); // keep leading space if any
    }
    if (data !== '') frames.push({ event, data });
  }
  return frames;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat(): UseChatReturn {
  const client = useAkropolysContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [referencedIds, setReferencedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<any | null>(null);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (query: string, displayQuery?: string) => {
    if (!query.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // Optimistically add the user message
    const userMsg: ChatMessage = { role: 'user', content: displayQuery ?? query };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setStreaming(false);
    setError(null);
    setReferencedIds([]);

    try {
      // History excludes the message we just added
      const history = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Open the SSE stream
      const response = await client.api.chatStream(query, history, signal);
      if (signal.aborted) return;

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Metadata from the `event:meta` frame
      let metaIntent = '';
      let metaSources: ChatSource[] = [];
      let metaAction: any = null;
      let metaCheckout: CartPayload | undefined;

      // The assistant message slot (appended on first token)
      let messageInitialised = false;

      // Buffer for incomplete SSE chunks across read() calls
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline (SSE frame boundary) but keep partial last block
        const lastBoundary = buffer.lastIndexOf('\n\n');
        if (lastBoundary === -1) continue; // wait for more data

        const complete = buffer.slice(0, lastBoundary + 2);
        buffer = buffer.slice(lastBoundary + 2);

        const frames = parseSSEChunk(complete);

        for (const { event, data } of frames) {
          if (event === 'meta') {
            try {
              const meta = JSON.parse(data);
              metaIntent = meta.intent ?? '';
              metaSources = meta.sources ?? [];
              metaAction = meta.action ?? null;
              metaCheckout = meta.checkout;
              // Apply metadata immediately — sources/intent show before first word
              setSources(metaSources);
              if (metaIntent) setLastIntent(metaIntent);
              if (metaAction) setLastAction(metaAction);
            } catch { /* ignore parse errors */ }
            continue;
          }

          if (event === 'entity_ref') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.id) {
                setReferencedIds(prev => prev.includes(parsed.id) ? prev : [...prev, parsed.id]);
              }
            } catch { /* ignore parse errors */ }
            continue;
          }

          if (event === 'done') break;

          if (event === 'error') {
            let msg = 'Chat request failed';
            try { msg = JSON.parse(data).error ?? msg; } catch { msg = data; }
            setError(msg);
            setMessages(prev => prev.slice(0, -1));
            return;
          }

          // Plain token — convert escaped newlines back to real ones
          const token = data.replace(/\\n/g, '\n');

          if (!messageInitialised) {
            // First token: stop the "waiting" spinner, start streaming
            setLoading(false);
            setStreaming(true);
            setMessages(prev => [...prev, { role: 'assistant', content: token }]);
            messageInitialised = true;
          } else {
            setMessages(prev => {
              const next = [...prev];
              if (next.length > 0 && next[next.length - 1].role === 'assistant') {
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  content: next[next.length - 1].content + token,
                };
              }
              return next;
            });
          }
        }
      }

      if (signal.aborted) return;

      // Attach cart snapshot / actionType to the final assistant message
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
      }

      // Dispatch cart/checkout events
      if (isCartAction || metaCheckout) {
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

    } catch (e: any) {
      if (signal.aborted) return;
      let msg = e?.message ?? 'Chat request failed';
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error) msg = parsed.error;
      } catch { /* keep original */ }
      setError(msg);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setStreaming(false);
      }
  }, [client, messages, loading]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
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
