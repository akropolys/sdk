'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getShadowContainer } from '../utils/shadowRoot';
import type { AkropolysTheme, ChatSource } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { cn } from '../utils/cn';
import { resolveTheme } from '../utils/theme';
import { warmChrome } from '../utils/chromeWarm';
import { useHostFontFace } from '../utils/hostFont';
import { DEFAULT_CHIPS, DEFAULT_UI_STRINGS } from './ChatModal/types';
import { ChatModal } from './ChatModal';

export interface KikuButtonProps {
  label?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
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

  visionCategoryHint?: string;

  /** Enable 🔊 TTS voice audio responses from AI */
  enableAudioResponse?: boolean;

  ttsVoice?: string;

  autoSpeakResponses?: boolean;
}

export function KikuButton({
  label = 'Ask AI',
  children,
  icon,
  title,
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
  enableVision = false,
  visionCategoryHint,
  enableAudioResponse,
  ttsVoice,
  autoSpeakResponses,
}: KikuButtonProps) {
  const client = useAkropolysContext();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [origin, setOrigin] = useState<import('./ChatModal/types').ModalOrigin | null>(null);

  // The open path otherwise pays for ~190KB of CSS parsing plus the ui-strings and
  // base-font round trips. Pulling both forward means the click only mounts React.
  const warmShadow = useCallback(() => {
    getShadowContainer();
    try {
      warmChrome(client, client?.getShopperLanguage?.() ?? '', DEFAULT_UI_STRINGS);
    } catch {  }
  }, [client]);

  const openFrom = useCallback((el: HTMLElement) => {
    warmShadow();
    const b = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const br = parseFloat(style.borderRadius) || 12;
    const x = b.left + b.width / 2;
    const y = b.top + b.height / 2;
    const w = window.innerWidth, h = window.innerHeight;
    const r = Math.max(
      Math.hypot(x, y), Math.hypot(w - x, y),
      Math.hypot(x, h - y), Math.hypot(w - x, h - y),
    );
    setOrigin({
      x,
      y,
      r,
      top: b.top,
      left: b.left,
      width: b.width,
      height: b.height,
      borderRadius: br,
    });
    setOpen(true);
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
        className={cn("hsk-cb-btn", classNames.button, className)}
        onClick={e => openFrom(e.currentTarget)}
        onPointerEnter={warmShadow}
        onPointerDown={warmShadow}
        style={customStyles}
        data-hsk-theme={hskThemeAttr}
        aria-label="Open AI chat"
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
          placeholder={placeholder}
          backdropColor={backdropColor}
          backdropBlur={backdropBlur}
          origin={origin}
          onClose={() => setOpen(false)}
          onSelectSource={onSelectSource}
          defaultCurrency={defaultCurrency}
          chips={chips}
          theme={theme}
          classNames={classNames}
          enableVoice={enableVoice}
          voiceLang={voiceLang}
          enableVision={enableVision}
          visionCategoryHint={visionCategoryHint}
          enableAudioResponse={enableAudioResponse}
          ttsVoice={ttsVoice}
          autoSpeakResponses={autoSpeakResponses}
        />,
        getShadowContainer() ?? document.body
      )}
    </>
  );
}
