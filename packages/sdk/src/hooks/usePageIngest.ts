import { useEffect, useRef } from 'react';
import { getAkropolysClient } from '../client';
import { stableStringify } from '../utils/stableStringify';

declare const process: any;

/**
 * Automatically captures and queues a page entity for ingestion on render.
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
