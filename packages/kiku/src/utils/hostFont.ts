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
function safeUrl(url: string): string | null {
  if (/["'()\\\s]/.test(url)) return null;
  if (!/^(https?:\/\/|\/)/i.test(url)) return null;
  return url;
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

  useEffect(() => {
    if (!family || (!normal && !bold)) return;

    const faces: string[] = [];
    for (const [weight, raw] of [['400', normal], ['700', bold]] as const) {
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
    const key = `${family}|${normal}|${bold}`;
    const id = `hsk-host-font-${btoa(key).replace(/[^a-zA-Z0-9]/g, '')}`;

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
  }, [family, normal, bold]);
}
