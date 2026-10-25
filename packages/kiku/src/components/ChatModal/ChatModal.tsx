import { hasSeenThemes, initialTheme, rememberThemesSeen } from '../../utils/themePreference';
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useId } from 'react';
import { flushSync } from 'react-dom';
import { THEMES, isThemeId, themeDef, DEFAULT_THEME, type ThemeId } from './themes';
import { useKiku, ChatSource, ChatAttachment, CaptureTarget, subscribeLiveStream, type ChatMessage } from '@akropolys/sdk';
import { useAkropolysContext, useCardFields } from '@akropolys/sdk';
import { detailsOf, detailsText } from '../../utils/cardDetails';
import { cn } from '../../utils/cn';
import { resolveTheme } from '../../utils/theme';
import { useHostFontFace, preloadScriptFont } from '../../utils/hostFont';
import { useDragToDismiss } from '../../utils/sheetGesture';
import { downscaleImage } from '../../utils/downscaleImage';
import { MarkupEditor } from '../MarkupEditor';
import type { KikuState } from '../KikuAvatar';
import KikuDoodles, { bloomDoodles } from '../KikuDoodles';

import {
  DEFAULT_CHIPS,
  DEFAULT_UI_STRINGS,
  ONBOARDING_UI_STRINGS,
  UIStringsContext,
  extractName,
  ChatModalProps,
  getLoadingMeta,
  type ComposerAttachment,
} from './types';
import { useScriptFont } from './hooks/useScriptFont';
import { useChatScroll } from './hooks/useChatScroll';
import { usePacedText } from './hooks/usePacedText';
import { useKikuKey } from './hooks/useKikuKey';
import { useChatCommands } from './hooks/useChatCommands';
import { useVoiceController } from './hooks/useVoiceController';
import { ChatTopbar } from './ChatTopbar';
import { CloseIcon, MessageIcon } from './icons';
import { OnboardingView } from './OnboardingView';

const THEME_MENU_EXIT_MS = 240; // outlasts the 220ms exit, or the menu is removed mid-fade and pops
const TRAY_EXIT_CEILING_MS = 700;
const OVERLAY_EXIT_MS = 200;
import { chime, primeChimes } from '../../utils/chime';
import { SoundToggle } from './components/SoundToggle';
import { LayoutToggle } from './components/LayoutToggle';
import { useChatLayout } from './hooks/useChatLayout';
import { isTeamNote, parseThinking } from './components/ThinkingBlock';
import { useDelayedClose } from './hooks/useDelayedClose';

const RadarIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/>
    <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6Z"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);
import { ChatMessages } from './ChatMessages';
import { ChatComposer } from './ChatComposer';
import { VoiceOverlay } from './VoiceOverlay';
import { LightboxModal } from './components/LightboxModal';
import { ConversationTimeline } from './components/ConversationTimeline';
import { TapbackMenu } from './components/TapbackMenu';
import { ThemeDiscoveryHint } from './components/ThemeDiscoveryHint';
import { LayoutDiscoveryNote } from './components/LayoutDiscoveryNote';
import { hasSeenLayoutHint, rememberLayoutHintSeen } from '../../utils/layoutDiscovery';

