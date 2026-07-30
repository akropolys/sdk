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
  const isSigned = !!(product as any)?.envelope;
  const url = isSigned
    ? (product as any)?.envelope?.entity?.url || (typeof window !== 'undefined' ? window.location.href : '')
    : (product?.url || (typeof window !== 'undefined' ? window.location.href : ''));
  const payloadToQueue = isSigned ? product : { ...product, url };
  const fingerprint = product ? stableStringify(payloadToQueue) : '';
  const fingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (!payloadToQueue) return;
    if (fingerprintRef.current === fingerprint) return;

    fingerprintRef.current = fingerprint;

    getAkropolysClient()
      .queueIngest(payloadToQueue)
      .catch(err => {
        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
          console.warn('[Akropolys] Ingestion failed inside usePageIngest:', err);
        }
      });
  }, [fingerprint, url]);
}
