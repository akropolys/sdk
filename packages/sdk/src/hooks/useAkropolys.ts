import { useContext, useRef } from 'react';
import { AkropolysConfig } from '../types';
import { AkropolysClient, initAkropolys, getAkropolysClient } from '../client';
import { AkropolysContext } from '../Provider';

export function useAkropolys(config?: AkropolysConfig): AkropolysClient {
  const provider = useContext(AkropolysContext);
  const clientRef = useRef<AkropolysClient | null>(null);
  if (!config && provider) return provider;

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
