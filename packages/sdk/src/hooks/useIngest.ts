import { useState, useCallback } from 'react';
import { useAkropolysContext } from '../Provider';
import { stableStringify } from '../utils/stableStringify';

export type RawItem = Record<string, any>;

interface UseIngestReturn {
  ingest: (product: RawItem) => Promise<void>;
  ingestBatch: (products: RawItem[]) => Promise<void>;
  status: 'idle' | 'loading' | 'success' | 'error';
  loading: boolean;
  error: Error | null;
}

const recentlyIngested = new Map<string, { fingerprint: string; timestamp: number }>();

function getProductKey(p: RawItem): string | null {
  return p.id || p.productId || p.slug || p.url || p.name || p.title || p.productName || null;
}

export function useIngest(): UseIngestReturn {
  const client = useAkropolysContext();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<Error | null>(null);

  const ingest = useCallback(async (product: RawItem) => {
    const key = getProductKey(product);
    const fingerprint = stableStringify(product);
    if (key) {
      const cached = recentlyIngested.get(key);
      if (cached && cached.fingerprint === fingerprint && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        setStatus('success');
        setError(null);
        return;
      }
    }

    setStatus('loading');
    setError(null);

    try {
      await client.api.ingest(product);
      if (key) {
        recentlyIngested.set(key, { fingerprint, timestamp: Date.now() });
      }
      setStatus('success');
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus('error');
    }
  }, [client]);

  const ingestBatch = useCallback(async (products: RawItem[]) => {
    const toIngest = products.filter(p => {
      const key = getProductKey(p);
      const fingerprint = stableStringify(p);
      if (!key) return true;
      const cached = recentlyIngested.get(key);
      if (cached && cached.fingerprint === fingerprint && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        return false;
      }
      return true;
    });

    if (!toIngest.length) {
      setStatus('success');
      setError(null);
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      await client.api.ingestBatch(toIngest);
      toIngest.forEach(p => {
        const key = getProductKey(p);
        if (key) {
          recentlyIngested.set(key, { fingerprint: stableStringify(p), timestamp: Date.now() });
        }
      });
      setStatus('success');
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus('error');
    }
  }, [client]);

  return {
    ingest,
    ingestBatch,
    status,
    loading: status === 'loading',
    error,
  };
}
