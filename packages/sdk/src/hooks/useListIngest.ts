import { useEffect, useRef } from 'react';
import { useIngest } from './useIngest';
import { stableStringify } from '../utils/stableStringify';

/**
 * Automatically ingests an array of catalog items with deduplication guards.
 */
export function useListIngest(items: Record<string, any>[] | null | undefined): void {
  const { ingestBatch } = useIngest();
  const processedFingerprintsRef = useRef<Map<string, string>>(new Map());

  const listKey = items ? stableStringify(items) : '';

  useEffect(() => {
    if (!items || !items.length) return;

    const newItems = items.filter((item) => {
      const id = item.id ?? item.productId ?? item.slug ?? item.url ?? item.name ?? '';
      if (!id) return true; // Let the queue handle validation/deduplication if no identifier is present

      const fingerprint = stableStringify(item);
      const cached = processedFingerprintsRef.current.get(id);
      if (cached === fingerprint) {
        return false;
      }
      processedFingerprintsRef.current.set(id, fingerprint);
      return true;
    });

    if (newItems.length > 0) {
      ingestBatch(newItems);
    }
  }, [listKey, ingestBatch]);
}
