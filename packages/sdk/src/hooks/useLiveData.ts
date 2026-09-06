import { useEffect, useRef } from 'react';
import { pipeLiveData } from '../liveIngest';

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
