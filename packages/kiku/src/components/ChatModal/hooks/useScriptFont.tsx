import React, { useState, useEffect, useCallback } from 'react';
import type { ScriptFont, AkropolysTheme } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { useScriptFontFace, preloadScriptFont } from '../../../utils/hostFont';
import { cachedBaseFont, readyBaseFont } from '../../../utils/chromeWarm';
import { DEFAULT_UI_STRINGS, ONBOARDING_UI_STRINGS, getLoadingMeta, type UIStringKey } from '../types';

export interface UseScriptFontOptions {
  shopperLanguage: string;
  theme?: 'light' | 'dark' | AkropolysTheme;
  preloadedStrings?: Record<string, string> | null;
}

const LANGUAGE_CODES: Record<string, string> = {
  english: 'en', en: 'en',
  swahili: 'sw', kiswahili: 'sw', sw: 'sw',
  french: 'fr', français: 'fr', francais: 'fr', fr: 'fr',
  spanish: 'es', español: 'es', espanol: 'es', es: 'es',
  arabic: 'ar', 'العربية': 'ar', ar: 'ar',
  portuguese: 'pt', português: 'pt', pt: 'pt',
  hindi: 'hi', 'हिन्दी': 'hi', hi: 'hi',
  chinese: 'zh', '中文': 'zh', zh: 'zh',
  japanese: 'ja', '日本語': 'ja', ja: 'ja',
  urdu: 'ur', 'اردو': 'ur', ur: 'ur',
  burmese: 'my', burma: 'my', myanmar: 'my', 'မြန်မာ': 'my', 'မြန်မာဘာသာ': 'my', my: 'my',
  khmer: 'km', cambodian: 'km', 'ភាសាខ្មែរ': 'km', 'ខ្មែរ': 'km', km: 'km',
  persian: 'fa', farsi: 'fa', 'فارسی': 'fa', fa: 'fa', fas: 'fa',
  malay: 'ms', bahasa: 'ms', indonesian: 'id', 'bahasa melayu': 'ms', 'bahasa indonesia': 'id', ms: 'ms', id: 'id',
  amharic: 'am', 'አማርኛ': 'am', am: 'am',
};

