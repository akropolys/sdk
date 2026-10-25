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
  voiceUrl,
  apiToken,
  shopperId,
  userProof,
  actionHeaders,
  actionAuth,
  authLoading,
  onError,
  children
}: AkropolysProviderProps & { voiceUrl?: string }) {
  const clientRef = useRef<AkropolysClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new AkropolysClient({
      siteId,
      apiUrl,
      voiceUrl,
      apiToken,
      shopperId,
      userProof,
      actionHeaders,
      actionAuth,
      authLoading,
      onError
    });
  } else {
    clientRef.current.updateConfig({
      siteId,
      apiUrl,
      voiceUrl,
      apiToken,
      actionAuth,
      actionHeaders
    });
    clientRef.current.reRegister();
  }

  useEffect(() => {
    clientRef.current?.setShopperId(shopperId);
  }, [shopperId]);

  useEffect(() => {
    if (clientRef.current) clientRef.current.api.actionHeaders = actionHeaders;
  }, [actionHeaders]);

  useEffect(() => {
    clientRef.current?.setUserProof(userProof);
  }, [userProof]);

  useEffect(() => {
    clientRef.current?.setAuthLoading(!!authLoading);
  }, [authLoading]);

  useEffect(() => {
    if (clientRef.current) {
      clientRef.current.onError = onError;
    }
  }, [onError]);

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
