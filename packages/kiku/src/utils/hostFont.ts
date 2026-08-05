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

// The range is injected into a stylesheet, same as a url() is. It comes from
// our own manifest rather than from a theme, but it still gets a shape check
// so nothing that could close the declaration reaches the DOM.
const safeRange = (r: string): string => (/^[Uu]\+[0-9A-Fa-f,\-+ ]*$/.test(r) ? r : '');

// Shared by both hooks: mount a stylesheet once per distinct key, remove it
// when the last widget using it unmounts.
function useMountedFaces(key: string, css: string): void {
  useEffect(() => {
    if (!key || !css || typeof document === 'undefined') return;
    // Not btoa: it throws on anything outside Latin-1, and a non-ASCII family
    // name is exactly the case this feature exists to serve.
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

/**
 * Loads the script font the backend resolved for the shopper's language, from
 * our own origin. The panel used to @import Space Grotesk straight from
 * fonts.googleapis.com, which strict merchant CSPs block outright and which
 * hands every shopper's IP to Google from inside someone else's page.
 *
 * font-display: swap on purpose — the shopper reads the panel in a system face
 * immediately and it upgrades when the file lands, rather than staring at
 * invisible text on a slow connection.
 */
function scriptFontCSS(font: ScriptFont): string {
  return font.faces
    .map(f => {
      const url = safeUrl(f.url);
      if (!url) return '';
      return `@font-face{font-family:"${font.family}";font-style:normal;` +
        `font-weight:100 900;font-display:swap;src:url(${url}) format("woff2");` +
        (safeRange(f.unicodeRange) ? `unicode-range:${safeRange(f.unicodeRange)};` : '') + '}';
    })
    .join('');
}

export function useScriptFontFace(font: ScriptFont | null | undefined): void {
  const faces = font?.faces ?? [];
  const css = font && faces.length ? scriptFontCSS(font) : '';
  useMountedFaces(css ? `script|${font!.family}|${faces.map(f => f.url).join('|')}` : '', css);
}

/**
 * Mounts the @font-face rule for `font` (idempotent — safe to call alongside
 * useScriptFontFace, which the same font will also be passed to) and resolves
 * once the browser has actually rasterized it, or after `timeoutMs`, whichever
 * comes first.
 *
 * Used to hold chrome text off-screen until the real glyphs are ready, instead
 * of painting the system font and swapping a moment later once the file lands
 * — font-display: swap is right for a paragraph the shopper is already reading
 * mid-conversation, but wrong for the first paint of a screen that has nothing
 * on it yet to lose by waiting the small amount this actually takes.
 */
export async function preloadScriptFont(font: ScriptFont, timeoutMs = 1200): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const css = scriptFontCSS(font);
  if (!css) return;

  // Not btoa: it throws on anything outside Latin-1, and a non-ASCII family
  // name is exactly the case this feature exists to serve. Matches the id
  // useMountedFaces would derive for the same key, so this and the hook never
  // double-mount the same rule.
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
    // A specific size doesn't matter for load() — only the family/weight
    // combination is looked up — but the API requires one.
    fonts.load(`16px "${font.family}"`).catch(() => {})
  );
  await Promise.race([
    Promise.all(loads),
    new Promise(resolve => setTimeout(resolve, timeoutMs)),
  ]);
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
