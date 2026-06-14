import { useEffect, useRef } from 'react';
import { RawProductInput } from '../types';
import { getAkropolysClient } from '../client';
import { stableStringify } from '../utils/stableStringify';

/**
 * usePageIngest — drop this into any product page component.
 * The moment a customer's browser renders the page, the product is
 * automatically captured and queued for ingestion into the vector index.
 *
 * No configuration needed beyond <AkropolysProvider> in your layout.
 *
 * @example
 * // Product detail page — Next.js or React
 * export function ProductPage({ product }) {
 *   usePageIngest({
 *     name: product.title,
 *     price: product.price,
 *     url: window.location.href,
 *     images: [product.thumbnail],
 *     category: product.category,
 *   });
 *   return <div>...</div>;
 * }
 */
export function usePageIngest(product: RawProductInput | null | undefined): void {
  const url = product?.url || (typeof window !== 'undefined' ? window.location.href : '');
  const fingerprint = product ? stableStringify({ ...product, url }) : '';
  const fingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (!product) return;

    // Guard: only ingest once per content change per component lifecycle
    if (fingerprintRef.current === fingerprint) return;
    fingerprintRef.current = fingerprint;

    try {
      getAkropolysClient().queueIngest({ ...product, url });
    } catch {
      // Client not initialised — silently skip
    }
  }, [fingerprint, url]);
}
