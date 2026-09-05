import React, { useState, useEffect, useCallback } from 'react';
import type { ScriptFont, AkropolysTheme } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { useScriptFontFace, preloadScriptFont } from '../../../utils/hostFont';
import { cachedBaseFont } from '../../../utils/chromeWarm';
import { DEFAULT_UI_STRINGS, getLoadingMeta, type UIStringKey } from '../types';
import BUILTIN_LOCALES from '../locales.json';

export interface UseScriptFontOptions {
  shopperLanguage: string;
  theme?: 'light' | 'dark' | AkropolysTheme;
}

function getBuiltinLocale(lang: string): { strings: Record<string, string>; dir: string; bcp47: string } | null {
  if (!lang) return null;
  const l = lang.trim().toLowerCase();
  const map: Record<string, string> = {
    english: 'english',
    en: 'english',
    swahili: 'swahili',
    kiswahili: 'swahili',
    sw: 'swahili',
    french: 'french',
    français: 'french',
    francais: 'french',
    fr: 'french',
    spanish: 'spanish',
    español: 'spanish',
    espanol: 'spanish',
    es: 'spanish',
    arabic: 'arabic',
    'العربية': 'arabic',
    ar: 'arabic',
    portuguese: 'portuguese',
    português: 'portuguese',
    pt: 'portuguese',
    hindi: 'hindi',
    'हिन्दी': 'hindi',
    hi: 'hindi',
    chinese: 'chinese',
    '中文': 'chinese',
    zh: 'chinese',
    japanese: 'japanese',
    '日本語': 'japanese',
    ja: 'japanese',
    urdu: 'urdu',
    'اردو': 'urdu',
    ur: 'urdu',
  };
  const key = map[l];
  if (!key || !(key in BUILTIN_LOCALES)) return null;
  const raw = (BUILTIN_LOCALES as Record<string, Record<string, string>>)[key];
  const isRtl = key === 'arabic' || key === 'urdu';
  const bcp = key === 'arabic' ? 'ar' :
              key === 'hindi' ? 'hi' :
              key === 'chinese' ? 'zh' :
              key === 'japanese' ? 'ja' :
              key === 'urdu' ? 'ur' :
              key === 'swahili' ? 'sw' :
              key === 'french' ? 'fr' :
              key === 'spanish' ? 'es' :
              key === 'portuguese' ? 'pt' : 'en';
  return {
    strings: raw,
    dir: isRtl ? 'rtl' : 'ltr',
    bcp47: bcp,
  };
}

