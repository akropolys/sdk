import { useEffect } from 'react';
import type { AkropolysTheme } from '@akropolys/sdk';

const MOUNTED = new Map<string, number>();

function formatFor(url: string): string {
  const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff') return 'woff';
  if (ext === 'otf') return 'opentype';
  if (ext === 'ttf') return 'truetype';
  return '';
}

// A url() value is injected into a stylesheet, so a stray quote or paren would
// let a malicious theme close the declaration and append rules of its own.
// Everything else is allowed: absolute, protocol-relative, document-relative and
// data: URIs are all legitimate ways to point at a font, and an allow-list of
// schemes only ends up rejecting valid ones.
function safeUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (/["'()\\\s]/.test(u)) return null;
  if (/^(javascript|vbscript):/i.test(u)) return null;
  return u;
}

/**
 * Loads the developer's font for them, so `theme.fontFamily` resolves even when
 * the host page never declared it. Reference-counted: several widgets sharing a
 * theme mount one stylesheet, and it is removed once the last one unmounts.
 */
export function useHostFontFace(theme: 'light' | 'dark' | AkropolysTheme | undefined): void {
  const t = typeof theme === 'object' && theme ? theme : undefined;
  const family = t?.fontFamily?.split(',')[0].trim().replace(/^['"]|['"]$/g, '') ?? '';
  const urls = typeof t?.fontUrl === 'string' ? { normal: t.fontUrl } : (t?.fontUrl ?? {});
  const normal = urls.normal ?? '';
  const bold = urls.bold ?? '';
  const variable = urls.variable ?? '';

  useEffect(() => {
    if (!family || (!normal && !bold && !variable)) return;

    // A variable font declares the whole axis, so the browser instances the real
    // weight instead of synthesising bold off a single static cut.
    const weights: ReadonlyArray<readonly [string, string]> = variable
      ? [['100 900', variable]]
      : [['400', normal], ['700', bold]];

    const faces: string[] = [];
    for (const [weight, raw] of weights) {
      if (!raw) continue;
      const url = safeUrl(raw);
      if (!url) continue;
      const fmt = formatFor(url);
      faces.push(
        `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};` +
        `font-display:swap;src:url(${url})${fmt ? ` format("${fmt}")` : ''};}`
      );
    }
    if (faces.length === 0) return;

    const css = faces.join('');
    const key = `${family}|${normal}|${bold}|${variable}`;
    // Not btoa: it throws on anything outside Latin-1, and a non-ASCII family
    // name is exactly the case this feature exists to serve.
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    const id = `hsk-host-font-${h.toString(36)}`;

    MOUNTED.set(key, (MOUNTED.get(key) ?? 0) + 1);
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = css;
      document.head.appendChild(el);
    }

    return () => {
      const left = (MOUNTED.get(key) ?? 1) - 1;
      if (left > 0) { MOUNTED.set(key, left); return; }
      MOUNTED.delete(key);
      document.getElementById(id)?.remove();
    };
  }, [family, normal, bold, variable]);
}
