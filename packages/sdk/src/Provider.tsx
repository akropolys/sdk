import React, { createContext, useContext, useEffect, useRef } from 'react';
import { AkropolysClient, getAkropolysClient } from './client';
import { AkropolysConfig } from './types';

export const AkropolysContext = createContext<AkropolysClient | null>(null);

export interface AkropolysProviderProps extends AkropolysConfig {
  children: React.ReactNode;
}

/**
 * Initialises the Akropolys client for your app. Supply `siteId` and `apiToken`
 * as props or via `NEXT_PUBLIC_AKROPOLYS_*` env vars — props take precedence.
 */
export function AkropolysProvider({
  siteId,
  apiUrl,
  apiToken,
  shopperId,
  vertical,
  authLoading,
  onAction,
  onAddToCart,
  getCart,
  onError,
  display,
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
      onAction,
      onAddToCart,
      getCart,
      onError,
      display
    });
  } else {
    clientRef.current.updateConfig({
      siteId,
      apiUrl,
      apiToken,
      vertical,
      display
    });
    clientRef.current.reRegister();
  }

  // Update shopperId dynamically when it changes
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
      clientRef.current.onAction = onAction;
      clientRef.current.onAddToCart = onAddToCart;
      clientRef.current.getCart = getCart;
    }
  }, [onError, onAction, onAddToCart, getCart]);

  // Ensure active instance is registered on mount
  useEffect(() => {
    clientRef.current?.reRegister();
  }, []);

  // Clean up
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
