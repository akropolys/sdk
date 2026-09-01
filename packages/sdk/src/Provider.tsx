import React, { createContext, useContext, useEffect, useRef } from 'react';
import { AkropolysClient, getAkropolysClient } from './client';
import { AkropolysConfig } from './types';

export const AkropolysContext = createContext<AkropolysClient | null>(null);

export interface AkropolysProviderProps extends AkropolysConfig {
  children?: any;
}

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

  useEffect(() => {
    clientRef.current?.setShopperId(shopperId);
  }, [shopperId]);

  useEffect(() => {
    clientRef.current?.setAuthLoading(!!authLoading);
  }, [authLoading]);

  useEffect(() => {
    if (clientRef.current) {
      clientRef.current.onError = onError;
      clientRef.current.onAction = onAction;
      clientRef.current.onAddToCart = onAddToCart;
      clientRef.current.getCart = getCart;
    }
  }, [onError, onAction, onAddToCart, getCart]);

  useEffect(() => {
    clientRef.current?.reRegister();
  }, []);

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
