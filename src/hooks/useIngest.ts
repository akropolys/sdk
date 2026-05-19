import { useCallback, useState } from 'react';
import { Product } from '../types';
import { getHuskelClient } from '../client';

interface UseIngestReturn {
  ingest: (product: Product) => Promise<void>;
  ingestBatch: (products: Product[]) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useIngest(): UseIngestReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingest = useCallback(async (product: Product) => {
    setLoading(true);
    setError(null);
    try {
      await getHuskelClient().api.ingest(product);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Ingest failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const ingestBatch = useCallback(async (products: Product[]) => {
    if (!products.length) return;
    setLoading(true);
    setError(null);
    try {
      await getHuskelClient().api.ingestBatch(products);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Batch ingest failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return { ingest, ingestBatch, loading, error };
}