// Direction and speech language only; the words come from /ui-strings (cached per language by the sdk).
function knownLanguage(lang: string): { dir: 'ltr' | 'rtl'; bcp47: string } | null {
  const bcp47 = lang ? LANGUAGE_CODES[lang.trim().toLowerCase()] : undefined;
  if (!bcp47) return null;
  return { dir: bcp47 === 'ar' || bcp47 === 'ur' || bcp47 === 'fa' ? 'rtl' : 'ltr', bcp47 };
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

export function useScriptFont({ shopperLanguage, theme, preloadedStrings }: UseScriptFontOptions) {
  const client = useAkropolysContext();
  const cachedInitial = shopperLanguage ? (
    client?.getCachedUIStrings?.(shopperLanguage, DEFAULT_UI_STRINGS) ??
    client?.getCachedUIStrings?.(shopperLanguage, ONBOARDING_UI_STRINGS)
  ) : null;
  const initialStrings = (preloadedStrings && Object.keys(preloadedStrings).length > 0)
    ? preloadedStrings
    : (cachedInitial?.strings ?? {});
  const [chromeStrings, setChromeStrings] = useState<Record<string, string>>(() => initialStrings);
  const [chromeCurated, setChromeCurated] = useState<boolean>(() => cachedInitial?.curated !== false);
  const [chromeReady, setChromeReady] = useState<boolean>(() => !shopperLanguage || (preloadedStrings && Object.keys(preloadedStrings).length > 0) || !!cachedInitial?.complete);
  const [loadedLang, setLoadedLang] = useState<string>(() => {
    if (preloadedStrings && Object.keys(preloadedStrings).length > 0) return shopperLanguage;
    if (cachedInitial?.complete) return shopperLanguage;
    const isEn = !shopperLanguage || knownLanguage(shopperLanguage)?.bcp47 === 'en';
    return isEn ? (shopperLanguage || 'en') : '';
  });

  const isEn = !shopperLanguage || knownLanguage(shopperLanguage)?.bcp47 === 'en';
  let effectiveStrings = chromeStrings;
  if (preloadedStrings && Object.keys(preloadedStrings).length > 0) {
    effectiveStrings = { ...chromeStrings, ...preloadedStrings };
  }

  const dirKey = shopperLanguage ? `akropolys_ui_dir_${shopperLanguage.toLowerCase()}` : '';
  const [isRTL, setIsRTL] = useState<boolean>(() => {
    if (cachedInitial?.dir) return cachedInitial.dir === 'rtl';
    const known = knownLanguage(shopperLanguage);
    if (known) return known.dir === 'rtl';
    const meta = getLoadingMeta(shopperLanguage);
    if (meta?.rtl) return true;
    if (typeof window === 'undefined' || !dirKey) return false;
    try { return localStorage.getItem(dirKey) === 'rtl'; } catch { return false; }
  });
  const [speechLang, setSpeechLang] = useState(() => {
    return cachedInitial?.bcp47 || knownLanguage(shopperLanguage)?.bcp47 || '';
  });
  const [scriptFont, setScriptFont] = useState<ScriptFont | null>(() => cachedInitial?.font ?? null);
  const [baseFont, setBaseFont] = useState<ScriptFont | null>(() => readyBaseFont(client));
  const [baseFontReady, setBaseFontReady] = useState<boolean>(true);

  // Sync synchronously during render if shopperLanguage changes, preventing any 1-frame flash of old strings
  const [prevShopperLanguage, setPrevShopperLanguage] = useState(shopperLanguage);
  if (shopperLanguage !== prevShopperLanguage) {
    setPrevShopperLanguage(shopperLanguage);
    const knownNow = knownLanguage(shopperLanguage);
    if (knownNow) {
      setIsRTL(knownNow.dir === 'rtl');
      setSpeechLang(knownNow.bcp47);
    }
    const cached = shopperLanguage ? (
      client?.getCachedUIStrings?.(shopperLanguage, DEFAULT_UI_STRINGS) ??
      client?.getCachedUIStrings?.(shopperLanguage, ONBOARDING_UI_STRINGS)
    ) : null;
    const sourceStrings = (preloadedStrings && Object.keys(preloadedStrings).length > 0)
      ? preloadedStrings
      : cached?.strings;
    if (sourceStrings && Object.keys(sourceStrings).length > 0) {
      setChromeStrings(sourceStrings);
      effectiveStrings = sourceStrings;
      if (cached) {
        setChromeCurated(cached.curated !== false);
        if (cached.font) setScriptFont(cached.font);
        if (cached.dir) setIsRTL(cached.dir === 'rtl');
        if (cached.bcp47) setSpeechLang(cached.bcp47);
      }
      setLoadedLang(shopperLanguage);
      setChromeReady(true);
    }
  }

  const effectiveChromeReady = isEn || (loadedLang.toLowerCase() === shopperLanguage.toLowerCase() && chromeReady) || (effectiveStrings && Object.keys(effectiveStrings).length > 0);

  useEffect(() => {
    if (!shopperLanguage) {
      setSpeechLang('');
      setScriptFont(null);
      setChromeStrings({});
      setLoadedLang('');
      setChromeReady(true);
      setIsRTL(false);
      return;
    }
    const known = knownLanguage(shopperLanguage);
    const meta = getLoadingMeta(shopperLanguage);
    const isLangEn = known?.bcp47 === 'en';

    const cachedFull = client?.getCachedUIStrings?.(shopperLanguage, DEFAULT_UI_STRINGS);
    if (cachedFull?.strings && Object.keys(cachedFull.strings).length > 0) {
      setChromeCurated(cachedFull.curated !== false);
      setChromeStrings(cachedFull.strings);
      setIsRTL(cachedFull.dir === 'rtl');
      setSpeechLang(cachedFull.bcp47 || known?.bcp47 || '');
      if (cachedFull.font) setScriptFont(cachedFull.font);
      setLoadedLang(shopperLanguage);
      setChromeReady(true);
      return;
    }

    const cachedOnboarding = client?.getCachedUIStrings?.(shopperLanguage, ONBOARDING_UI_STRINGS);
    if (cachedOnboarding?.strings && Object.keys(cachedOnboarding.strings).length > 0) {
      setChromeCurated(cachedOnboarding.curated !== false);
      setChromeStrings(cachedOnboarding.strings);
      setIsRTL(cachedOnboarding.dir === 'rtl');
      setSpeechLang(cachedOnboarding.bcp47 || known?.bcp47 || '');
      if (cachedOnboarding.font) setScriptFont(cachedOnboarding.font);
      setLoadedLang(shopperLanguage);
      setChromeReady(true);
    } else {
      setChromeStrings({});
      if (known) {
        setIsRTL(known.dir === 'rtl');
        setSpeechLang(known.bcp47);
      } else {
        if (meta?.rtl) setIsRTL(true);
      }
      if (!isLangEn) {
        setChromeReady(false);
      }
    }

    let cancelled = false;
    (async () => {
      try {
        if (!cachedOnboarding?.strings) {
          const resFast = await client.getUIStrings?.(shopperLanguage, ONBOARDING_UI_STRINGS);
          if (!cancelled && resFast?.complete) {
            setChromeCurated(resFast.curated !== false);
            setChromeStrings(prev => ({ ...prev, ...resFast.strings }));
            setIsRTL(resFast.dir === 'rtl');
            setSpeechLang(resFast.bcp47 || known?.bcp47 || '');
            try { localStorage.setItem(dirKey, resFast.dir); } catch {  }
            if (resFast.font) {
              await preloadScriptFont(resFast.font, 1200);
              if (!cancelled) setScriptFont(resFast.font);
            }
            if (!cancelled) {
              setLoadedLang(shopperLanguage);
              setChromeReady(true);
            }
          }
        }

        const resFull = await client.getUIStrings?.(shopperLanguage, DEFAULT_UI_STRINGS);
        if (!cancelled && resFull?.complete) {
          setChromeStrings(prev => ({ ...prev, ...resFull.strings }));
          if (resFull.font) {
            await preloadScriptFont(resFull.font, 1200);
            if (!cancelled) setScriptFont(resFull.font);
          }
        }
      } catch {
        /* Builtin or defaults */
        if (!cancelled) {
          setLoadedLang(shopperLanguage);
          setChromeReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopperLanguage, client, dirKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await cachedBaseFont(client);
        if (!cancelled && f) setBaseFont(f);
      } catch {

      }
      if (!cancelled) setBaseFontReady(true);
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
    let s: string = effectiveStrings[key] || chromeStrings[key] || DEFAULT_UI_STRINGS[key] || key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    }
    return s;
  }, [effectiveStrings, chromeStrings]);

  const tNode = useCallback((key: UIStringKey, vars: Record<string, string>) => {
    let s = effectiveStrings[key] || chromeStrings[key] || DEFAULT_UI_STRINGS[key] || key;
    return s.split(/(\{[a-zA-Z]+\})/g).map((part, i) => {
      const m = part.match(/^\{([a-zA-Z]+)\}$/);
      if (m && vars[m[1]] !== undefined) return <bdi key={i}>{vars[m[1]]}</bdi>;
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  }, [effectiveStrings, chromeStrings]);

  return {
    chromeStrings,
    chromeReady: effectiveChromeReady,
    chromeCurated,
    isRTL,
    speechLang,
    scriptFont,
    fontStack,
    isNonLatin,
    hostFontCovers,
    baseFontReady,
    t,
    tNode,
  };
}
