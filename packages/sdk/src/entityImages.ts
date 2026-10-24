import type { EntityImage } from './types';
/** Preserve order and captions; ignore malformed legacy metadata. */
export function normalizeEntityImages(raw: unknown, cover?: string, base?: string): EntityImage[] {
  let resolvedBase: string | undefined;
  try { resolvedBase = base ? new URL(base, typeof document !== 'undefined' ? document.baseURI : undefined).href : typeof document !== 'undefined' ? document.baseURI : undefined; } catch { resolvedBase = undefined; }
  const result: EntityImage[] = [];
  const seen = new Set<string>();
  const add = (entry: unknown) => {
    const item = typeof entry === 'string' ? { url: entry } : entry as Partial<EntityImage> | null;
    if (!item || typeof item.url !== 'string' || !item.url.trim()) return;
    let url: string;
    try {
      const resolved = new URL(item.url.trim(), resolvedBase);
      if (!['http:', 'https:'].includes(resolved.protocol)) return;
      url = resolved.href;
    } catch { return; }
    if (seen.has(url)) return;
    seen.add(url);
    result.push({ url, ...(typeof item.alt === 'string' ? { alt: item.alt } : {}), ...(typeof item.caption === 'string' ? { caption: item.caption } : {}) });
  };
  if (Array.isArray(raw)) raw.forEach(add);
  if (cover) {
    const previous = result.length;
    add(cover);
    if (result.length > previous) result.unshift(result.pop()!);
  }
  return result;
}
