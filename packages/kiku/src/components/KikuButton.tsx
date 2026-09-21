'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { speciesFor, speciesNick } from './Scouts';
import { createPortal } from 'react-dom';
import { primeChimes } from '../utils/chime';
import { getShadowContainer } from '../utils/shadowRoot';
import type { AkropolysTheme, ChatSource } from '@akropolys/sdk';
import { useAkropolysContext, useScouts, Scout } from '@akropolys/sdk';
import { cn } from '../utils/cn';
import { resolveTheme } from '../utils/theme';
import { warmChrome, warmLanguage } from '../utils/chromeWarm';
import { useHostFontFace } from '../utils/hostFont';
import { DEFAULT_CHIPS, DEFAULT_UI_STRINGS, type ModalOrigin } from './ChatModal/types';
import { ChatModal } from './ChatModal';

export interface KikuButtonProps {
  label?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;

  /** Wordmark shown in place of the name in the topbar. */
  logo?: string;
  placeholder?: string;
  backdropColor?: string;
  backdropBlur?: string | number;
  className?: string;
  onSelectSource?: (source: ChatSource) => void;
  defaultCurrency?: string;
  chips?: string[];
  theme?: 'light' | 'dark' | AkropolysTheme;
  classNames?: {
    button?: string;
    overlay?: string;
    panel?: string;
    input?: string;
    sendButton?: string;
  };

  enableVoice?: boolean;

  voiceLang?: string;

  enableVision?: boolean;

  ttsVoice?: string;
}

export function KikuButton({
  label = 'Ask AI',
  children,
  icon,
  title,
  logo,
  placeholder,
  backdropColor,
  backdropBlur,
  className,
  onSelectSource,
  defaultCurrency = '$',
  chips = DEFAULT_CHIPS,
  theme,
  classNames = {},
  enableVoice = false,
  voiceLang,
  ttsVoice,
  enableVision = false,
}: KikuButtonProps) {
  const client = useAkropolysContext();
  const [open, setOpen] = useState(false);
  const { justTriggered } = useScouts();
  const [arrivals, setArrivals] = useState<Scout[]>([]);
  useEffect(() => {
    if (open || !justTriggered.length) return;
    setArrivals((prev) => [...prev, ...justTriggered.filter((s) => !prev.some((p) => p.id === s.id))]);
  }, [justTriggered]);
  const latest = arrivals[arrivals.length - 1];
  const [mounted, setMounted] = useState(false);
  const [origin, setOrigin] = useState<ModalOrigin | null>(null);

  const warmShadow = useCallback(() => {
    getShadowContainer();
    try {
      warmChrome(client, client?.getShopperLanguage?.() ?? '', DEFAULT_UI_STRINGS);
      client?.api?.widgetSettings?.().then((settings: any) => {
        if (settings?.detectedLanguage && settings.detectedLanguage.toLowerCase() !== 'english') {
          warmLanguage(client, settings.detectedLanguage, DEFAULT_UI_STRINGS);
        }
      }).catch(() => {});
    } catch {  }
  }, [client]);

  const btnRef = useRef<HTMLButtonElement>(null);

  const openFrom = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    setOrigin(b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null);
    setOpen(true);
    warmShadow();
    try { primeChimes(); } catch {}
  }, [warmShadow]);

  useEffect(() => {
    setMounted(true);
    warmShadow(); // Eager warm immediately on mount so first click has 0ms CSS lag

    // backstop for the first click when it arrives without a prior hover (touch, programmatic)
    const ric = (window as any).requestIdleCallback;
    const warmId = ric ? ric(warmShadow, { timeout: 2000 }) : setTimeout(warmShadow, 300);

    if (typeof window !== 'undefined' && !(window as any).__akropolys_nav_patched) {
      (window as any).__akropolys_nav_patched = true;
      let lastPath = window.location.pathname;
      const originalPush = window.history.pushState;
      const originalReplace = window.history.replaceState;

      window.history.pushState = function(...args) {
        originalPush.apply(this, args);
        if (window.location.pathname !== lastPath) {
          lastPath = window.location.pathname;
          window.dispatchEvent(new CustomEvent('akropolys:navigation'));
        }
      };

      window.history.replaceState = function(...args) {
        originalReplace.apply(this, args);
        if (window.location.pathname !== lastPath) {
          lastPath = window.location.pathname;
          window.dispatchEvent(new CustomEvent('akropolys:navigation'));
        }
      };
    }

    const handleNavigation = () => {
      setOpen(false);
    };

    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('akropolys:navigation', handleNavigation);

    return () => {
      const cic = (window as any).cancelIdleCallback;
      if (ric && cic) cic(warmId); else clearTimeout(warmId as any);
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('akropolys:navigation', handleNavigation);
    };
  }, [warmShadow]);

  const { themeAttr: hskThemeAttr, vars: customStyles } = resolveTheme(theme);
  useHostFontFace(theme);

  return (
    <>
      <button
        ref={btnRef}
        className={cn("hsk-cb-btn", classNames.button, className)}
        onClick={openFrom}
        onPointerEnter={warmShadow}
        onPointerDown={warmShadow}
        style={latest ? { ...customStyles, ['--hsk-glow' as any]: speciesFor(latest.id, latest.avatar).shade } : customStyles}
        data-hsk-theme={hskThemeAttr}
        data-scout-arrived={latest && !open ? '' : undefined}
        aria-label={latest && !open ? `Open AI chat, ${speciesNick(latest.id, latest.avatar)} came back` : 'Open AI chat'}
      >
        {children !== undefined ? (
          children
        ) : (
          <>
            {icon ? (
              <span className="hsk-cb-btn-icon" style={{ display: 'flex', alignItems: 'center' }}>
                {icon}
              </span>
            ) : null}
            {label}
          </>
        )}
      </button>
      {open && mounted && createPortal(
        <ChatModal
          title={title}
          logo={logo}
          placeholder={placeholder}
          backdropColor={backdropColor}
          backdropBlur={backdropBlur}
          origin={origin}
          arrivals={arrivals}
          onClose={() => { setOpen(false); setArrivals([]); }}
          onSelectSource={onSelectSource}
          defaultCurrency={defaultCurrency}
          chips={chips}
          theme={theme}
          classNames={classNames}
          enableVoice={enableVoice}
          voiceLang={voiceLang}
          enableVision={enableVision}
          ttsVoice={ttsVoice}
        />,
        getShadowContainer() ?? document.body
      )}
    </>
  );
}
