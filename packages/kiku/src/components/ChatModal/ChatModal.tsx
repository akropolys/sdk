import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useId } from 'react';
import { flushSync } from 'react-dom';
import { THEMES, isThemeId, themeDef, DEFAULT_DARK, DEFAULT_LIGHT, type ThemeId } from './themes';
import { useKiku, ChatSource, ChatAttachment, CaptureTarget, subscribeLiveStream } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { cn } from '../../utils/cn';
import { resolveTheme } from '../../utils/theme';
import { useHostFontFace } from '../../utils/hostFont';
import { useDragToDismiss } from '../../utils/sheetGesture';
import { downscaleImage } from '../../utils/downscaleImage';
import { MarkupEditor } from '../MarkupEditor';
import type { KikuState } from '../KikuAvatar';
import KikuDoodles from '../KikuDoodles';

import {
  DEFAULT_CHIPS,
  UIStringsContext,
  extractName,
  ChatModalProps,
} from './types';
import { useScriptFont } from './hooks/useScriptFont';
import { useChatScroll } from './hooks/useChatScroll';
import { useKikuKey } from './hooks/useKikuKey';
import { useChatCommands } from './hooks/useChatCommands';
import { useVoiceController } from './hooks/useVoiceController';
import { ChatTopbar } from './ChatTopbar';
import { CopyIcon, CheckIcon } from './icons';
import { OnboardingView } from './OnboardingView';
import { ChatMessages } from './ChatMessages';
import { ChatComposer } from './ChatComposer';
import { VoiceOverlay } from './VoiceOverlay';
import { LightboxModal } from './components/LightboxModal';
import { ConversationTimeline } from './components/ConversationTimeline';

