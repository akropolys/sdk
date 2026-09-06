import type { ScriptFont } from '@akropolys/sdk';
import { preloadScriptFont } from './hostFont';

const BASE_FONT = new WeakMap<object, Promise<ScriptFont | null>>();
const BASE_FONT_READY = new WeakMap<object, ScriptFont | null>();

// Resolved base font for a client that already warmed, so a reopen mounts with it.
export function readyBaseFont(client: any): ScriptFont | null {
  return client ? BASE_FONT_READY.get(client) ?? null : null;
}

export function cachedBaseFont(client: any): Promise<ScriptFont | null> {
  if (!client) return Promise.resolve(null);
  const hit = BASE_FONT.get(client);
  if (hit) return hit;
  const p = Promise.resolve()
    .then(() => client.baseFont?.() ?? null)
    .then(async (f: ScriptFont | null) => {
      if (f) await preloadScriptFont(f, 1200); // resolve on bytes, not on the descriptor, or it swaps mid-paint
      BASE_FONT_READY.set(client, f);
      return f;
    })
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
