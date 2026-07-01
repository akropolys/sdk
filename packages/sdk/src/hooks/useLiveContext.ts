import { useEffect, useRef } from 'react';
import { getAkropolysClient } from '../client';

/**
 * useLiveContext — register an async function that is called at chat time
 * (when the user sends a message), not at render time. The result is merged
 * into currentContext.raw and sent to the LLM on every request.
 *
 * Use this for sub-second volatile data — live prices, inventory, bid status,
 * active user counts — that would be stale by the time an ingestion cycle runs.
 *
 * The optional AbortSignal lets you cancel the fetch when the user aborts the
 * chat request (e.g. hits Stop).
 *
 * @example
 * useLiveContext(async (signal) => ({
 *   current_price: await fetchLivePrice(productId, { signal }),
 *   stock_remaining: await fetchInventory(productId, { signal }),
 * }));
 */
export function useLiveContext(fn: (signal?: AbortSignal) => Promise<Record<string, any>>): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    try {
      const client = getAkropolysClient();
      return client.registerContextProvider((signal) => fnRef.current(signal));
    } catch {
      console.warn('[Akropolys] useLiveContext: client not initialized. Provider not registered.');
    }
  }, []);
}
