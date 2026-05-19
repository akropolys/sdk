import { useState, useCallback, useRef } from 'react';
import { SearchResult } from '../types';
import { getHuskelClient } from '../client';

interface UseSearchReturn {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  search: (query: string, limit?: number) => Promise<void>;
  clear: () => void;
}

export function useSearch(): UseSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string, limit = 10) => {
    if (!query.trim()) { setResults([]); return; }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await getHuskelClient().api.search(query, limit);
      setResults(res.results ?? []);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => { setResults([]); setError(null); }, []);

  return { results, loading, error, search, clear };
}
