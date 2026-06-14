import { useState, useCallback, useRef } from 'react';
import { SearchResult } from '../types';
import { useAkropolysContext } from '../Provider';

interface UseSearchReturn {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  search: (query: string, limit?: number) => Promise<void>;
  clear: () => void;
}

export function useSearch(options?: { type?: 'autocomplete' | 'vector' }): UseSearchReturn {
  const client = useAkropolysContext();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Generation counter so stale responses from any in-flight requests don't overwrite newer ones
  const genRef = useRef(0);

  const searchType = options?.type ?? 'autocomplete';

  const search = useCallback(async (query: string, limit = 8) => {
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = searchType === 'vector'
        ? await client.api.searchVector(query, limit)
        : await client.api.searchAutocomplete(query, limit);
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
  }, [client, searchType]);

  const clear = useCallback(() => {
    genRef.current++;
    setResults([]);
    setError(null);
    setLoading(false);
  }, []);

  return { results, loading, error, search, clear };
}
