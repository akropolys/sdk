import { useEffect, useRef } from 'react';
import { getAkropolysClient } from '../client';
import { stableStringify } from '../utils/stableStringify';

declare const process: any;

/**
 * usePageIngest — drop this into any page component.
 * The moment a customer's browser renders the page, the item is
 * automatically captured and queued for ingestion.
 *
 * @example
 * export function ProductPage({ product }) {
 *   usePageIngest(product);
 *   return <div>...</div>;
 * }
 */
export function usePageIngest(product: Record<string, any> | null | undefined): void {
  const url = product?.url || (typeof window !== 'undefined' ? window.location.href : '');
  const fingerprint = product ? stableStringify({ ...product, url }) : '';
  const fingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (!product) return;
    if (fingerprintRef.current === fingerprint) return;

    fingerprintRef.current = fingerprint;

    try {
      getAkropolysClient().queueIngest({ ...product, url });
    } catch (err) {
      if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
        console.warn('[Akropolys] Ingestion failed inside usePageIngest:', err);
      }
    }
  }, [fingerprint, url]);
}
