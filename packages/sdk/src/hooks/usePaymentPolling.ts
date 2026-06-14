import { useState, useEffect, useRef } from 'react';
import { AkropolysAPI } from '../api';

export interface UsePaymentPollingProps {
  client: AkropolysAPI;
  merchantReference: string | null;
  onSuccess?: () => void;
  onFailure?: (errorMsg?: string) => void;
  intervalMs?: number;
  timeoutMs?: number;
}

export function usePaymentPolling({
  client,
  merchantReference,
  onSuccess,
  onFailure,
  intervalMs = 3000,
  timeoutMs = 300000, // 5 minutes default
}: UsePaymentPollingProps) {
  const [status, setStatus] = useState<'IDLE' | 'PENDING' | 'COMPLETED' | 'FAILED'>('IDLE');
  const [error, setError] = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
  }, [onSuccess, onFailure]);

  useEffect(() => {
    if (!merchantReference) {
      setStatus('IDLE');
      setError(null);
      return;
    }

    setStatus('PENDING');
    setError(null);

    const startTime = Date.now();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    async function checkStatus() {
      try {
        if (Date.now() - startTime >= timeoutMs) {
          setStatus('FAILED');
          setError('Payment session timed out');
          if (onFailureRef.current) onFailureRef.current('Payment session timed out');
          return;
        }

        const res = await client.getPaymentStatus(merchantReference as string);
        
        if (res.status === 'COMPLETED') {
          setStatus('COMPLETED');
          if (onSuccessRef.current) onSuccessRef.current();
        } else if (res.status === 'FAILED') {
          setStatus('FAILED');
          setError('Payment failed');
          if (onFailureRef.current) onFailureRef.current('Payment failed');
        } else {
          // Keep polling
          timerId = setTimeout(checkStatus, intervalMs);
        }
      } catch (err: any) {
        console.error('[Akropolys Polling Error]', err);
        // Treat transient network/parsing errors gracefully and retry
        timerId = setTimeout(checkStatus, intervalMs);
      }
    }

    // Start polling
    timerId = setTimeout(checkStatus, intervalMs);

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [client, merchantReference, intervalMs, timeoutMs]);

  return { status, error };
}