export function ChatModal({
  title = 'kiku',
  placeholder = 'Ask me anything…',
  backdropColor,
  backdropBlur,
  onClose,
  onSelectSource,
  defaultCurrency = '',
  chips = DEFAULT_CHIPS,
  theme,
  classNames = {},
  enableVoice = false,
  voiceLang,
  enableVision = false,
  visionCategoryHint,
  enableAudioResponse = true,
  ttsVoice = 'Puck',
  autoSpeakResponses = true,
  origin,
}: ChatModalProps) {
  const client = useAkropolysContext();
  const { messages, sources, loading, streaming, error, errorCode, lastAction, lastIntent, allowedActions, send, queuedMessage, sendQueuedNow, appendSpokenExchange, stop, stopped, interrupted, continueGenerating, reset, referencedIds } = useKiku();

  const [shopperName, setShopperNameState] = useState<string>(() => {
    try { return client.getShopperName?.() ?? ''; } catch { return ''; }
  });
  const [shopperLanguage, setShopperLanguageState] = useState<string>(() => {
    try { return client.getShopperLanguage?.() ?? ''; } catch { return ''; }
  });
  const [entityLangPref, setEntityLangPrefState] = useState<string>(() => {
    try { return client.getEntityLanguageMode?.() ?? ''; } catch { return ''; }
  });
  const [justCompleted, setJustCompleted] = useState(false);

  const {
    chromeReady,
    isRTL,
    speechLang,
    scriptFont,
    fontStack,
    isNonLatin,
    hostFontCovers,
    t,
    tNode,
  } = useScriptFont({ shopperLanguage, theme });

  const discussedSources = React.useMemo(() => {
    const byRef = sources.filter(s => s.id && referencedIds.includes(s.id));
    const answer = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? '';
    if (!answer) return byRef;
    const seen = new Set(byRef.map(s => s.id));
    const hay = answer.toLowerCase().replace(/\s+/g, ' ');
    const aliases = (name: string) => {
      const n = String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
      const w = n.split(' ');
      const out = [n];
      if (w.length > 3) out.push(w.slice(0, 3).join(' '));
      if (w.length > 4) out.push(w.slice(0, 4).join(' '));
      return out.filter(a => a.length >= 5);
    };
    const named = sources.filter(s =>
      s.id && !seen.has(s.id) && aliases(s.name).some(a => hay.includes(a))
    );
    return [...byRef, ...named];
  }, [sources, referencedIds, messages]);

  const captureAllowed = allowedActions === null || allowedActions.includes('capture');
  const [input, setInput] = useState('');
  const [showKikuPicker, setShowKikuPicker] = useState(false);
  const [showAtPicker, setShowAtPicker] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [vizState, setVizState] = useState<Record<string, 'ok' | 'err'>>({});
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [markupSrc, setMarkupSrc] = useState<string | null>(null);

  const [termsAgreed, setTermsAgreed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('akropolys_terms_agreed') === 'true';
    } catch {
      return false;
    }
  });

  const onboarding = messages.length === 0;
  const awaitingLang = onboarding && !shopperLanguage;
  const awaitingName = onboarding && !!shopperLanguage && !shopperName;
  const awaitingEntityLang = onboarding && !!shopperLanguage && !!shopperName && !entityLangPref;
  const awaitingConsent = onboarding && !!shopperLanguage && !!shopperName && !!entityLangPref && !termsAgreed;
  const inOnboarding = awaitingLang || awaitingName || awaitingEntityLang || awaitingConsent;

  const hasLiveData = React.useMemo(
    () => messages.some(m => (m as any).liveKeys?.length > 0),
    [messages]
  );
  useEffect(() => {
    if (!hasLiveData) return;
    return subscribeLiveStream({ client });
  }, [hasLiveData, client]);

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 768px)');
    if (!mq) return;
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  const chooseLanguage = (lang: string) => {
    const v = lang.trim();
    if (!v) {
      try { client.setShopperLanguage?.(''); } catch {  }
      setShopperLanguageState('');
      return;
    }
    try { client.setShopperLanguage?.(v); } catch {  }
    setShopperLanguageState(v);
    setJustCompleted(false);
  };

  const chooseEntityLang = (mode: 'translated' | 'original') => {
    try { client.setEntityLanguageMode?.(mode); } catch {  }
    setEntityLangPrefState(mode);
    if (termsAgreed) {
      setJustCompleted(true);
    }
  };

  const agreeTerms = () => {
    try {
      localStorage.setItem('akropolys_terms_agreed', 'true');
    } catch { /* noop */ }
    setTermsAgreed(true);
    setJustCompleted(true);
  };

  const activeTitle = title === 'kiku' ? (t('nameStepTitle') ? 'kiku' : title) : title;
  const activePlaceholder =
    awaitingLang ? t('langPlaceholder')
    : awaitingName ? t('namePlaceholder')
    : awaitingEntityLang ? t('entityLangPlaceholder')
    : awaitingConsent ? t('termsPlaceholder')
    : (placeholder === 'Ask me anything…' ? t('defaultPlaceholder') : placeholder);

  const activeChips = !chips || chips === DEFAULT_CHIPS ? [] : (Array.isArray(chips) ? chips : []);
  const onboardingMood: KikuState =
    awaitingLang ? 'curious'
    : awaitingName ? 'welcoming'
    : awaitingEntityLang ? 'guiding'
    : awaitingConsent ? 'focused'
    : 'happy';

  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => {
    if (isThemeId(theme)) return theme;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('akropolys_theme');
      if (isThemeId(saved)) return saved;
      return window.matchMedia?.('(prefers-color-scheme: light)').matches ? DEFAULT_LIGHT : DEFAULT_DARK;
    }
    return DEFAULT_DARK;
  });

  // Fluid theme switch: updates active theme and lets CSS & canvas glyphs animate live
  const handleToggleTheme = (next: ThemeId, alsoCloseMenu = false) => {
    setCurrentTheme(next);
    if (alsoCloseMenu) {
      setThemeMenuOpen(false);
      setThemeMenuClosing(false);
    }
    try { localStorage.setItem('akropolys_theme', next); } catch { /* noop */ }
  };

  const { vars: customStyles } = resolveTheme(theme);
  const hskThemeAttr = currentTheme;
  useHostFontFace(theme);

  const handleSendRef = useRef<(text: string) => void>(() => {});

  const handleSend = async (text?: string, extraAttachments?: ChatAttachment[], forcedIntent?: string, captureTargets?: CaptureTarget[]) => {
    const raw = (text ?? input).trim();
    const toSend = extraAttachments ?? attachments;
    if ((!raw && toSend.length === 0) || !chromeReady || queuedMessage) return;

    if (awaitingName) {
      if (!raw) return;
      const name = extractName(raw) || raw.slice(0, 40);
      try { client.setShopperName?.(name); } catch {  }
      setShopperNameState(name);
      setInput('');
      return;
    }
    if (awaitingLang) {
      if (!raw) return;
      chooseLanguage(raw);
      setInput('');
      return;
    }
    if (awaitingEntityLang) {
      setInput('');
      return;
    }

    setShowKikuPicker(false);
    setShowAtPicker(false);
    setInput('');
    setAttachments([]);
    const queryToSend = raw || (toSend.some(a => a.type === 'image') ? 'Analyze this image' : 'What is this?');
    await send(queryToSend, raw, toSend.length > 0 ? toSend : undefined, forcedIntent, captureTargets);
  };

  const retryLastMessage = useCallback(async () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) await handleSend(lastUserMsg.content);
  }, [messages]);

  const {
    keyInput,
    setKeyInput,
    keyPhase,
    setKeyPhase,
    mintedKey,
    setMintedKey,
    mintedPub,
    setMintedPub,
    copied,
    keyCountdown,
    minting,
    copyValue,
    handleUseExistingKey,
    handleCreateKey,
  } = useKikuKey(lastAction, retryLastMessage);

  const getStoredKikuId = useCallback((): string => {
    if (typeof window === 'undefined') return 'N/A';
    try {
      const fromSession = sessionStorage.getItem('akropolys_kiku_pub') || sessionStorage.getItem('kiku_pub');
      if (fromSession) return fromSession;
      const fromLocal = localStorage.getItem('akropolys_kiku_pub') || localStorage.getItem('kiku_pub') || localStorage.getItem('kiku_id');
      if (fromLocal) return fromLocal;
      const match = document.cookie.match(/(?:^|;\s*)(?:akropolys_kiku_pub|kiku_pub|kiku_id)=([^;]+)/);
      if (match) return decodeURIComponent(match[1]);
    } catch {}
    return 'N/A';
  }, []);

  const displayKikuPub = mintedPub ?? client?.getKikuPub?.() ?? getStoredKikuId();

  const {
    handleKikuCapture,
    handleKikuCaptureAll,
    handleKikuViewHistory,
    handleKikuDelete,
  } = useChatCommands({
    attachments,
    setAttachments,
    setInput,
    send,
    defaultCurrency,
    t,
  });

  const {
    voiceMode,
    voicePhase,
    voiceConnecting,
    voiceError,
    setVoiceError,
    voiceMuted,
    setVoiceMuted,
    voiceSecondsLeft,
    voiceBlocked,
    liveVoiceName,
    chooseVoice,
    canConverse,
    startVoice,
    stopVoice,
    voice,
    live,
  } = useVoiceController({
    voiceLang,
    speechLang,
    shopperLanguage,
    ttsVoice,
    handleSendUtterance: (text) => handleSendRef.current(text),
    appendSpokenExchange,
  });

  const panelRef = useRef<HTMLDivElement>(null);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [themeMenuClosing, setThemeMenuClosing] = useState(false);
  const themeMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const mobileThemeRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gooId = `hsk-goo-${useId()}`;

  // keeps the panel mounted long enough to morph back into the pill
  const closeThemeMenu = useCallback(() => {
    if (themeMenuCloseTimer.current) return;
    setThemeMenuClosing(true);
    themeMenuCloseTimer.current = setTimeout(() => {
      setThemeMenuOpen(false);
      setThemeMenuClosing(false);
      themeMenuCloseTimer.current = null;
    }, 200);
  }, []);

  useEffect(() => () => {
    if (themeMenuCloseTimer.current) clearTimeout(themeMenuCloseTimer.current);
  }, []);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const path = (e.composedPath ? e.composedPath() : []) as EventTarget[];
      const isInsideRail = themeMenuRef.current && (path.includes(themeMenuRef.current) || themeMenuRef.current.contains(e.target as Node));
      const isInsideMobile = mobileThemeRef.current && (path.includes(mobileThemeRef.current) || mobileThemeRef.current.contains(e.target as Node));
      const targetEl = e.target as HTMLElement | null;
      const isInsideTopbarMark = targetEl?.closest?.('.hsk-cb-topbar-mark');
      const isInsideOoze = targetEl?.closest?.('.hsk-cb-topbar-ooze-menu') || path.some((el: any) => el?.classList?.contains?.('hsk-cb-topbar-ooze-menu'));

      if (isInsideRail || isInsideMobile || isInsideTopbarMark || isInsideOoze) {
        return;
      }
      closeThemeMenu();
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [themeMenuOpen]);

  const {
    msgsContainerRef,
    lastExternalScrollRef,
    showJumpToBottom,
    scrollProgress,
    activeMsgIdx,
    unreadBelow,
    jumpToMessage,
    jumpToBottom,
  } = useChatScroll({ messages, loading, messageRefs });

  useDragToDismiss({
    panel: useCallback(() => panelRef.current, []),
    scroller: useCallback(() => msgsContainerRef.current, []),
    onDismiss: onClose,
    quiescent: useCallback(() => performance.now() - lastExternalScrollRef.current > 90, []),
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;

    if (scrollbarWidth > 0) {
      const computedPadding = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${computedPadding + scrollbarWidth}px`;
      document.documentElement.style.setProperty('--hsk-scrollbar-width', `${scrollbarWidth}px`);
    }

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
      document.documentElement.style.removeProperty('--hsk-scrollbar-width');
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => { root.style.setProperty('--hsk-vvh', `${vv.height}px`); };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--hsk-vvh');
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightboxSrc) { setLightboxSrc(null); return; }
      onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lightboxSrc, onClose]);

  const handleReset = useCallback(() => {
    reset();
    setKeyPhase('idle');
  }, [reset, setKeyPhase]);

  const handleSourceClick = (src: ChatSource) => {
    onSelectSource?.(src);
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant && lastAssistant.content.trim().endsWith('?')) {
      send(t('cardClickAnswer', { name: src.name }));
      return;
    }
    const price = src.price ? ` (${src.currency ?? defaultCurrency} ${src.price})` : '';
    send(t('cardClickQuery', { name: src.name, price }));
  };

  const handleSelectExtension = (ext: string) => {
    setInput(ext + ' ');
    setShowAtPicker(false);
    setShowKikuPicker(true);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && showKikuPicker) { e.preventDefault(); setShowKikuPicker(false); return; }
    if (e.key === 'Escape' && showAtPicker) { e.preventDefault(); setShowAtPicker(false); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); }
  };

  const composerHeight = useRef(28);
  const singleRowFieldWidth = useRef(280);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const getTextWidth = (text: string, font: string): number => {
    try {
      if (!measureCanvasRef.current && typeof document !== 'undefined') {
        measureCanvasRef.current = document.createElement('canvas');
      }
      const ctx = measureCanvasRef.current?.getContext('2d');
      if (!ctx) return text.length * 8.5;
      ctx.font = font;
      return ctx.measureText(text).width;
    } catch {
      return text.length * 8.5;
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    const box = el.closest('.hsk-cb-input-box') as HTMLElement | null;
    if (!box) return;

    const val = el.value;
    const isCurrentlyExpanded = box.dataset.expanded === 'true';

    if (!isCurrentlyExpanded && el.clientWidth > 50) {
      singleRowFieldWidth.current = el.clientWidth;
    }

    const cs = window.getComputedStyle(el);
    const font = cs.font || `${cs.fontSize || '16px'} ${cs.fontFamily || 'Geist, sans-serif'}`;
    const textWidth = getTextWidth(val, font);

    const threshold = Math.max(120, singleRowFieldWidth.current - 14);
    const hasNewline = val.includes('\n');
    const shouldExpand = Boolean(val && (hasNewline || textWidth > threshold));

    if (box.dataset.expanded !== (shouldExpand ? 'true' : 'false')) {
      box.dataset.expanded = shouldExpand ? 'true' : 'false';
    }

    if (!val) {
      composerHeight.current = 28;
      el.style.height = '';
      return;
    }

    if (!shouldExpand) {
      composerHeight.current = 28;
      el.style.height = '';
      return;
    }

    el.style.height = 'auto';
    const targetHeight = Math.max(28, Math.min(el.scrollHeight, 140));
    composerHeight.current = targetHeight;
    el.style.height = `${targetHeight}px`;
  };

  useEffect(() => {
    if (textareaRef.current) autoGrow(textareaRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (voiceError) setVoiceError('');
    const trimmed = val.trim();
    setShowAtPicker(trimmed === '@');
    setShowKikuPicker(/^@kiku\s*$/i.test(trimmed));
  };

  useEffect(() => {
    handleSendRef.current = (text: string) => { void handleSend(text); };
  });

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    for (const file of list) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await downscaleImage(file);
        setAttachments(prev => [...prev, { type: 'image', data: dataUrl }]);
      } catch {  }
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const shownSources = (live.sources?.length ?? 0) > 0 ? live.sources : discussedSources;
  const hasTranslucentBackdrop = backdropColor && (backdropColor.includes('rgba') || backdropColor.includes('hsla') || backdropColor === 'transparent');
  const backdropFilterStyle = (backdropBlur || hasTranslucentBackdrop) ? {
    backdropFilter: `blur(${typeof backdropBlur === 'number' ? `${backdropBlur}px` : (backdropBlur || '20px')})`,
    WebkitBackdropFilter: `blur(${typeof backdropBlur === 'number' ? `${backdropBlur}px` : (backdropBlur || '20px')})`,
  } : {};
  const halted = (stopped || interrupted) && !loading && !streaming;

  const displayMessages = React.useMemo(() => {
    const inFlight = loading || streaming;
    return messages.filter((m, i) => {
      if (m.role !== 'assistant') return true;
      const isLastMsg = i === messages.length - 1;
      if (isLastMsg && inFlight) return true;
      const hasBody = !!m.content || !!m.visualization || m.visualizing ||
        (m.knowledgeImages?.length ?? 0) > 0 || (m.referencedIds?.length ?? 0) > 0;
      return hasBody;
    });
  }, [messages, loading, streaming]);

  const timelineItems = React.useMemo(
    () => displayMessages
      .map((m, idx) => ({ m, idx }))
      .filter(({ m }) => m.role === 'user' && !!m.content.trim())
      .map(({ m, idx }) => {
        const clean = m.content.replace(/^@kiku\s*/i, '').replace(/\s+/g, ' ').trim();
        return { idx, text: clean.length > 30 ? clean.slice(0, 29).trimEnd() + '…' : clean };
      }),
    [displayMessages]
  );

  const haltedEmpty =
    halted && displayMessages[displayMessages.length - 1]?.role !== 'assistant';

  const mountTimeRef = useRef(Date.now());
  useEffect(() => {
    mountTimeRef.current = Date.now();
  }, []);

  return (
    <UIStringsContext.Provider value={t}>
      <div
        ref={overlayRef}
        className={cn("hsk-cb-overlay", origin && "hsk-cb-overlay--grows", classNames.overlay)}
        onPointerDown={e => {
          if (e.target === e.currentTarget) {
            (overlayRef.current as any)._ptrDown = true;
          }
        }}
        onClick={e => {
          if (e.target === e.currentTarget && (overlayRef.current as any)?._ptrDown && Date.now() - mountTimeRef.current > 200) {
            onClose();
          }
          if (overlayRef.current) (overlayRef.current as any)._ptrDown = false;
        }}
        data-hsk-theme={hskThemeAttr}
        style={{
          ...(backdropFilterStyle),
          ...(backdropColor ? { background: backdropColor } : {}),
          ...(origin ? {
            '--hsk-ox': `${origin.x}px`,
            '--hsk-oy': `${origin.y}px`,
            '--hsk-or': `${Math.ceil(origin.r)}px`,
            '--hsk-bt': `${Math.round(origin.top ?? origin.y)}px`,
            '--hsk-bl': `${Math.round(origin.left ?? origin.x)}px`,
            '--hsk-bw': `${Math.round(origin.width ?? 0)}px`,
            '--hsk-bh': `${Math.round(origin.height ?? 0)}px`,
            '--hsk-bbr': `${Math.round(origin.borderRadius ?? 12)}px`,
          } as React.CSSProperties : {}),
          ...customStyles,
        }}
      >
        <div
          ref={panelRef}
          className={cn("hsk-cb-panel", classNames.panel)}
          dir={isRTL ? 'rtl' : 'ltr'}
          data-script={isNonLatin ? 'nonlatin' : 'latin'}
          data-host-font={hostFontCovers ? 'covers' : 'gap'}
          data-nastaliq={(scriptFont?.family === 'Noto Nastaliq Urdu' || shopperLanguage?.toLowerCase() === 'urdu' || shopperLanguage?.toLowerCase() === 'ur' || shopperLanguage === 'اردو') ? 'true' : undefined}
          style={fontStack ? ({ '--hsk-font': fontStack } as React.CSSProperties) : undefined}
          onClick={e => {
            e.stopPropagation();
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG' && (target.classList.contains('hsk-markdown-img') || target.classList.contains('hsk-cb-user-img-thumb'))) {
              const src = (target as HTMLImageElement).src;
              if (src) setLightboxSrc(src);
            }
          }}
        >
          <LightboxModal src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

          {markupSrc && (
            <div className="hsk-markup-overlay">
              <MarkupEditor
                src={markupSrc}
                t={t as (key: string, vars?: Record<string, string>) => string}
                onCancel={() => setMarkupSrc(null)}
                onSend={(dataUrl, instruction, marks, preview) => {
                  setMarkupSrc(null);
                  handleSend(
                    instruction || t('markupApplyMarks'),
                    [{ type: 'image', data: dataUrl, annotated: true, marks, instructed: !!instruction, preview }],
                  );
                }}
              />
            </div>
          )}

          <div className="hsk-cb-main">
            <KikuDoodles seed={(client as any)?.api?.siteId ?? ''} theme={hskThemeAttr} dir={isRTL ? 'rtl' : 'ltr'} />

            <ChatTopbar
              title={activeTitle}
              hasMessages={messages.length > 0}
              avatarState={streaming ? 'speaking' : loading ? 'thinking' : 'idle'}
              unread={unreadBelow}
              awayFromBottom={showJumpToBottom}
              themeMenuOpen={themeMenuOpen}
              themeMenuClosing={themeMenuClosing}
              isNarrow={isNarrow}
              currentTheme={currentTheme}
              onJumpToLatest={jumpToBottom}
              onReset={handleReset}
              onClose={onClose}
              onToggleThemeMenu={() => (themeMenuOpen ? closeThemeMenu() : setThemeMenuOpen(true))}
              onSelectTheme={(t) => { handleToggleTheme(t, true); }}
            />

            <div className="hsk-cb-msgs" ref={msgsContainerRef as any}>
              {displayMessages.length === 0 ? (
                <OnboardingView
                  inOnboarding={inOnboarding}
                  justCompleted={justCompleted}
                  onboardingMood={onboardingMood}
                  awaitingLang={awaitingLang}
                  awaitingName={awaitingName}
                  awaitingEntityLang={awaitingEntityLang}
                  awaitingConsent={awaitingConsent}
                  termsAgreed={termsAgreed}
                  shopperLanguage={shopperLanguage}
                  shopperName={shopperName}
                  entityLangPref={entityLangPref}
                  chromeReady={chromeReady}
                  activeChips={activeChips}
                  t={t}
                  tNode={tNode}
                  chooseLanguage={chooseLanguage}
                  chooseEntityLang={chooseEntityLang}
                  agreeTerms={agreeTerms}
                  handleSend={handleSend}
                />
              ) : (
                <ChatMessages
                  displayMessages={displayMessages}
                  messageRefs={messageRefs}
                  isNarrow={isNarrow}
                  loading={loading}
                  streaming={streaming}
                  sources={sources}
                  referencedIds={referencedIds}
                  discussedSources={discussedSources}
                  lastIntent={lastIntent}
                  lastAction={lastAction}
                  defaultCurrency={defaultCurrency}
                  stopped={stopped}
                  interrupted={interrupted}
                  halted={halted}
                  haltedEmpty={haltedEmpty}
                  error={error}
                  errorCode={errorCode}
                  keyPhase={keyPhase}
                  keyInput={keyInput}
                  setKeyInput={setKeyInput}
                  mintedKey={mintedKey}
                  setMintedKey={setMintedKey}
                  mintedPub={mintedPub}
                  setMintedPub={setMintedPub}
                  minting={minting}
                  copied={copied}
                  keyCountdown={keyCountdown}
                  handleUseExistingKey={handleUseExistingKey}
                  handleCreateKey={handleCreateKey}
                  copyValue={copyValue}
                  queuedMessage={queuedMessage}
                  sendQueuedNow={sendQueuedNow}
                  setLightboxSrc={setLightboxSrc}
                  setMarkupSrc={setMarkupSrc}
                  handleSend={handleSend}
                  handleSourceClick={handleSourceClick}
                  continueGenerating={continueGenerating}
                  t={t}
                  bottomRef={bottomRef}
                  vizState={vizState}
                  setVizState={setVizState}
                  messages={messages}
                />
              )}
            </div>

            <ChatComposer
              gooId={gooId}
              input={input}
              setInput={setInput}
              showKikuPicker={showKikuPicker}
              setShowKikuPicker={setShowKikuPicker}
              showAtPicker={showAtPicker}
              setShowAtPicker={setShowAtPicker}
              captureAllowed={captureAllowed}
              discussedSources={discussedSources}
              defaultCurrency={defaultCurrency}
              handleSelectExtension={handleSelectExtension}
              handleKikuCapture={handleKikuCapture}
              handleKikuCaptureAll={handleKikuCaptureAll}
              handleKikuViewHistory={handleKikuViewHistory}
              handleKikuDelete={handleKikuDelete}
              attachments={attachments}
              removeAttachment={removeAttachment}
              chromeLoading={!chromeReady}
              imageInputRef={imageInputRef}
              handleImageFiles={handleImageFiles}
              enableVision={enableVision}
              enableVoice={enableVoice}
              canConverse={canConverse}
              voiceMode={voiceMode}
              startVoice={startVoice}
              stopVoice={stopVoice}
              voiceBlocked={voiceBlocked}
              textareaRef={textareaRef}
              classNames={classNames}
              handleInput={handleInput}
              handleKeyDown={handleKeyDown}
              voice={voice}
              voicePhase={voicePhase}
              activePlaceholder={activePlaceholder}
              loading={loading}
              streaming={streaming}
              stop={stop}
              handleSend={handleSend}
              voiceError={voiceError}
              setVoiceError={setVoiceError}
              shopperLanguage={shopperLanguage}
              t={t}
            />
          </div>

          <ConversationTimeline
            items={timelineItems}
            activeIdx={activeMsgIdx}
            progress={scrollProgress}
            onJump={jumpToMessage}
            side={isRTL ? 'left' : 'right'}
          />

          <div className={cn("hsk-cb-kiku-id-rail", isRTL ? "hsk-cb-kiku-id-rail--right" : "hsk-cb-kiku-id-rail--left")}>
            <button
              type="button"
              className="hsk-cb-kiku-id-pill"
              onClick={() => displayKikuPub !== 'N/A' && copyValue(displayKikuPub, 'pub')}
              title={t('keyCopyId')}
            >
              <span className="hsk-cb-kiku-id-rail-val">{displayKikuPub}</span>
              {copied === 'pub' ? <CheckIcon /> : <CopyIcon />}
            </button>

            <div className={cn("hsk-cb-theme-squircle-wrap", themeMenuOpen && "is-open", themeMenuClosing && "is-closing")} ref={themeMenuRef}>
              {!themeMenuOpen ? (
                <button
                  type="button"
                  className="hsk-cb-theme-squircle-trigger"
                  onClick={() => setThemeMenuOpen(true)}
                  aria-label="Themes"
                  aria-expanded="false"
                >
                  <span className="hsk-cb-theme-trigger-icon">
                    {React.createElement(themeDef(currentTheme).Icon)}
                  </span>
                  <span className="hsk-cb-theme-trigger-label">
                    {themeDef(currentTheme).label}
                  </span>
                </button>
              ) : (
                <div className="hsk-cb-theme-2x2-grid" role="dialog" aria-label="Theme selector">
                  {THEMES.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={cn("hsk-cb-theme-grid-item", currentTheme === id && "is-active")}
                      onClick={(e) => { e.stopPropagation(); handleToggleTheme(id, true); }}
                    >
                      <Icon />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {voiceMode === 'converse' && (
            <VoiceOverlay
              siteId={(client as any)?.api?.siteId ?? ''}
              themeAttr={hskThemeAttr}
              stopVoice={stopVoice}
              chooseVoice={chooseVoice}
              liveVoiceName={liveVoiceName}
              voiceSecondsLeft={voiceSecondsLeft}
              voiceConnecting={voiceConnecting}
              voicePhase={voicePhase}
              live={live}
              voiceMuted={voiceMuted}
              setVoiceMuted={setVoiceMuted}
              shownSources={shownSources}
              onSelectSource={onSelectSource}
              defaultCurrency={defaultCurrency}
              voiceError={voiceError}
              t={t}
            />
          )}
        </div>
      </div>
    </UIStringsContext.Provider>
  );
}
