import { useEffect } from 'react';
import { useAkropolysContext } from '../Provider';
import { stableStringify } from '../utils/stableStringify';

declare const process: any;

export function usePageIngest(product: Record<string, any> | null | undefined): void {
  const client = useAkropolysContext();
  const payloadToQueue = product;
  // Request nonces may change while the underlying record stays unchanged.
  const fingerprint = product ? stableStringify((product as any).envelope?.entity ?? product) : '';

  useEffect(() => {
    if (!payloadToQueue) return;

    client.queueIngest(payloadToQueue)
      .catch(err => {
        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
          console.warn('[Akropolys] Ingestion failed inside usePageIngest:', err);
        }
      });
  }, [client, client.api.siteId, client.api.apiUrl, fingerprint]);
}
