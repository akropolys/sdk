import { useCallback } from 'react';
import { RawProductInput } from '../types';
import { useAkropolysContext } from '../components/AkropolysProvider';
import { stableStringify } from '../utils/stableStringify';

interface UseIngestReturn {
  ingest: (product: RawProductInput) => void;
  ingestBatch: (products: RawProductInput[]) => void;
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

/**
 * useIngest — queue products for ingestion into the Akropolys vector index.
 *
 * Ingest is intentionally **fire-and-forget**. The SDK has a built-in 24h
 * dedup cache (per URL) and an offline retry queue, so you don't need to
 * track loading/error state.
 *
 * ⚠️  Always call `ingestBatch` inside a `useEffect` with a ref guard to
 * prevent duplicate calls on re-renders (e.g. when auth state resolves):
 *
 * @example
 * const { ingestBatch } = useIngest();
 * const hasIngested = useRef(false);
 *
 * useEffect(() => {
 *   if (hasIngested.current) return;
 *   hasIngested.current = true;
 *   ingestBatch(products);
 * // eslint-disable-next-line react-hooks/exhaustive-deps
 * }, []);
 */
// Module-level cache to prevent duplicate ingestion requests in the same session, with 24h TTL
const recentlyIngested = new Map<string, { fingerprint: string; timestamp: number }>();

function getProductKey(p: RawProductInput): string | null {
  return p.url || p.id || p.productId || p.slug || p.name || p.title || p.productName || null;
}

export function useIngest(): UseIngestReturn {
  const client = useAkropolysContext();

  const ingest = useCallback((product: RawProductInput) => {
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

  const ingestBatch = useCallback((products: RawProductInput[]) => {
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
  // They no longer trigger re-renders, which was the root cause of 429 floods.
  return { ingest, ingestBatch, loading: false, error: null };
}
