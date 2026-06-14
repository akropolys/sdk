import { useEffect, useRef } from 'react';
import { useIngest } from './useIngest';
import { stableStringify } from '../utils/stableStringify';

/**
 * useListIngest — drop this into any collection, catalog, or list component.
 * It automatically ingests all items in the array, using a built-in
 * component-lifecycle ref guard to prevent duplicate calls during mounts.
 *
 * @example
 * export function CategoryPage({ products }) {
 *   useListIngest(products);
 *   return <ProductGrid products={products} />;
 * }
 */
export function useListIngest(items: Record<string, any>[] | null | undefined): void {
  const { ingestBatch } = useIngest();
  const processedFingerprintsRef = useRef<Map<string, string>>(new Map());

  // Create a stable dependency key representing the items and their contents currently in the list
  const listKey = items ? stableStringify(items) : '';

  useEffect(() => {
    if (!items || !items.length) return;

    // Filter out items that have already been queued in this component's mount lifecycle with the same contents
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
