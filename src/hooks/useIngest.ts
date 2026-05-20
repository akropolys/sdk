import { useCallback, useState } from 'react';
import { RawProductInput } from '../types';
import { useHuskelContext } from '../components/HuskelProvider';

interface UseIngestReturn {
  ingest: (product: RawProductInput) => Promise<void>;
  ingestBatch: (products: RawProductInput[]) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useIngest(): UseIngestReturn {
  const client = useHuskelContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingest = useCallback(async (product: RawProductInput) => {
    setLoading(true);
    setError(null);
    try {
      await client.queueIngest(product);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Ingest failed');
    } finally {
      setLoading(false);
    }
  }, [client]);

  const ingestBatch = useCallback(async (products: RawProductInput[]) => {
    if (!products.length) return;
    setLoading(true);
    setError(null);
    try {
      await client.queueIngestBatch(products);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Batch ingest failed');
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { ingest, ingestBatch, loading, error };
}
