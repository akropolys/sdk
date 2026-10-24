import { useEffect, useState } from 'react';
import { useAkropolysContext } from '../Provider';

// The site's chosen card fields, in order; fetched on mount so a search bar alone gets them too.
export function useCardFields(): string[] {
  const client = useAkropolysContext();
  const [fields, setFields] = useState<string[]>(() => client?.api.cardFields ?? []);

  useEffect(() => {
    if (!client) return;
    let live = true;
    client.api.widgetSettings().then(s => { if (live) setFields(s.cardFields); });
    return () => { live = false; };
  }, [client]);

  return fields;
}