function resolveFirstFamily(varRef: string): string {
  const name = /var\(\s*(--[\w-]+)/.exec(varRef)?.[1];
  if (!name || typeof document === 'undefined') return '';
  for (const el of [document.documentElement, document.body]) {
    const value = el ? getComputedStyle(el).getPropertyValue(name).trim() : '';
    if (value) return value.split(',')[0].trim();
  }
  return '';
}

export function useScriptFont({ shopperLanguage, theme }: UseScriptFontOptions) {
  const client = useAkropolysContext();
  const [chromeStrings, setChromeStrings] = useState<Record<string, string>>(() => {
    const builtin = getBuiltinLocale(shopperLanguage);
    return builtin?.strings || {};
  });
  const [chromeCurated, setChromeCurated] = useState<boolean>(true);
  const [chromeReady, setChromeReady] = useState<boolean>(() => {
    return !shopperLanguage || !!getBuiltinLocale(shopperLanguage);
  });

  const dirKey = shopperLanguage ? `akropolys_ui_dir_${shopperLanguage.toLowerCase()}` : '';
  const [isRTL, setIsRTL] = useState<boolean>(() => {
    const builtin = getBuiltinLocale(shopperLanguage);
    if (builtin) return builtin.dir === 'rtl';
    const meta = getLoadingMeta(shopperLanguage);
    if (meta?.rtl) return true;
    if (typeof window === 'undefined' || !dirKey) return false;
    try { return localStorage.getItem(dirKey) === 'rtl'; } catch { return false; }
  });
  const [speechLang, setSpeechLang] = useState(() => {
    return getBuiltinLocale(shopperLanguage)?.bcp47 || '';
  });
  const [scriptFont, setScriptFont] = useState<ScriptFont | null>(null);
  const [baseFont, setBaseFont] = useState<ScriptFont | null>(null);

  useEffect(() => {
    if (!shopperLanguage) {
      setSpeechLang('');
      setScriptFont(null);
      setChromeStrings({});
      setChromeReady(true);
      setIsRTL(false);
      return;
    }
    const builtin = getBuiltinLocale(shopperLanguage);
    const meta = getLoadingMeta(shopperLanguage);
    if (builtin) {
      setChromeStrings(builtin.strings);
      setIsRTL(builtin.dir === 'rtl');
      setSpeechLang(builtin.bcp47);
      setChromeReady(true);
    } else {
      if (meta?.rtl) setIsRTL(true);
      setChromeReady(false);
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await client.getUIStrings?.(shopperLanguage, DEFAULT_UI_STRINGS);
        if (!cancelled && res?.complete) {
          setChromeCurated(res.curated !== false);
          setChromeStrings(prev => ({ ...(builtin?.strings || {}), ...res.strings }));
          setIsRTL(res.dir === 'rtl');
          setSpeechLang(res.bcp47 || builtin?.bcp47 || '');
          try { localStorage.setItem(dirKey, res.dir); } catch {  }
          // fire-and-forget: the face declares font-display:swap, so blocking the
          // chrome on a ~160KB woff2 only delays text that would render anyway
          if (res.font) void preloadScriptFont(res.font, 250);
          setScriptFont(res.font ?? null);
        }
      } catch {
        /* Builtin or defaults */
      }
      if (!cancelled) setChromeReady(true);
    })();
    return () => { cancelled = true; };
  }, [shopperLanguage, dirKey, client]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await cachedBaseFont(client);
        if (!cancelled && f) setBaseFont(f);
      } catch {

      }
    })();
    return () => { cancelled = true; };
  }, [client]);

  useScriptFontFace(scriptFont);
  useScriptFontFace(baseFont);

  const fontStack = React.useMemo(() => {
    const declared = typeof theme === 'object' && theme?.fontFamily ? theme.fontFamily : '';
    const first = declared.split(',')[0].trim();
    const isVarRef = /^var\(/i.test(first);
    const hostName = first.replace(/^['"]|['"]$/g, '');
    const resolved = isVarRef ? resolveFirstFamily(first) : '';
    const host = isVarRef
      ? (resolved ? `${resolved}, ` : '')
      : (hostName ? `"${hostName}", ` : '');

    if (scriptFont) {
      return `"${scriptFont.family}", ${host}"Geist", system-ui, sans-serif`;
    }

    const l = shopperLanguage ? shopperLanguage.trim().toLowerCase() : '';
    if (l === 'japanese' || l === 'ja' || l === '日本語') {
      return `${host}"Geist", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif`;
    }
    if (l === 'chinese' || l === 'zh' || l === '中文') {
      return `${host}"Geist", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif`;
    }
    if (l === 'urdu' || l === 'ur' || l === 'اردو') {
      return `"Noto Nastaliq Urdu", ${host}"IBM Plex Sans Arabic", "Geist", system-ui, sans-serif`;
    }
    if (l === 'arabic' || l === 'ar' || l === 'العربية') {
      return `"IBM Plex Sans Arabic", ${host}"Geist", system-ui, sans-serif`;
    }
    if (l === 'hindi' || l === 'hi' || l === 'हिन्दी') {
      return `"Hind", ${host}"Geist", system-ui, sans-serif`;
    }

    return undefined;
  }, [scriptFont, shopperLanguage, typeof theme === 'object' && theme ? theme.fontFamily : undefined]);

  const isNonLatin = React.useMemo(() => {
    let latin = 0;
    let other = 0;
    for (const v of Object.values(chromeStrings)) {
      for (const ch of v) {
        const c = ch.codePointAt(0) ?? 0;
        if (c < 0x00c0) continue;
        if (!/\p{L}/u.test(ch)) continue;
        if (c <= 0x024f) latin++;
        else other++;
      }
    }
    return other > latin;
  }, [chromeStrings]);

  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined' || !(document as any).fonts?.ready) return;
    let live = true;
    (document as any).fonts.ready.then(() => {
      if (live) setFontEpoch(e => e + 1);
    });
    return () => { live = false; };
  }, [scriptFont]);

  const hostFontCovers = React.useMemo(() => {
    if (!isNonLatin || typeof document === 'undefined') return true;
    const declared = typeof theme === 'object' && theme?.fontFamily ? theme.fontFamily : '';
    const first = declared.split(',')[0].trim();
    if (!first) return false;
    let sample = '';
    for (const v of Object.values(chromeStrings)) {
      if (v) { sample = v; break; }
    }
    if (!sample) return true;
    const text = sample.replace(/\s+/g, '');
    if (!text) return true;
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return true;
      const hostFamily = first.startsWith('var(')
        ? getComputedStyle(document.documentElement).getPropertyValue(first.slice(4, -1).trim()).trim() || first
        : first;
      ctx.font = `16px ${hostFamily}, __akropolys_nonexistent_font__`;
      const withHost = ctx.measureText(text).width;
      ctx.font = '16px __akropolys_nonexistent_font__';
      const withoutHost = ctx.measureText(text).width;
      return Math.abs(withHost - withoutHost) > 1;
    } catch {
      return true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNonLatin, chromeStrings, typeof theme === 'object' && theme ? theme.fontFamily : undefined, fontEpoch]);

  const t = useCallback((key: UIStringKey, vars?: Record<string, string>): string => {
    let s: string = chromeStrings[key] || DEFAULT_UI_STRINGS[key] || key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    }
    return s;
  }, [chromeStrings]);

  const tNode = useCallback((key: UIStringKey, vars: Record<string, string>) => {
    const s = chromeStrings[key] || DEFAULT_UI_STRINGS[key] || key;
    return s.split(/(\{[a-zA-Z]+\})/g).map((part, i) => {
      const m = part.match(/^\{([a-zA-Z]+)\}$/);
      if (m && vars[m[1]] !== undefined) return <bdi key={i}>{vars[m[1]]}</bdi>;
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  }, [chromeStrings]);

  return {
    chromeStrings,
    chromeReady,
    chromeCurated,
    isRTL,
    speechLang,
    scriptFont,
    fontStack,
    isNonLatin,
    hostFontCovers,
    t,
    tNode,
  };
}
