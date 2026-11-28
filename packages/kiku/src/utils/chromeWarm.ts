import type { ScriptFont } from '@akropolys/sdk';
import { preloadScriptFont } from './hostFont';

const BASE_FONT = new WeakMap<object, Promise<ScriptFont | null>>();
const BASE_FONT_READY = new WeakMap<object, ScriptFont | null>();
const BASE_FONT_DONE = new WeakSet<object>();

// True once the base font's faces are loaded, or the server named none.
export function baseFontLoaded(client: any): boolean {
  if (!client || typeof document === 'undefined') return false;
  const f = BASE_FONT_READY.get(client);
  if (!f) return BASE_FONT_DONE.has(client);
  const fam = f.family.replace(/^['"]|['"]$/g, '');
  const faces = Array.from(((document as any).fonts ?? []) as Iterable<{ family: string; status: string }>)
    .filter(x => x.family.replace(/^['"]|['"]$/g, '') === fam);
  return faces.length > 0 && faces.every(x => x.status === 'loaded');
}

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
    .then((f: ScriptFont | null) => {
      BASE_FONT_DONE.add(client);
      if (f) {
        BASE_FONT_READY.set(client, f);
        preloadScriptFont(f, 1500).catch(() => {});
      }
      return f;
    })
    .catch(() => { BASE_FONT_DONE.add(client); return null; });
  BASE_FONT.set(client, p);
  return p;
}

// Pulled forward on hover/idle so the click doesn't pay for the round trips.
export function warmChrome(client: any, shopperLanguage: string, defaults: Record<string, string>): void {
  if (!client) return;
  cachedBaseFont(client);
  if (shopperLanguage) {
    warmLanguage(client, shopperLanguage, defaults);
  }
}

export function warmLanguage(client: any, language: string, defaults: Record<string, string>): void {
  if (!client || !language) return;
  try {
    client.getUIStrings?.(language, defaults)?.then?.((res: any) => {
      if (res?.font) {
        preloadScriptFont(res.font, 1200).catch(() => {});
      }
    })?.catch?.(() => {});
  } catch {  }
}
