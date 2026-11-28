import { useEffect } from 'react';
import type { AkropolysTheme, ScriptFont } from '@akropolys/sdk';

const MOUNTED = new Map<string, number>();

// Arial (Roboto on Android) sized to Geist's widths, so a late Geist swaps without moving text.
const LATIN = 'U+0000-00FF,U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2000-206F,U+2074,U+20A0-20C0,U+2113,U+2122,U+2191,U+2193,U+2212,U+2215,U+2C60-2C7F,U+A720-A7FF,U+FEFF,U+FFFD';
const REGULAR = 'local("Arial"),local("ArialMT"),local("Helvetica"),local("Roboto"),local("Roboto-Regular")';
const BOLD = 'local("Arial Bold"),local("Arial-BoldMT"),local("Helvetica Bold"),local("Roboto Bold"),local("Roboto-Bold")';
// Headings without a local bold (Android) use the regular face, sized to Geist 600; a later face that fails to load is skipped.
const FALLBACKS: Array<[string, string, number]> = [[REGULAR, '100 449', 101.5], [REGULAR, '450 549', 104], [REGULAR, '550 900', 106.4], [BOLD, '550 900', 99.3]];
let fallbackAdded = false;

// Added and loaded up front: a local face still loads on first use, which would miss the modal's first frame.
export function ensureFallbackFace(): void {
  if (fallbackAdded || typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  fallbackAdded = true;
  for (const [src, weight, size] of FALLBACKS) {
    try {
      const face = new FontFace('Geist Fallback', src, {
        weight, unicodeRange: LATIN, sizeAdjust: `${size}%`, ascentOverride: `${(10100 / size).toFixed(1)}%`,
        descentOverride: `${(3000 / size).toFixed(1)}%`, lineGapOverride: '0%',
      } as FontFaceDescriptors);
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch { /* noop */ }
  }
}

function styleId(key: string, prefix = 'hsk-font'): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return `${prefix}-${h.toString(36)}`;
}

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

const safeFamily = (f: string): string => (/["\\{}<>;\n\r]/.test(f) ? '' : f.trim());

const RANGE_SEGMENT =/^[Uu]\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?$/;

const safeRange = (r: string): string => {
  const parts = r.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0 || !parts.every(p => RANGE_SEGMENT.test(p))) return '';
  return parts.join(', ');
};

const safeWeight = (w: string): string => (/^\d{3}( \d{3})?$/.test(w) ? w : '400');

function useMountedFaces(key: string, css: string): void {
  useEffect(() => {
    if (!key || !css || typeof document === 'undefined') return;
    const id = styleId(key);

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
  const family = safeFamily(font.family);
  if (!family) return '';
  return font.faces
    .map(f => {
      const url = safeUrl(f.url);
      if (!url) return '';
      return `@font-face{font-family:"${family}";font-style:normal;` +
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

export async function preloadScriptFont(font: ScriptFont, timeoutMs = 0): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const css = scriptFontCSS(font);
  if (!css) return;

  const key = `script|${font.family}|${font.faces.map(f => f.url).join('|')}`;
  MOUNTED.set(key, (MOUNTED.get(key) ?? 0) + 1);
  const id = styleId(key);
  if (!document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }

  if (timeoutMs > 0) {
    const fonts = (document as any).fonts;
    const cleanFamily = font.family.replace(/^['"]|['"]$/g, '');
    const matched = Array.from(fonts || []).filter(
      (f: any) => f.family.replace(/^['"]|['"]$/g, '') === cleanFamily
    ) as any[];

    const loads = matched.length > 0
      ? matched.map((f: any) => f.load().catch(() => {}))
      : font.faces.map(f => {
          const url = safeUrl(f.url);
          if (!url) return Promise.resolve();
          try {
            const face = new (window as any).FontFace(cleanFamily, `url(${url})`, {
              weight: safeWeight(f.weight),
              style: 'normal',
            });
            return face.load().then((loaded: any) => {
              (document as any).fonts?.add(loaded);
            }).catch(() => {});
          } catch {
            return Promise.resolve();
          }
        });

    await Promise.race([
      Promise.all(loads),
      new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  }
}

const UI_WEIGHTS = ['400', '500', '600', '700'];

function fontQuery(families: string[], strings: Record<string, string>) {
  const text = Array.from(new Set(Array.from(Object.values(strings).join('')))).join('');
  const stack = families.map(f => `"${f.replace(/^['"]|['"]$/g, '')}"`).join(', ');
  return { text, stack };
}

// True when every face these strings need is already loaded at every weight the widget draws.
export function fontsLoadedFor(families: string[], strings: Record<string, string>): boolean {
  const fonts = typeof document !== 'undefined' ? (document as any).fonts : null;
  const { text, stack } = fontQuery(families, strings);
  if (!fonts?.check || !text || !stack) return true;
  try {
    return UI_WEIGHTS.every(w => fonts.check(`${w} 16px ${stack}`, text));
  } catch {
    return true;
  }
}

// Loads, at every weight the widget draws, each face these strings need; unicode-range faces load only their slices.
export async function loadFontsFor(families: string[], strings: Record<string, string>, timeoutMs: number): Promise<void> {
  const fonts = typeof document !== 'undefined' ? (document as any).fonts : null;
  if (!fonts?.load) return;
  const { text, stack } = fontQuery(families, strings);
  if (!text || !stack) return;
  await Promise.race([
    Promise.all(UI_WEIGHTS.map(w => fonts.load(`${w} 16px ${stack}`, text).catch(() => {}))),
    new Promise(resolve => setTimeout(resolve, timeoutMs)),
  ]);
}

export function useHostFontFace(theme: 'light' | 'dark' | AkropolysTheme | undefined): void {
  const t = typeof theme === 'object' && theme ? theme : undefined;
  const family = safeFamily(t?.fontFamily?.split(',')[0].trim().replace(/^['"]|['"]$/g, '') ?? '');
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
    const id = styleId(key, 'hsk-host-font');

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
