'use client';

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { AkropolysClient, getAkropolysClient } from '../client';
import { AkropolysConfig } from '../types';

export const AkropolysContext = createContext<AkropolysClient | null>(null);

interface AkropolysProviderProps extends AkropolysConfig {
  children: React.ReactNode;
}

export function AkropolysProvider({
  siteId,
  apiUrl,
  apiToken,
  shopperId,
  vertical,
  authLoading,
  onCheckout,
  onError,
  children
}: AkropolysProviderProps) {
  const clientRef = useRef<AkropolysClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new AkropolysClient({
      siteId,
      apiUrl,
      apiToken,
      shopperId,
      vertical,
      authLoading,
      onCheckout,
      onError
    });
  } else {
    clientRef.current.reRegister();
  }

  // Update shopperId dynamically when it changes (e.g., shopper logs in/out)
  useEffect(() => {
    clientRef.current?.setShopperId(shopperId);
  }, [shopperId]);

  // Update authLoading dynamically when it changes
  useEffect(() => {
    clientRef.current?.setAuthLoading(!!authLoading);
  }, [authLoading]);

  // Update dynamic callbacks
  useEffect(() => {
    if (clientRef.current) {
      clientRef.current.onError = onError;
      clientRef.current.onCheckout = onCheckout;
    }
  }, [onError, onCheckout]);

  // Ensure active instance is registered on mount (handles development double-mounts and fast refresh)
  useEffect(() => {
    clientRef.current?.reRegister();
  }, []);

  // Clean up the online listener and timers when the provider unmounts
  // (prevents leaks during hot module reload and React StrictMode double-mount)
  useEffect(() => {
    return () => {
      clientRef.current?.destroy();
    };
  }, []);

  return (
    <AkropolysContext.Provider value={clientRef.current}>
      {children}
    </AkropolysContext.Provider>
  );
}

export function useAkropolysContext(): AkropolysClient {
  const context = useContext(AkropolysContext);
  if (!context) {
    return getAkropolysClient();
  }
  return context;
}

