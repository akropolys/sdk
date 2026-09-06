import { useEffect, useRef } from 'react';
import { getAkropolysClient } from '../client';

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
