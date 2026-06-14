import { useCallback } from 'react';
import { useAkropolysContext } from '../Provider';
import { stableStringify } from '../utils/stableStringify';

export type RawItem = Record<string, any>;

interface UseIngestReturn {
  ingest: (product: RawItem) => void;
  ingestBatch: (products: RawItem[]) => void;
  /**
   * @deprecated Ingest is fire-and-forget. This is always `false` and will be
   * removed in the next major version. Remove it from your destructuring.
   */
  loading: false;
  /**
   * @deprecated Ingest is fire-and-forget. This is always `null` and will be
   * removed in the next major version. Remove it from your destructuring.
   */
  error: null;
}

// Module-level TTL cache (24 hours TTL) to prevent duplicate ingestion requests in the same session
const recentlyIngested = new Map<string, { fingerprint: string; timestamp: number }>();

function getProductKey(p: RawItem): string | null {
  return p.id || p.productId || p.slug || p.url || p.name || p.title || p.productName || null;
}

export function useIngest(): UseIngestReturn {
  const client = useAkropolysContext();

  const ingest = useCallback((product: RawItem) => {
    const key = getProductKey(product);
    const fingerprint = stableStringify(product);
    if (key) {
      const cached = recentlyIngested.get(key);
      if (cached && cached.fingerprint === fingerprint && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        return;
      }
      recentlyIngested.set(key, { fingerprint, timestamp: Date.now() });
    }
    // Fire-and-forget — errors are logged internally by the client
    client.queueIngest(product).catch(() => {});
  }, [client]);

  const ingestBatch = useCallback((products: RawItem[]) => {
    const toIngest = products.filter(p => {
      const key = getProductKey(p);
      const fingerprint = stableStringify(p);
      if (!key) return true;
      const cached = recentlyIngested.get(key);
      if (cached && cached.fingerprint === fingerprint && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        return false;
      }
      recentlyIngested.set(key, { fingerprint, timestamp: Date.now() });
      return true;
    });

    if (!toIngest.length) return;
    // Fire-and-forget — errors are logged internally by the client
    client.queueIngestBatch(toIngest).catch(() => {});
  }, [client]);

  // loading/error kept as stable literals for backwards compatibility.
  return { ingest, ingestBatch, loading: false, error: null };
}
