import { useEffect, useRef } from 'react';
import { useAkropolysContext } from '../Provider';
import type { AkropolysClient } from '../client';

export function useLiveContext(fn: (signal?: AbortSignal) => Promise<Record<string, any>>): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  let client: AkropolysClient | null = null;
  try {
    client = useAkropolysContext();
  } catch {
    client = null;
  }
  useEffect(() => {
    if (!client) {
      console.warn('[Akropolys] useLiveContext: client not initialized. Provider not registered.');
      return;
    }
    return client.registerContextProvider((signal) => fnRef.current(signal));
  }, [client]);
}
