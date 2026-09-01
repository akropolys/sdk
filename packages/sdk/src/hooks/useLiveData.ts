import { useEffect, useRef } from 'react';
import { pipeLiveData } from '../liveIngest';

/**
 * Streams component live data records to the platform.
 * Coalesces and batches updates per key.
 *
 * @param key - Stable identifier for the live entity (e.g. "EUR/USD", "Team A vs Team B").
 * @param fields - Map of live fields (e.g. odds, prices, score, volume).
 */
export function useLiveData(
  key: string,
  fields: Record<string, string | number | boolean | null | undefined>
): void {
  const lastRef = useRef<string>('');

  useEffect(() => {
    if (!key || !fields) return;

    const fingerprint = key + '|' + JSON.stringify(fields);
    if (lastRef.current === fingerprint) return;
    lastRef.current = fingerprint;

    pipeLiveData({ key, fields });
  });

  useEffect(() => {
    return () => {
      lastRef.current = '';
    };
  }, [key]);
}