export function ChatModal({
  title = 'kiku',
  logo,
  placeholder = 'Ask me anything…',
  backdropColor,
  backdropBlur,
  onClose,
  onSelectSource,
  chips = DEFAULT_CHIPS,
  theme,
  classNames = {},
  enableVoice = false,
  voiceLang,
  enableVision = false,
  ttsVoice = 'Algenib',
  origin,
}: ChatModalProps) {
  const client = useAkropolysContext();
  const cardFields = useCardFields();
  const { messages, sources, loading, streaming, error, errorCode, lastAction, lastIntent, allowedActions, send, queuedMessage, sendQueuedNow, appendSpokenExchange, stop, stopped, interrupted, continueGenerating, reset, referencedIds, humanPending, leaveHuman } = useKiku();
  const [leaveAsk, setLeaveAsk] = useState<'close' | 'reset' | null>(null);
  const leaveRef = useRef<HTMLDivElement>(null);
  // A side-to-side nudge when the visitor tries anything else while the warning waits for an answer.
  const nudgeLeave = useCallback(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    leaveRef.current?.animate(
      [0, -7, 6, -4, 2, 0].map(x => ({ transform: `translateX(${x}px)` })),
      { duration: 380, easing: 'cubic-bezier(.36, .07, .19, .97)' },
    );
  }, []);
  useEffect(() => {
    if (!leaveAsk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') nudgeLeave();
    };
    // The conversation is frozen too, so retry, edit and suggestions cannot send behind the warning.
    const onPointer = (e: PointerEvent) => {
      const hit = (cls: string) => e.composedPath().some(n => (n as Element).classList?.contains(cls));
      if (!hit('hsk-cb-leave') && !hit('hsk-cb-topbar')) nudgeLeave();
    };
    const msgs = msgsContainerRef.current as HTMLElement | null;
    msgs?.setAttribute('inert', '');
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      msgs?.removeAttribute('inert');
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [leaveAsk, nudgeLeave]);

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
  const [preloadedStrings, setPreloadedStrings] = useState<Record<string, string> | null>(null);
  const [pendingLanguage, setPendingLanguage] = useState<string>('');
  const [langSwitching, setLangSwitching] = useState(false);

  const {
    chromeReady,
    baseFontReady,
    isRTL,
    speechLang,
    scriptFont,
    fontStack,
    isNonLatin,
    hostFontCovers,
    t,
    tNode,
  } = useScriptFont({ shopperLanguage: shopperLanguage || pendingLanguage, theme, preloadedStrings });

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
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const photoReady = useRef(new Map<string, Promise<string>>());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [vizState, setVizState] = useState<Record<string, 'ok' | 'err'>>({});
  const [lightboxData, setLightboxData] = useState<{
    src?: string | null;
    images?: import('./components/LightboxModal').LightboxImage[];
    initialIndex?: number;
    title?: string;
  } | null>(null);

  const handleOpenLightbox = useCallback((src: string | null, gallery?: import('./components/LightboxModal').LightboxGalleryData) => {
    if (!src && !gallery) {
      setLightboxData(null);
      return;
    }
    if (gallery) {
      setLightboxData({
        images: gallery.images,
        initialIndex: gallery.index ?? 0,
        title: gallery.title,
      });
    } else {
      setLightboxData({ src });
    }
  }, []);
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
  const targetLang = pendingLanguage || shopperLanguage;
  const isEn = !targetLang || targetLang.toLowerCase() === 'english' || targetLang.toLowerCase() === 'en';
  const isLangPreparing = langSwitching || !!pendingLanguage || (!!shopperLanguage && !chromeReady && !isEn);
  const awaitingLang = onboarding && !shopperLanguage && !isLangPreparing;
  const awaitingName = onboarding && !!shopperLanguage && !shopperName && !isLangPreparing;
  const awaitingEntityLang = onboarding && !!shopperLanguage && !!shopperName && !entityLangPref;
  const awaitingConsent = onboarding && !!shopperLanguage && !!shopperName && !!entityLangPref && !termsAgreed;
  const inOnboarding = awaitingLang || awaitingName || awaitingEntityLang || awaitingConsent || isLangPreparing;
  const inputLocked = awaitingEntityLang || awaitingConsent || isLangPreparing;

  const [prevPreparingForComposer, setPrevPreparingForComposer] = useState(isLangPreparing);
  const [composerHidden,   setComposerHidden]   = useState(false);
  const [composerExiting,  setComposerExiting]  = useState(false);
  const [composerRevealing, setComposerRevealing] = useState(false);
  const composerWasHidden = useRef(false);
  const composerHideTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composerRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (isLangPreparing !== prevPreparingForComposer) {
    setPrevPreparingForComposer(isLangPreparing);
    if (isLangPreparing) {
      if (composerRevealTimer.current) clearTimeout(composerRevealTimer.current);
      setComposerRevealing(false);
      setComposerExiting(true);
      composerHideTimer.current = setTimeout(() => {
        setComposerHidden(true);
        setComposerExiting(false);
        composerWasHidden.current = true;
      }, 280);
    } else {
      if (composerHideTimer.current) clearTimeout(composerHideTimer.current);
      setComposerExiting(false);
      setComposerHidden(false);
      if (composerWasHidden.current) {
        composerWasHidden.current = false;
        setComposerRevealing(true);
        composerRevealTimer.current = setTimeout(() => setComposerRevealing(false), 560);
      }
    }
  }

  useEffect(() => () => {
    if (composerHideTimer.current) clearTimeout(composerHideTimer.current);
    if (composerRevealTimer.current) clearTimeout(composerRevealTimer.current);
  }, []);


  const hasLiveData = React.useMemo(
    () => messages.some(m => (m as any).liveKeys?.length > 0),
    [messages]
  );
  useEffect(() => {
    if (!hasLiveData) return;
    return subscribeLiveStream({ client });
  }, [hasLiveData, client]);

  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 1199px)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 1199px)');
    if (!mq) return;
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  const chooseLanguage = async (lang: string) => {
    const v = lang.trim();
    if (!v) {
      try { client.setShopperLanguage?.(''); } catch {  }
      setShopperLanguageState('');
      setPendingLanguage('');
      setPreloadedStrings(null);
      return;
    }
    setPendingLanguage(v);
    setLangSwitching(true);

    const isTargetEn = v.toLowerCase() === 'english' || v.toLowerCase() === 'en';
    if (isTargetEn) {
      setPreloadedStrings(DEFAULT_UI_STRINGS);
      try { client.setShopperLanguage?.(v); } catch {  }
      setShopperLanguageState(v);
      setPendingLanguage('');
      setLangSwitching(false);
      setJustCompleted(false);
      return;
    }

    const animStart = Date.now();
    const MIN_ANIM_MS = 1200;

    try {
      const cached = client.getCachedUIStrings?.(v, ONBOARDING_UI_STRINGS) ?? client.getCachedUIStrings?.(v, DEFAULT_UI_STRINGS);
      if (cached?.strings && Object.keys(cached.strings).length > 0) {
        setPreloadedStrings(cached.strings);
        if (cached.font) {
          await preloadScriptFont(cached.font, 800);
        }
      } else {
        const fetchP = client.getUIStrings?.(v, ONBOARDING_UI_STRINGS);
        const res = await Promise.race([
          fetchP,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
        if (res?.font) {
          await preloadScriptFont(res.font, 1200);
        }
        if (res?.strings && Object.keys(res.strings).length > 0) {
          setPreloadedStrings(res.strings);
        }
      }
    } catch {  }

    const elapsed = Date.now() - animStart;
    if (elapsed < MIN_ANIM_MS) {
      await new Promise((r) => setTimeout(r, MIN_ANIM_MS - elapsed));
    }

    try { client.setShopperLanguage?.(v); } catch {  }
    setShopperLanguageState(v);
    setPendingLanguage('');
    setLangSwitching(false);
    setJustCompleted(false);

    try {
      client.getUIStrings?.(v, DEFAULT_UI_STRINGS)?.catch?.(() => {});
    } catch {  }
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

  const activePlaceholder =
    isLangPreparing ? getLoadingMeta(pendingLanguage || shopperLanguage).preparing
    : awaitingLang ? t('langPlaceholder')
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

  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => initialTheme(theme));

  const [theming, setTheming] = useState(false);
  const themingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (themingTimer.current) clearTimeout(themingTimer.current); }, []);

  // When the doodle bloom from the dock reaches the chat, its content nudges up and away, then settles.
  const nudgeRef = useRef<Animation | null>(null);
  const nudgeContent = () => {
    const msgs = msgsContainerRef.current as HTMLElement | null;
    if (!msgs?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const away = isRTL ? -3 : 3;
    nudgeRef.current?.cancel(); // two nudges on one element fight each other and read as a shake
    nudgeRef.current = msgs.animate(
      [
        { transform: 'translate(0, 0)', easing: 'cubic-bezier(.3, 0, .2, 1)' },
        { offset: 0.26, transform: `translate(${away}px, -6px)`, easing: 'cubic-bezier(.45, 0, .35, 1)' },
        { offset: 0.52, transform: `translate(${-away * 0.3}px, 1.6px)`, easing: 'cubic-bezier(.45, 0, .35, 1)' },
        { offset: 0.74, transform: `translate(${away * 0.1}px, -0.6px)`, easing: 'cubic-bezier(.45, 0, .55, 1)' },
        { transform: 'translate(0, 0)' },
      ],
      { duration: 1100, delay: 380 },
    );
  };
  // The first bloom waits for the greeting or messages to appear, which can lag the panel on a first open.
  // Text that has only just arrived must not nudge: it reads as landing in the wrong place.
  const openBloomedRef = useRef(false);
  useEffect(() => {
    if (openBloomedRef.current) return;
    const box = msgsContainerRef.current as HTMLElement | null;
    if (!box) {
      bloomDoodles();
      return;
    }
    let done = false;
    const shown = () => box.querySelector('.hsk-cb-hello-wrap, .hsk-cb-msg-group');
    const fire = () => {
      if (done) return;
      done = true;
      openBloomedRef.current = true;
      observer.disconnect();
      clearTimeout(limit);
      bloomDoodles();
    };
    const observer = new MutationObserver(() => { if (shown()) fire(); });
    observer.observe(box, { childList: true, subtree: true });
    const limit = window.setTimeout(fire, 2000);
    if (shown()) fire();
    return () => {
      done = true;
      observer.disconnect();
      clearTimeout(limit);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleTheme = (next: ThemeId, alsoCloseMenu = false) => {
    setTheming(true);
    if (themingTimer.current) clearTimeout(themingTimer.current);
    themingTimer.current = setTimeout(() => setTheming(false), 420);
    setCurrentTheme(next);
    nudgeContent();
    if (alsoCloseMenu) closeThemeMenuNow();
    try { localStorage.setItem('akropolys_theme', next); } catch { /* noop */ }
  };

  const { vars: customStyles } = resolveTheme(theme);
  const hskThemeAttr = currentTheme;
  useHostFontFace(theme);

  const handleSendRef = useRef<(text: string) => void>(() => {});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async (text?: string, extraAttachments?: ChatAttachment[], forcedIntent?: string, captureTargets?: CaptureTarget[]) => {
    const raw = (text ?? input).trim();
    const picked = extraAttachments ?? attachments;
    if ((!raw && picked.length === 0) || !chromeReady || queuedMessage) return;

    chime('send');

    if (awaitingName) {
      if (!raw) return;
      const name = extractName(raw) || raw.slice(0, 40);
      try { client.setShopperName?.(name); } catch {  }
      setShopperNameState(name);
      setInput('');
      return;
    }
    if (awaitingLang) {
      if (!raw || langSwitching) return;
      setInput('');
      void chooseLanguage(raw);
      return;
    }
    if (inputLocked) {
      setInput('');
      return;
    }

    setShowKikuPicker(false);
    setShowAtPicker(false);
    setInput('');
    setAttachments([]);
    // A photo sent before its copy is ready waits for it here, out of sight.
    const toSend: ChatAttachment[] = (await Promise.all(picked.map(async ({ thumb, ...a }: ComposerAttachment) => {
      const data = a.data || (thumb ? await photoReady.current.get(thumb)?.catch(() => '') : '') || '';
      if (thumb) URL.revokeObjectURL(thumb);
      return { ...a, data };
    }))).filter(a => a.data);
    const queryToSend = raw || (toSend.some(a => a.type === 'image') ? 'Analyze this image' : 'What is this?');
    await send(queryToSend, raw, toSend.length > 0 ? toSend : undefined, forcedIntent, captureTargets);
  };

  const [retrying, setRetrying] = useState(false);

  const handleRetryMessage = useCallback(async (msg?: ChatMessage) => {
    const target = (msg && msg.role === 'user') ? msg : [...messages].reverse().find(m => m.role === 'user');
    if (!target?.content) return;
    setRetrying(true);
    try {
      await handleSend(target.content);
    } finally {
      setRetrying(false);
    }
  }, [messages, handleSend]);

  const handleEditMessage = useCallback((msg: ChatMessage) => {
    if (!msg?.content) return;
    setInput(msg.content);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = msg.content.length;
        try {
          textareaRef.current.setSelectionRange(len, len);
        } catch {}
      }
    }, 50);
  }, [setInput, textareaRef]);

  const retryLastMessage = useCallback(async () => {
    await handleRetryMessage();
  }, [handleRetryMessage]);

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

  // The key rides in the address fragment, which never leaves the browser; MiMi takes it and clears it.
  const openMimi = useCallback(() => {
    const key = client?.getKikuKey?.();
    if (key) window.open(`https://mimi.akropolys.cloud/#k=${encodeURIComponent(key)}`, '_blank', 'noopener');
  }, [client]);

  const [tapbackTarget, setTapbackTarget] = useState<{
    msg: any;
    rect: { top: number; left: number; width: number; height: number };
    isUser: boolean;
    el?: HTMLElement;
  } | null>(null);



  const handlePinMessage = useCallback(async (msg: any) => {
    // Pinning an earlier pin must not stack the command onto itself.
    const text = (msg.content || '').replace(/^(@kiku pin\s*)+/i, '');
    const snippet = text.slice(0, 50).replace(/\n+/g, ' ');
    const display = `@kiku pin ${snippet}`;
    await send(text || 'pin message', display, undefined, 'capture');
  }, [send]);

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
    earlier,
    newVoiceChat,
    attachPhoto,
  } = useVoiceController({
    voiceLang,
    speechLang,
    shopperLanguage,
    ttsVoice,
    messages,
    handleSendUtterance: (text) => handleSendRef.current(text),
    appendSpokenExchange,
  });

  const panelRef = useRef<HTMLDivElement>(null);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [themeDiscovery, setThemeDiscovery] = useState(false);
  const [layoutHintEligible, setLayoutHintEligible] = useState(() => !hasSeenLayoutHint());
  const [layoutHintIndex, setLayoutHintIndex] = useState<number | null>(null);
  const [layoutGuidance, setLayoutGuidance] = useState(false);
  const [themeMenuReady, setThemeMenuReady] = useState(false);
  const markThemeMenuReady = useCallback(() => setThemeMenuReady(true), []);
  useEffect(() => {
    if (themeMenuOpen) rememberThemesSeen();
    else {
      setThemeDiscovery(false);
      setLayoutGuidance(false);
    }
  }, [themeMenuOpen]);
  const layoutDockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!themeMenuOpen && layoutDockTimer.current) clearTimeout(layoutDockTimer.current);
    return () => { if (layoutDockTimer.current) clearTimeout(layoutDockTimer.current); };
  }, [themeMenuOpen]);
  // The grid marks the theme it opened on; a pick just closes it rather than moving the mark first.
  const [themeMenuMark, setThemeMenuMark] = useState<ThemeId | null>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const mobileThemeRef = useRef<HTMLDivElement>(null);

  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gooId = `hsk-goo-${useId()}`;

  const {
    closing: themeMenuClosing,
    requestClose: closeThemeMenu,
    closeNow: closeThemeMenuNow,
  } = useDelayedClose(isNarrow ? TRAY_EXIT_CEILING_MS : THEME_MENU_EXIT_MS, () => setThemeMenuOpen(false));

  useEffect(() => {
    if (!themeMenuOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const path = (e.composedPath ? e.composedPath() : []) as EventTarget[];
      const isInsideRail = themeMenuRef.current && (path.includes(themeMenuRef.current) || themeMenuRef.current.contains(e.target as Node));
      const isInsideMobile = mobileThemeRef.current && (path.includes(mobileThemeRef.current) || mobileThemeRef.current.contains(e.target as Node));
      const isLayoutNote = path.some(el => (el as HTMLElement).classList?.contains('hsk-cb-layout-discovery-note'));
      const targetEl = e.target as HTMLElement | null;
      const isInsideTopbarMark = targetEl?.closest?.('.hsk-cb-topbar-mark');
      const isInsideOoze = targetEl?.closest?.('.hsk-cb-topbar-ooze-menu') || path.some((el: any) => el?.classList?.contains?.('hsk-cb-topbar-ooze-menu'));

      if (isInsideRail || isInsideMobile || isInsideTopbarMark || isInsideOoze || isLayoutNote) {
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
    spacerRef,
    lastExternalScrollRef,
    showJumpToBottom,
    scrollProgress,
    activeMsgIdx,
    unreadBelow,
    jumpToMessage,
    revealMessage,
    jumpToBottom,
  } = useChatScroll({ messages, loading, streaming, messageRefs });
  const handleLongPressMessage = useCallback((
    msg: any,
    rect: { top: number; left: number; width: number; height: number },
    isUser: boolean,
    el?: HTMLElement
  ) => {
    if (el) revealMessage(el);
    setTapbackTarget({ msg, rect, isUser, el });
  }, [revealMessage]);

  const chatLayout = useChatLayout(msgsContainerRef);
  const handleToggleLayout = () => {
    chatLayout.toggle();
    rememberLayoutHintSeen();
    setLayoutHintEligible(false);
    setLayoutHintIndex(null);
    setLayoutGuidance(false);
    if (!isNarrow) return;
    if (layoutDockTimer.current) clearTimeout(layoutDockTimer.current);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) closeThemeMenuNow();
    else layoutDockTimer.current = setTimeout(closeThemeMenu, 400);
  };
  const openLayoutDock = () => {
    setThemeMenuMark(currentTheme);
    setLayoutGuidance(true);
    setThemeMenuOpen(true);
  };

  const { closing: overlayClosing, requestClose: exitOverlay } = useDelayedClose(OVERLAY_EXIT_MS, onClose);
  useEffect(() => {
    if (!chromeReady || !baseFontReady || !themeMenuReady || overlayClosing || hasSeenThemes()) return;
    const timer = window.setTimeout(() => {
      if (hasSeenThemes()) return;
      setThemeMenuMark(currentTheme);
      setThemeDiscovery(true);
      setThemeMenuOpen(true);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [chromeReady, baseFontReady, themeMenuReady, overlayClosing, currentTheme]);
  // end=true tells the team the visitor is done; otherwise the request is kept for when they come back.
  const closeNow = useCallback((end: boolean) => {
    if (end) leaveHuman();
    setThemeMenuOpen(false);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) onClose();
    else exitOverlay();
  }, [exitOverlay, onClose, leaveHuman]);
  // While a person is on the request, the visitor chooses whether to keep it or end it.
  const requestClose = useCallback(() => {
    if (leaveAsk) nudgeLeave();
    else if (humanPending) setLeaveAsk('close');
    else closeNow(false);
  }, [humanPending, closeNow, leaveAsk, nudgeLeave]);

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
      if (lightboxData) { setLightboxData(null); return; }
      requestClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lightboxData, requestClose]);

  const resetNow = useCallback((end: boolean) => {
    if (end) leaveHuman();
    reset();
    setLayoutHintIndex(null);
    setKeyPhase('idle');
  }, [reset, setKeyPhase, leaveHuman]);
  const handleReset = useCallback(() => {
    if (leaveAsk) nudgeLeave();
    else if (humanPending) setLeaveAsk('reset');
    else resetNow(false);
  }, [humanPending, resetNow, leaveAsk, nudgeLeave]);

  const handleSourceClick = (src: ChatSource) => {
    onSelectSource?.(src);
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant && lastAssistant.content.trim().endsWith('?')) {
      send(t('cardClickAnswer', { name: src.name }));
      return;
    }
    send(t('cardClickQuery', { name: src.name, details: detailsText(detailsOf(src, cardFields)) }));
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
      const thumb = URL.createObjectURL(file);
      const ready = downscaleImage(file);
      photoReady.current.set(thumb, ready);
      setAttachments(prev => [...prev, { type: 'image', data: '', thumb }]);
      ready
        .then(data => setAttachments(prev => prev.map(a => (a.thumb === thumb ? { ...a, data } : a))))
        .catch(() => setAttachments(prev => prev.filter(a => a.thumb !== thumb)))
        .finally(() => photoReady.current.delete(thumb));
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => {
      const gone = prev[idx]?.thumb;
      if (gone) URL.revokeObjectURL(gone);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const hasTranslucentBackdrop = backdropColor && (backdropColor.includes('rgba') || backdropColor.includes('hsla') || backdropColor === 'transparent');
  const backdropFilterStyle = (backdropBlur || hasTranslucentBackdrop) ? {
    backdropFilter: `blur(${typeof backdropBlur === 'number' ? `${backdropBlur}px` : (backdropBlur || '20px')})`,
    WebkitBackdropFilter: `blur(${typeof backdropBlur === 'number' ? `${backdropBlur}px` : (backdropBlur || '20px')})`,
  } : {};
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !streaming) {
      const last = messages[messages.length - 1];
      if (last && last.role !== 'user') chime('reply');
    }
    wasStreaming.current = streaming;
  }, [streaming, messages]);

  const halted = (stopped || interrupted) && !loading && !streaming;

  const tail = messages[messages.length - 1];
  const pacedContent = usePacedText(tail?.role === 'assistant' ? tail.content ?? '' : '');
  const draining = tail?.role === 'assistant' && pacedContent.length < (tail.content?.length ?? 0);
  const revealing = streaming || draining;

  const displayMessages = React.useMemo(() => {
    const inFlight = loading || streaming;
    const kept = messages.filter((m, i) => {
      if (m.role !== 'assistant') return true;
      const isLastMsg = i === messages.length - 1;
      if (isLastMsg && inFlight) return true;
      const hasBody = !!m.content || !!m.visualization || m.visualizing ||
        (m.knowledgeImages?.length ?? 0) > 0 || (m.referencedIds?.length ?? 0) > 0 || isTeamNote(m.statusStage);
      return hasBody;
    });
    const last = kept.length - 1;
    if (last < 0 || kept[last].role !== 'assistant') return kept;
    if (kept[last] !== messages[messages.length - 1]) return kept;
    // stream end is not reveal end; dropping paced content here prints the rest in one frame
    const draining = pacedContent.length < (kept[last].content?.length ?? 0);
    if (!inFlight && !draining) return kept;
    return kept.map((m, i) => (i === last ? { ...m, content: pacedContent } : m));
  }, [messages, loading, streaming, pacedContent]);

  const hasLayoutContent = displayMessages.some(message =>
    message.role === 'assistant' && !isTeamNote(message.statusStage) && parseThinking(message.content).content.trim().length > 0
  );
  useEffect(() => {
    if (!layoutHintEligible || loading || revealing || error || halted || voiceMode !== 'off') return;
    for (let index = displayMessages.length - 1; index >= 0; index--) {
      const message = displayMessages[index];
      if (message.role !== 'assistant' || isTeamNote(message.statusStage) || !parseThinking(message.content).content.trim()) continue;
      setLayoutHintEligible(false);
      setLayoutHintIndex(index);
      break;
    }
  }, [layoutHintEligible, displayMessages, loading, revealing, error, halted, voiceMode]);

  const timelineItems = React.useMemo(() => {
    const items: Array<{ idx: number; text: string }> = [];
    displayMessages.forEach((m, idx) => {
      if (m.role === 'user' && !!m.content.trim()) {
        const clean = m.content.replace(/^@kiku\s*/i, '').replace(/\s+/g, ' ').trim();
        items.push({
          idx,
          text: clean.length > 28 ? clean.slice(0, 27).trimEnd() + '…' : clean,
        });
      }
    });
    return items;
  }, [displayMessages]);

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
        className={cn("hsk-cb-overlay", origin && "hsk-cb-overlay--grows", overlayClosing && "hsk-cb-overlay--closing", classNames.overlay)}
        onPointerDown={e => {
          primeChimes();
          if (e.target === e.currentTarget) {
            (overlayRef.current as any)._ptrDown = true;
          }
        }}
        onClick={e => {
          if (e.target === e.currentTarget && (overlayRef.current as any)?._ptrDown && Date.now() - mountTimeRef.current > 200) {
            requestClose();
          }
          if (overlayRef.current) (overlayRef.current as any)._ptrDown = false;
        }}
        data-hsk-theme={hskThemeAttr}
        data-hsk-layout={chatLayout.wide ? 'wide' : 'bubbles'}
        data-hsk-theming={theming ? '' : undefined}
        style={{
          ...(backdropFilterStyle),
          ...(backdropColor ? { background: backdropColor } : {}),
          ...(origin ? {
            '--hsk-ox': `${origin.x}px`,
            '--hsk-oy': `${origin.y}px`,
          } as React.CSSProperties : {}),
          ...customStyles,
        }}
      >
        <div
          ref={panelRef}
          className={cn("hsk-cb-panel", classNames.panel)}
          dir={isRTL ? 'rtl' : 'ltr'}
          lang={speechLang || undefined}
          data-script={isNonLatin ? 'nonlatin' : 'latin'}
          data-host-font={hostFontCovers ? 'covers' : 'gap'}
          data-nastaliq={(scriptFont?.family === 'Noto Nastaliq Urdu' || shopperLanguage?.toLowerCase() === 'urdu' || shopperLanguage?.toLowerCase() === 'ur' || shopperLanguage === 'اردو') ? 'true' : undefined}
          style={fontStack ? ({ '--hsk-font': fontStack } as React.CSSProperties) : undefined}
          onClick={e => {
            e.stopPropagation();
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG' && (target.classList.contains('hsk-markdown-img') || target.classList.contains('hsk-cb-user-img-thumb'))) {
              const src = (target as HTMLImageElement).src;
              if (src) handleOpenLightbox(src);
            }
          }}
        >
          <LightboxModal
            src={lightboxData?.src}
            images={lightboxData?.images}
            initialIndex={lightboxData?.initialIndex}
            title={lightboxData?.title}
            onClose={() => setLightboxData(null)}
          />

          {markupSrc && (
            <div className="hsk-markup-overlay">
              <MarkupEditor
                src={markupSrc}
                t={t as (key: string, vars?: Record<string, string>) => string}
                onCancel={() => setMarkupSrc(null)}
                onSend={(dataUrl, instruction, marks, preview) => {
                  setMarkupSrc(null);
                  handleSend(
                    instruction,
                    [{ type: 'image', data: dataUrl, annotated: true, marks, instructed: true, preview }],
                  );
                }}
              />
            </div>
          )}

          <div className="hsk-cb-main">
            <KikuDoodles seed={(client as any)?.api?.siteId ?? ''} theme={hskThemeAttr} dir={isRTL ? 'rtl' : 'ltr'} waitForContent />

            <ChatTopbar
              layoutControl={hasLayoutContent ? <LayoutToggle wide={chatLayout.wide} onToggle={handleToggleLayout} emphasized={layoutGuidance} /> : undefined}
              title={title}
              logo={logo}
              hasMessages={messages.length > 0}
              avatarState={streaming ? 'speaking' : loading ? 'thinking' : 'idle'}
              unread={unreadBelow}
              awayFromBottom={showJumpToBottom}
              themeMenuOpen={themeMenuOpen}
              themeMenuClosing={themeMenuClosing}
              themeDiscovery={themeDiscovery}
              onThemeMenuReady={markThemeMenuReady}
              onThemeMenuClosed={closeThemeMenuNow}
              isNarrow={isNarrow}
              currentTheme={currentTheme}
              onJumpToLatest={jumpToBottom}
              onReset={handleReset}
              onClose={requestClose}
              onToggleThemeMenu={() => (themeMenuOpen ? closeThemeMenu() : setThemeMenuOpen(true))}
              onSelectTheme={(t) => { handleToggleTheme(t, true); }}
              themeAttr={hskThemeAttr}
            />

            <div className="hsk-cb-msgs" ref={msgsContainerRef as any}>
              {displayMessages.length === 0 ? (
                <OnboardingView
                  theme={hskThemeAttr}
                  inOnboarding={inOnboarding}
                  justCompleted={justCompleted}
                  onboardingMood={onboardingMood}
                  awaitingLang={awaitingLang}
                  awaitingName={awaitingName}
                  awaitingEntityLang={awaitingEntityLang}
                  awaitingConsent={awaitingConsent}
                  termsAgreed={termsAgreed}
                  shopperLanguage={shopperLanguage}
                  pendingLanguage={pendingLanguage}
                  shopperName={shopperName}
                  entityLangPref={entityLangPref}
                  chromeReady={chromeReady && baseFontReady}
                  activeChips={activeChips}
                  speechLang={speechLang}
                  t={t}
                  tNode={tNode}
                  chooseLanguage={chooseLanguage}
                  langSwitching={langSwitching}
                  isLangPreparing={isLangPreparing}
                  chooseEntityLang={chooseEntityLang}
                  agreeTerms={agreeTerms}
                  handleSend={handleSend}
                />
              ) : (
                <ChatMessages
                  afterReply={layoutHintIndex === null ? undefined : { index: layoutHintIndex, node: <LayoutDiscoveryNote onOpenDock={openLayoutDock} /> }}
                  doodleTheme={hskThemeAttr}
                  displayMessages={displayMessages}
                  messageRefs={messageRefs}
                  isNarrow={isNarrow}
                  loading={loading}
                  streaming={revealing}
                  sources={sources}
                  referencedIds={referencedIds}
                  discussedSources={discussedSources}
                  lastIntent={lastIntent}
                  lastAction={lastAction}
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
                  setMintedPub={setMintedPub}
                  minting={minting}
                  copied={copied}
                  keyCountdown={keyCountdown}
                  handleUseExistingKey={handleUseExistingKey}
                  handleCreateKey={handleCreateKey}
                  copyValue={copyValue}
                  queuedMessage={queuedMessage}
                  sendQueuedNow={sendQueuedNow}
                  setLightboxSrc={handleOpenLightbox}
                  setMarkupSrc={setMarkupSrc}
                  handleSend={handleSend}
                  handleSourceClick={handleSourceClick}
                  onRetry={handleRetryMessage}
                  onEdit={handleEditMessage}
                  onLongPress={handleLongPressMessage}
                  retrying={retrying}
                  continueGenerating={continueGenerating}
                  t={t}
                  spacerRef={spacerRef}
                  vizState={vizState}
                  setVizState={setVizState}
                  messages={messages}
                />
              )}
            </div>

            {!composerHidden && (
              <div
                className={cn(
                  'hsk-cb-composer-wrapper',
                  composerExiting  && 'hsk-composer-exit-up',
                  composerRevealing && 'hsk-composer-reveal',
                )}
              >
                <ChatComposer
                  notice={leaveAsk && (
                    <div className="hsk-cb-leave" role="alertdialog" ref={leaveRef}>
                      <span>{t('leaveHumanWarning')}</span>
                      <button type="button" className="hsk-cb-leave-btn" onClick={() => setLeaveAsk(null)}>{t('leaveHumanStay')}</button>
                      <button
                        type="button"
                        className="hsk-cb-leave-btn hsk-cb-leave-btn--end"
                        onClick={() => { const kind = leaveAsk; setLeaveAsk(null); if (kind === 'reset') resetNow(true); else closeNow(true); }}
                      >
                        {t('leaveHumanConfirm')}
                      </button>
                    </div>
                  )}
                  gooId={gooId}
                  input={input}
                  setInput={setInput}
                  showKikuPicker={showKikuPicker}
                  setShowKikuPicker={setShowKikuPicker}
                  showAtPicker={showAtPicker}
                  setShowAtPicker={setShowAtPicker}
                  captureAllowed={captureAllowed}
                  discussedSources={discussedSources}
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
                  enableVision={enableVision && !inOnboarding}
                  enableVoice={enableVoice && !inOnboarding}
                  canConverse={canConverse}
                  startVoice={startVoice}
                  inputLocked={inputLocked}
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
                  langSwitching={langSwitching || isLangPreparing}
                  t={t}
                  onOpenMimi={client?.getKikuKey?.() ? openMimi : undefined}
                />
              </div>
            )}
          </div>

          {voiceMode !== 'converse' && (
            <ConversationTimeline
              items={timelineItems}
              activeIdx={activeMsgIdx}
              progress={scrollProgress}
              onJump={jumpToMessage}
              side={isRTL ? 'left' : 'right'}
            />
          )}


          <div className={cn("hsk-cb-kiku-id-rail", isRTL ? "hsk-cb-kiku-id-rail--right" : "hsk-cb-kiku-id-rail--left", themeMenuOpen && !themeMenuClosing && 'is-theme-open')}>
            <div className="hsk-cb-dock-frost" aria-hidden="true" />
            <SoundToggle />

            {/* One pill that grows into the theme grid and shrinks back, like the voices pill. */}
            <div className={cn("hsk-cb-theme-squircle-wrap", themeMenuOpen && !themeMenuClosing && "is-open")} ref={themeMenuRef}>
              <div
                className="hsk-cb-theme-2x2-grid"
                role="dialog"
                aria-label="Theme selector"
                ref={(el) => { if (el) el.inert = !themeMenuOpen || themeMenuClosing; }}
              >
                {THEMES.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={cn("hsk-cb-theme-grid-item", (themeMenuMark ?? currentTheme) === id && "is-active")}
                    onClick={(e) => { e.stopPropagation(); handleToggleTheme(id, true); }}
                  >
                    <Icon />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="hsk-cb-theme-squircle-trigger"
                onClick={() => {
                  if (themeMenuOpen) { closeThemeMenuNow(); return; }
                  setThemeMenuMark(currentTheme);
                  setThemeMenuOpen(true);
                }}
                aria-label="Themes"
                aria-expanded={themeMenuOpen}
              >
                <span className="hsk-cb-theme-trigger-icon">
                  {React.createElement(themeDef(currentTheme).Icon)}
                </span>
                <span className="hsk-cb-theme-trigger-label">
                  {themeDef(currentTheme).label}
                </span>
              </button>
            </div>

            {!isNarrow && themeMenuOpen && themeDiscovery && <ThemeDiscoveryHint closing={themeMenuClosing} />}

            {hasLayoutContent && <LayoutToggle wide={chatLayout.wide} onToggle={handleToggleLayout} emphasized={layoutGuidance} />}

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
              earlier={earlier}
              newVoiceChat={newVoiceChat}
              voiceMuted={voiceMuted}
              setVoiceMuted={setVoiceMuted}
              voiceError={voiceError}
              attachPhoto={attachPhoto}
              onSelectSource={(src: ChatSource) => {
                onSelectSource?.(src);
                live.ask(t('cardClickQuery', { name: src.name, details: detailsText(detailsOf(src, cardFields)) }));
              }}
              t={t}
            />
          )}

          {tapbackTarget && (
            <TapbackMenu
              msg={tapbackTarget.msg}
              rect={tapbackTarget.rect}
              anchorEl={tapbackTarget.el}
              containerEl={panelRef.current}
              scrollEl={msgsContainerRef.current}
              containerRect={panelRef.current?.getBoundingClientRect()}
              isUser={tapbackTarget.isUser}
              isRTL={isRTL}
              canRetry={!loading && !streaming}
              onPin={handlePinMessage}
              onRetry={handleRetryMessage}
              onCopy={async (text) => {
                if (!text) return false;
                try {
                  await navigator.clipboard.writeText(text);
                  return true;
                } catch {  }
                try {
                  const ta = document.createElement('textarea');
                  ta.value = text;
                  ta.setAttribute('readonly', '');
                  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
                  document.body.appendChild(ta);
                  ta.select();
                  ta.setSelectionRange(0, text.length);
                  const ok = document.execCommand('copy');
                  document.body.removeChild(ta);
                  return ok;
                } catch {
                  return false;
                }
              }}
              onClose={() => setTapbackTarget(null)}
              t={t}
            />
          )}
        </div>
      </div>
    </UIStringsContext.Provider>
  );
}
