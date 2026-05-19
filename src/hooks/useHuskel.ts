import { useEffect, useRef } from 'react';
import { HuskelConfig } from '../types';
import { HuskelClient, initHuskel } from '../client';

export function useHuskel(config: HuskelConfig): HuskelClient {
  const clientRef = useRef<HuskelClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = initHuskel(config);
  }

  return clientRef.current;
}
