import { useState, useEffect } from 'react';
import { getLiveValue, subscribeLiveValues, LiveValue } from '../liveValues';
import { subscribeLiveStream } from '../liveStream';
import { useAkropolysContext } from '../Provider';

export function useLiveValues(keys: string[], autoSubscribeStream = true): (LiveValue | undefined)[] {
  const [, bump] = useState(0);
  const client = useAkropolysContext();
  const joined = JSON.stringify(keys);

  useEffect(() => {
    if (!autoSubscribeStream || keys.length === 0) return;
    return subscribeLiveStream({ keys, client });
  }, [joined, autoSubscribeStream, client]);

  useEffect(() => {
    return subscribeLiveValues(k => {
      if (keys.includes(k)) bump(n => n + 1);
    });
  }, [joined]);

  return keys.map(getLiveValue);
}

export function useLiveValue(key: string, autoSubscribeStream = true): LiveValue | undefined {
  const [val] = useLiveValues(key ? [key] : [], autoSubscribeStream);
  return val;
}
