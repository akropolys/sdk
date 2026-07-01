import { useRef } from 'react';
import { AkropolysConfig } from '../types';
import { AkropolysClient, initAkropolys, getAkropolysClient } from '../client';

/**
 * @deprecated Use <AkropolysProvider> instead to avoid SSR issues.
 */
export function useAkropolys(config?: AkropolysConfig): AkropolysClient {
  const clientRef = useRef<AkropolysClient | null>(null);

  if (!clientRef.current) {
    if (config) {
      console.warn('[Akropolys] useAkropolys() is deprecated. Please wrap your application in <AkropolysProvider> instead.');
      clientRef.current = initAkropolys(config);
    } else {
      clientRef.current = getAkropolysClient();
    }
  }

  return clientRef.current!;
}
