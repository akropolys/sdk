import { useState, useCallback, useRef, useEffect } from 'react';
import { SearchResult } from '../types';
import { useAkropolys } from './useAkropolys';

interface UseSearchReturn {
  results: SearchResult[];
  loading: boolean;
  error: any;
  search: (query: string, limit?: number) => void;
  searchStream: (query: string) => Promise<void>;
  output: string;
  clear: () => void;
}

export function useSearch(options?: { type?: 'autocomplete' | 'vector' }): UseSearchReturn {
  const client = useAkropolys();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [output, setOutput] = useState('');

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

  const searchStream = useCallback(async (query: string) => {
    if (!query.trim()) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const abortController = new AbortController();
    abortRef.current = abortController;

    setLoading(true);
    setError(null);
    setOutput(''); // Flush viewport

    try {
      // Pass an immediate delta consumer directly into the agnostic core
      await client.entities.query(
        { q: query },
        {
          signal: abortController.signal,
          onToken: (token: string) => {
            setOutput((prev) => prev + token); // Append token chunks the millisecond they hit the wire
          }
        }
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, [client]);

  const clear = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    abortRef.current?.abort();
    setResults([]);
    setOutput('');
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

  return { results, loading, error, search, searchStream, output, clear };
}
