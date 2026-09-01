import { useEffect } from 'react';
import type { AkropolysTheme, ScriptFont } from '@akropolys/sdk';

const MOUNTED = new Map<string, number>();

function formatFor(url: string): string {
  const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff') return 'woff';
  if (ext === 'otf') return 'opentype';
  if (ext === 'ttf') return 'truetype';
  return '';
}

function safeUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (/["'()\\\s]/.test(u)) return null;
  if (/^(javascript|vbscript):/i.test(u)) return null;
  return u;
}

const RANGE_SEGMENT = /^[Uu]\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?$/;

const safeRange = (r: string): string => {
  const parts = r.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0 || !parts.every(p => RANGE_SEGMENT.test(p))) return '';
  return parts.join(', ');
};

const safeWeight = (w: string): string => (/^\d{3}( \d{3})?$/.test(w) ? w : '400');

function useMountedFaces(key: string, css: string): void {
  useEffect(() => {
    if (!key || !css || typeof document === 'undefined') return;
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    const id = `hsk-font-${h.toString(36)}`;

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
  }, [key, css]);
}

function scriptFontCSS(font: ScriptFont): string {
  return font.faces
    .map(f => {
      const url = safeUrl(f.url);
      if (!url) return '';
      return `@font-face{font-family:"${font.family}";font-style:normal;` +
        `font-weight:${safeWeight(f.weight)};font-display:swap;src:url(${url}) format("woff2");` +
        (safeRange(f.unicodeRange) ? `unicode-range:${safeRange(f.unicodeRange)};` : '') + '}';
    })
    .join('');
}

export function useScriptFontFace(font: ScriptFont | null | undefined): void {
  const faces = font?.faces ?? [];
  const css = font && faces.length ? scriptFontCSS(font) : '';
  useMountedFaces(css ? `script|${font!.family}|${faces.map(f => f.url).join('|')}` : '', css);
}

export async function preloadScriptFont(font: ScriptFont, timeoutMs = 1200): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const css = scriptFontCSS(font);
  if (!css) return;

  const key = `script|${font.family}|${font.faces.map(f => f.url).join('|')}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  const id = `hsk-font-${h.toString(36)}`;
  if (!document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }

  const fonts = (document as any).fonts;
  const loads = font.faces.map(() =>
    fonts.load(`16px "${font.family}"`).catch(() => {})
  );
  await Promise.race([
    Promise.all(loads),
    new Promise(resolve => setTimeout(resolve, timeoutMs)),
  ]);
}

export function useHostFontFace(theme: 'light' | 'dark' | AkropolysTheme | undefined): void {
  const t = typeof theme === 'object' && theme ? theme : undefined;
  const family = t?.fontFamily?.split(',')[0].trim().replace(/^['"]|['"]$/g, '') ?? '';
  const urls = typeof t?.fontUrl === 'string' ? { normal: t.fontUrl } : (t?.fontUrl ?? {});
  const normal = urls.normal ?? '';
  const bold = urls.bold ?? '';
  const variable = urls.variable ?? '';

  useEffect(() => {
    if (!family || (!normal && !bold && !variable)) return;

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
