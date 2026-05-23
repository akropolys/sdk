'use client';

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { HuskelClient, getHuskelClient } from '../client';
import { HuskelConfig } from '../types';

export const HuskelContext = createContext<HuskelClient | null>(null);

interface HuskelProviderProps extends HuskelConfig {
  children: React.ReactNode;
}

export function HuskelProvider({ siteId, apiUrl, apiToken, shopperId, children }: HuskelProviderProps) {
  const clientRef = useRef<HuskelClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new HuskelClient({ siteId, apiUrl, apiToken, shopperId });
  }

  // Update shopperId dynamically when it changes (e.g., shopper logs in/out)
  useEffect(() => {
    clientRef.current?.setShopperId(shopperId);
  }, [shopperId]);

  // Clean up the online listener and timers when the provider unmounts
  // (prevents leaks during hot module reload and React StrictMode double-mount)
  useEffect(() => {
    return () => {
      clientRef.current?.destroy();
    };
  }, []);

  return (
    <HuskelContext.Provider value={clientRef.current}>
      {children}
    </HuskelContext.Provider>
  );
}

export function useHuskelContext(): HuskelClient {
  const context = useContext(HuskelContext);
  if (!context) {
    return getHuskelClient();
  }
  return context;
}

