import { useState, useEffect } from 'react';
import { getLiveValueInScope, subscribeLiveValuesInScope, liveValueScope, LiveValue } from '../liveValues';
import { subscribeLiveStream } from '../liveStream';
import { useAkropolysContext } from '../Provider';

export function useLiveValues(keys: string[], autoSubscribeStream = true): (LiveValue | undefined)[] {
  const [, bump] = useState(0);
  const client = useAkropolysContext();
  const joined = JSON.stringify(keys);
  const scope = liveValueScope(client);

  useEffect(() => {
    if (!autoSubscribeStream || keys.length === 0) return;
    return subscribeLiveStream({ keys, client });
  }, [joined, autoSubscribeStream, client, scope]);

  useEffect(() => {
    return subscribeLiveValuesInScope(k => {
      if (keys.includes(k)) bump(n => n + 1);
    }, scope);
  }, [joined, scope]);

  return keys.map(key => getLiveValueInScope(key, scope));
}

export function useLiveValue(key: string, autoSubscribeStream = true): LiveValue | undefined {
  const [val] = useLiveValues(key ? [key] : [], autoSubscribeStream);
  return val;
}
