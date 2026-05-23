import { useState, useCallback, useRef } from 'react';
import { SearchResult } from '../types';
import { useHuskelContext } from '../components/HuskelProvider';

interface UseSearchReturn {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  search: (query: string, limit?: number) => Promise<void>;
  clear: () => void;
}

export function useSearch(): UseSearchReturn {
  const client = useHuskelContext();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Generation counter so stale responses from any in-flight requests don't overwrite newer ones
  const genRef = useRef(0);

  const search = useCallback(async (query: string, limit = 8) => {
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    const gen = ++genRef.current;
    // No loading spinner for autocomplete — it's so fast it would just flicker
    setError(null);
    try {
      // searchAutocomplete = pure in-memory Trie, <1ms, no Upstash
      const res = await client.api.searchAutocomplete(query, limit);
      if (gen === genRef.current) {
        setResults(res.results ?? []);
      }
    } catch (e: unknown) {
      if (gen === genRef.current) {
        let msg = (e as any)?.message ?? 'Search failed';
        try {
          const parsed = JSON.parse(msg);
          if (parsed && parsed.error) {
            msg = parsed.error;
          }
        } catch {
          // keep original text
        }
        setError(msg);
      }
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [client]);

  const clear = useCallback(() => {
    genRef.current++;
    setResults([]);
    setError(null);
    setLoading(false);
  }, []);

  return { results, loading, error, search, clear };
}
