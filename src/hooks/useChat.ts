import { useState, useCallback, useRef } from 'react';
import { useHuskelContext } from '../components/HuskelProvider';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSource {
  id?: string;
  name: string;
  price?: string;
  currency?: string;
  category?: string;
  url?: string;
  image?: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  sources: ChatSource[];
  loading: boolean;
  error: string | null;
  send: (query: string, displayQuery?: string) => Promise<void>;
  reset: () => void;
}

export function useChat(): UseChatReturn {
  const client = useHuskelContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);

    try {
      // Build history from current messages (exclude the one we just added — server will see it as query)
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await client.api.chat(query, history);

      if (signal.aborted) return;

      const fullAnswer = res.answer || '';
      const words = fullAnswer.split(/(\s+)/);

      // Initialize empty assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let currentContent = '';
      for (const word of words) {
        if (signal.aborted) return;
        currentContent += word;
        setMessages(prev => {
          const next = [...prev];
          if (next.length > 0) {
            next[next.length - 1] = { role: 'assistant', content: currentContent };
          }
          return next;
        });
        // 25ms delay per word token to make it read naturally
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      if (signal.aborted) return;
      setSources(res.sources ?? []);

      if (res.action?.type === 'add_to_cart' || res.checkout) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('huskel:cart_updated', { detail: res.checkout }));
        }
      }
      if (res.action?.type === 'checkout') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('huskel:trigger_checkout', { detail: res.checkout }));
        }
      }
      if (res.checkout && client.onCheckout) {
        client.onCheckout(res.checkout);
      }
    } catch (e: any) {
      if (signal.aborted) return;
      let msg = e?.message ?? 'Chat request failed';
      try {
        const parsed = JSON.parse(msg);
        if (parsed && parsed.error) {
          msg = parsed.error;
        }
      } catch {
        // keep original text
      }
      setError(msg);
      // Remove the optimistic user message on failure
      setMessages(prev => prev.slice(0, -1));
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [client, messages, loading]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSources([]);
    setError(null);
    setLoading(false);
  }, []);

  return { messages, sources, loading, error, send, reset };
}
