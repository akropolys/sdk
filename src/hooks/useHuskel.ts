import { useRef } from 'react';
import { HuskelConfig } from '../types';
import { HuskelClient, initHuskel } from '../client';

/**
 * @deprecated Use <HuskelProvider> instead to avoid SSR issues.
 */
export function useHuskel(config: HuskelConfig): HuskelClient {
  const clientRef = useRef<HuskelClient | null>(null);

  if (!clientRef.current) {
    console.warn('[Huskel] useHuskel() is deprecated. Please wrap your application in <HuskelProvider> instead.');
    clientRef.current = initHuskel(config);
  }

  return clientRef.current;
}
