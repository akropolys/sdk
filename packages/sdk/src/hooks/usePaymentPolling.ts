import { useState, useEffect, useRef } from 'react';
import { AkropolysAPI } from '../api';
import { pollTransactionStatus } from '../utils/poll';

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

    let cancelled = false;
    const clientId = (client as any).siteId || merchantReference || 'payment-client';

    // Calculate maxAttempts based on timeoutMs (backoff max delay is 30s)
    const maxAttempts = timeoutMs ? Math.max(5, Math.ceil(timeoutMs / 30000) + 4) : 15;

    const checkStatus = async () => {
      if (cancelled) {
        return { completed: true };
      }
      try {
        const res = await client.getPaymentStatus(merchantReference);
        if (cancelled) {
          return { completed: true };
        }
        if (res.status === 'COMPLETED') {
          setStatus('COMPLETED');
          if (onSuccessRef.current) onSuccessRef.current();
          return { completed: true };
        }
        if (res.status === 'FAILED') {
          setStatus('FAILED');
          const errText = res.message || 'Payment failed';
          setError(errText);
          if (onFailureRef.current) onFailureRef.current(errText);
          return { completed: true };
        }
        return { completed: false };
      } catch (err: any) {
        if (cancelled) {
          return { completed: true };
        }
        console.error('[Akropolys Polling Error]', err);
        return { completed: false };
      }
    };

    pollTransactionStatus(clientId, checkStatus, maxAttempts, 30_000)
      .catch((err) => {
        if (!cancelled) {
          setStatus('FAILED');
          setError(err.message || 'Payment session timed out');
          if (onFailureRef.current) {
            onFailureRef.current(err.message || 'Payment session timed out');
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, merchantReference, timeoutMs]);

  return { status, error };
}
