import { useEffect, useRef } from 'react';
import { getAkropolysClient } from '../client';

/**
 * Registers an async context provider called dynamically at chat request time.
 *
 * @param fn - Callback returning dynamic context key-value pairs.
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
