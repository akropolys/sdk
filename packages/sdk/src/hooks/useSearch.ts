import { useState, useCallback, useRef, useEffect } from 'react';
import { SearchResult } from '../types';
import { useAkropolysContext } from '../Provider';

interface UseSearchReturn {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  search: (query: string, limit?: number) => void;
  clear: () => void;
}

export function useSearch(options?: { type?: 'autocomplete' | 'vector' }): UseSearchReturn {
  const client = useAkropolysContext();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchType = options?.type ?? 'autocomplete';

  const search = useCallback((query: string, limit = 8) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      abortRef.current?.abort();
      return;
    }

    setLoading(true);
    setError(null);

    debounceTimerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = searchType === 'vector'
          ? await client.api.searchVector(query, limit, controller.signal)
          : await client.api.searchAutocomplete(query, limit, controller.signal);
        
        if (!controller.signal.aborted) {
          setResults(res.results ?? []);
          setLoading(false);
        }
      } catch (e: any) {
        if (!controller.signal.aborted) {
          let msg = e?.message ?? 'Search failed';
          try {
            const parsed = JSON.parse(msg);
            if (parsed && parsed.error) {
              msg = parsed.error;
            }
          } catch {
            // keep original text
          }
          setError(msg);
          setLoading(false);
        }
      }
    }, 300);
  }, [client, searchType]);

  const clear = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    abortRef.current?.abort();
    setResults([]);
    setError(null);
    setLoading(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);

  return { results, loading, error, search, clear };
}
