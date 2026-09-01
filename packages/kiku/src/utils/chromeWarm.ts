import type { ScriptFont } from '@akropolys/sdk';

// baseFont() is a bare fetch with no client-side cache, and every component running
// useScriptFont calls it — six round trips per open. One promise per client instead.
const BASE_FONT = new WeakMap<object, Promise<ScriptFont | null>>();

export function cachedBaseFont(client: any): Promise<ScriptFont | null> {
  if (!client) return Promise.resolve(null);
  const hit = BASE_FONT.get(client);
  if (hit) return hit;
  const p = Promise.resolve()
    .then(() => client.baseFont?.() ?? null)
    .catch(() => null);
  BASE_FONT.set(client, p);
  return p;
}

// Pulled forward on hover/idle so the click doesn't pay for the round trips.
export function warmChrome(client: any, shopperLanguage: string, defaults: Record<string, string>): void {
  if (!client) return;
  cachedBaseFont(client);
  if (shopperLanguage) {
    try { client.getUIStrings?.(shopperLanguage, defaults)?.catch?.(() => {}); } catch {  }
  }
}
