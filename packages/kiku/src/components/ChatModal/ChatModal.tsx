import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useId } from 'react';
import { figure, when } from '../../utils/figure';
import { flushSync } from 'react-dom';
import { THEMES, isThemeId, themeDef, DEFAULT_DARK, DEFAULT_LIGHT, type ThemeId } from './themes';
import { useKiku, useScouts, ChatSource, ChatAttachment, CaptureTarget, subscribeLiveStream } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { cn } from '../../utils/cn';
import { resolveTheme } from '../../utils/theme';
import { useHostFontFace, preloadScriptFont } from '../../utils/hostFont';
import { useDragToDismiss } from '../../utils/sheetGesture';
import { downscaleImage } from '../../utils/downscaleImage';
import { MarkupEditor } from '../MarkupEditor';
import { ScoutRail, ScoutReceipt, speciesNick, humanMinutes } from '../Scouts';
import type { KikuState } from '../KikuAvatar';
import KikuDoodles from '../KikuDoodles';

import {
  DEFAULT_CHIPS,
  DEFAULT_UI_STRINGS,
  ONBOARDING_UI_STRINGS,
  UIStringsContext,
  extractName,
  ChatModalProps,
  getLoadingMeta,
  type Translate,
} from './types';
import { warmLanguage } from '../../utils/chromeWarm';
import { useScriptFont } from './hooks/useScriptFont';
import { useChatScroll } from './hooks/useChatScroll';
import { usePacedText } from './hooks/usePacedText';
import { useKikuKey } from './hooks/useKikuKey';
import { useChatCommands } from './hooks/useChatCommands';
import { useVoiceController } from './hooks/useVoiceController';
import { ChatTopbar } from './ChatTopbar';
import { CopyIcon, CheckIcon, CloseIcon } from './icons';
import { OnboardingView } from './OnboardingView';

const THEME_MENU_EXIT_MS = 180;
const TRAY_EXIT_CEILING_MS = 700;
const OVERLAY_EXIT_MS = 200;
import { chime, primeChimes } from '../../utils/chime';
import { SoundToggle } from './components/SoundToggle';
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
import { AudioWaveTimeline } from './components/AudioWaveTimeline';
import { TapbackMenu } from './components/TapbackMenu';

// Clicking a scout used to post `scout <uuid>` at the model, which answered with
// an error because it is not a question. The scout's own log tells the story.
// Every line is a UI string, so the tale arrives in the shopper's language; only
// the numbers, the subject and the nickname stay as they are.
function scoutBrief(scout: any, t: Translate): [string, string] {
  const who = speciesNick(scout.id, scout.avatar);
  const watch = scout.brief || scout.subject;

  if (scout.status === "triggered") {
    const at = scout.triggerValue ? ` ${figure(scout.triggerValue)}` : "";
    return [t("scoutAskHowDid", { who }), t("scoutBriefCameIn", { who, watch, at })];
  }
  if (scout.status === "expired") {
    return [t("scoutAskHowDid", { who }), t("scoutBriefRanOut", { who, watch })];
  }
  if (scout.status === "idle") {
    return [t("scoutAskWhatDoing", { who }), t("scoutBriefWaiting", { who })];
  }
  return [t("scoutAskWhatDoing", { who }), t("scoutBriefWatching", { who, watch })];
}

// The tale: where the scout was sent, how the value moved, and where it stands.
// The event log holds no ticks, only turns of the brief, so the value trail —
// initialValue to triggerValue — carries the movement. Markdown stays in code:
// the strings are machine-translated, and asterisks do not survive that.
// One row per thing the scout did, oldest first. ✓ and ✗ stay in code so translation cannot drop them.
function scoutLog(scout: any, events: any[], t: Translate, lang?: string): string[] {
  const fig = (v: unknown) => figure(String(v), lang);
  const briefed = events.some((e) => e.eventType === "briefed");
  const rows: string[] = [];
  const row = (iso: string, what: string) => rows.push(`| ${when(iso, lang)} | ${what} |`);
  const sorted = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const e of sorted) {
    const p = e.payload || {};
    if (e.eventType === "briefed" || (e.eventType === "spawned" && !briefed)) {
      row(e.createdAt, scout.initialValue ? t("scoutLogSetOutAt", { v: fig(scout.initialValue) }) : t("scoutLogSetOut"));
    } else if (e.eventType === "triggered") {
      row(e.createdAt, `✓ ${p.triggerValue ? t("scoutLogMetAt", { v: fig(p.triggerValue) }) : t("scoutLogMet")}`);
    } else if (e.eventType === "acted") {
      row(e.createdAt, p.result?.status === "sent" ? `✓ ${t("scoutLogSent", { what: String(p.action ?? "") })}` : `✗ ${t("scoutLogNotSent")}`);
    } else if (e.eventType === "refused") {
      row(e.createdAt, `✗ ${t("scoutLogRefused")}`);
    } else if (e.eventType === "paused") {
      row(e.createdAt, t("scoutLogPaused"));
    } else if (e.eventType === "resumed") {
      row(e.createdAt, t("scoutLogResumed"));
    } else if (e.eventType === "canceled") {
      row(e.createdAt, t("scoutLogCanceled"));
    }
  }
  return rows;
}

function scoutStory(scout: any, events: any[], balance: number, t: Translate, lang?: string): string {
  const who = `**${speciesNick(scout.id, scout.avatar)}**`;
  const spent = scout.minutesUsed ?? 0;
  const used = humanMinutes(spent, t);
  const left =
    scout.dedicatedMinutes > 0 ? scout.dedicatedMinutes : scout.status === "expired" ? 0 : balance;
  const budget =
    left > 0
      ? spent > 0
        ? t("scoutBudgetLeft", { left: humanMinutes(left, t), used })
        : t("scoutBudgetLeftOnly", { left: humanMinutes(left, t) })
      : t("scoutBudgetSpent", { used });
  if (scout.status === "idle") {
    return [t("scoutStoryIdle", { who }), "", t("scoutStoryIdleLead", { budget })].join("\n");
  }

  const watch = scout.brief || scout.subject;
  const done = scout.status === "triggered" || scout.status === "expired";
  const lines: string[] = [t(done ? "scoutStoryWatched" : "scoutStoryWatching", { who, watch })];

  const rows = scoutLog(scout, events, t, lang);
  if (rows.length) lines.push("", `| ${t("scoutLogTime")} | ${t("scoutLogWhat")} |`, "|---|---|", ...rows);

  const ending =
    scout.status === "triggered"
      ? t("scoutStoryReached")
      : scout.status === "expired"
        ? t("scoutStoryExpired")
        : scout.status === "paused"
          ? t("scoutStoryPaused")
          : t("scoutStoryRunning");

  lines.push("", `${ending} ${budget}`);
  return lines.join("\n");
}

// The avatar's departure lands in the transcript rather than vanishing behind a
// closed rail. Appended locally: the model has no notion of avatar nicknames,
// and the brief the shopper types next is what actually deploys the scout.
function sendOutExchange(avatar: string | undefined, t: Translate): [string, string] {
  const who = avatar ? speciesNick(avatar, avatar) : 'a scout';
  return [t('scoutSendOutAsk', { who }), t('scoutReady', { who })];
}

export function ChatModal({
  title = 'kiku',
  logo,
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
  ttsVoice = 'Puck',
  origin,
  arrivals,
}: ChatModalProps) {
  const client = useAkropolysContext();
  const { messages, sources, loading, streaming, error, errorCode, lastAction, lastIntent, allowedActions, send, queuedMessage, sendQueuedNow, appendSpokenExchange, stop, stopped, interrupted, continueGenerating, reset, referencedIds } = useKiku();
  const { enabled: scoutsAllowed, scouts, activeScouts, balance, justTriggered, dispatchScout } = useScouts();

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
  const targetLang = pendingLanguage || shopperLanguage;
  const isEn = !targetLang || targetLang.toLowerCase() === 'english' || targetLang.toLowerCase() === 'en';
  const isLangPreparing = langSwitching || !!pendingLanguage || (!!shopperLanguage && !chromeReady && !isEn);
  const awaitingLang = onboarding && !shopperLanguage && !isLangPreparing;
  const awaitingName = onboarding && !!shopperLanguage && !shopperName && !isLangPreparing;
  const awaitingEntityLang = onboarding && !!shopperLanguage && !!shopperName && !entityLangPref;
  const awaitingConsent = onboarding && !!shopperLanguage && !!shopperName && !!entityLangPref && !termsAgreed;
  const inOnboarding = awaitingLang || awaitingName || awaitingEntityLang || awaitingConsent || isLangPreparing;
  const inputLocked = awaitingEntityLang || awaitingConsent || isLangPreparing;

  // Composer choreography:
  // 1. isLangPreparing → true: immediately start composerExiting (slides UP with Apple blur),
  //    then after 280ms hide it completely and start the spinner rise.
  // 2. isLangPreparing → false: show immediately with composerRevealing (slides UP from below clearing blur).
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
      // Start exit-up animation immediately (in sync with step1 flying away)
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


  useEffect(() => {
    if (!awaitingLang) return;
    const trimmed = input.trim();
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      warmLanguage(client, trimmed, DEFAULT_UI_STRINGS);
    }, 150);
    return () => clearTimeout(timer);
  }, [awaitingLang, input, client]);

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
    const mq = window.matchMedia?.('(max-width: 899px)');
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

    // English: no animation — instant transition (it's the default, nothing to "load")
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

    // For all non-English languages, enforce a minimum animation window so the
    // goo spinner always has time to rise, orbit, and fall — even when strings
    // are already cached.  Target: step1-exit (300ms) + spinner-rise (700ms) +
    // min-steady (200ms) = 1200ms.  We start the clock now.
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

    // Hold the preparing state long enough for the spinner animation to feel intentional
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

  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => {
    if (isThemeId(theme)) return theme;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('akropolys_theme');
      if (isThemeId(saved)) return saved;
      return window.matchMedia?.('(prefers-color-scheme: light)').matches ? DEFAULT_LIGHT : DEFAULT_DARK;
    }
    return DEFAULT_DARK;
  });

  const [theming, setTheming] = useState(false);
  const themingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (themingTimer.current) clearTimeout(themingTimer.current); }, []);

  // Fluid theme switch: updates active theme and lets CSS & canvas glyphs animate live
  const handleToggleTheme = (next: ThemeId, alsoCloseMenu = false) => {
    setTheming(true);
    if (themingTimer.current) clearTimeout(themingTimer.current);
    themingTimer.current = setTimeout(() => setTheming(false), 420);
    setCurrentTheme(next);
    if (alsoCloseMenu) closeThemeMenuNow();
    try { localStorage.setItem('akropolys_theme', next); } catch { /* noop */ }
  };

  const { vars: customStyles } = resolveTheme(theme);
  const hskThemeAttr = currentTheme;
  useHostFontFace(theme);

  const handleSendRef = useRef<(text: string) => void>(() => {});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A scout's page is its report: fetched fresh, told in the transcript.
  const tellScoutStory = async (scout: any) => {
    const [heard] = scoutBrief(scout, t);
    try {
      const full = await client?.scouts.get(scout.id);
      const sc = full?.scout ?? scout;
      appendSpokenExchange(heard, scoutStory(sc, full?.events ?? [], balance, t, shopperLanguage));
    } catch {
      appendSpokenExchange(...scoutBrief(scout, t));
    }
  };

  // A scout that comes in says so in the thread, and if the shopper agreed it
  // could send something, it goes now — from this tab, under their own login.
  const announced = useRef<Set<string>>(new Set());
  useEffect(() => {
    justTriggered.forEach(async (sc: any) => {
      if (announced.current.has(sc.id)) return;
      announced.current.add(sc.id);
      await tellScoutStory(sc);
      if (!sc.actionType || sc.actionType === 'alert') return;
      try {
        const ev = await dispatchScout(sc.id);
        appendSpokenExchange(t('scoutSendingHeard'), t('scoutSent', { what: ev?.message ?? sc.actionType }));
      } catch (err: any) {
        appendSpokenExchange(t('scoutSendingHeard'), t('scoutCouldNotSend', { why: err?.message ?? '' }));
      }
    });
  }, [justTriggered]);

  // Arrivals while closed are told on open; the first poll would file them as history.
  useEffect(() => {
    (arrivals ?? []).forEach((sc: any) => {
      if (announced.current.has(sc.id)) return;
      announced.current.add(sc.id);
      void tellScoutStory(sc);
    });
  }, []);

  // A scout that fires while nobody is watching the rail used to change colour
  // and chime into an empty room. It hands over a receipt instead, and the
  // receipt stays until the shopper tears it off — reading the story does not
  // count as dismissing it.
  const DISMISSED_KEY = 'akropolys_scout_receipts_seen';
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; }
  });
  const dismissReceipt = (id: string) => {
    setDismissed((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-80))); } catch {  }
      return next;
    });
  };
  const receipts = scouts
    .filter((s) => s.status === 'triggered' && !dismissed.includes(s.id))
    .slice(-6);

  // The stub says it happened; the detail is a real turn, so the model explains
  // what the scout did — with the live value and its log — in the shopper's own
  // language rather than a canned line.
  const openReceipt = (scout: any) => {
    const who = speciesNick(scout.id, scout.avatar);
    const watch = scout.brief || scout.subject;
    void handleSendRef.current?.(t('scoutExplainAsk', { who, watch }));
  };

  const handleSend = async (text?: string, extraAttachments?: ChatAttachment[], forcedIntent?: string, captureTargets?: CaptureTarget[]) => {
    const raw = (text ?? input).trim();
    const toSend = extraAttachments ?? attachments;
    if ((!raw && toSend.length === 0) || !chromeReady || queuedMessage) return;

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

  const [tapbackTarget, setTapbackTarget] = useState<{
    msg: any;
    rect: { top: number; left: number; width: number; height: number };
    isUser: boolean;
    el?: HTMLElement;
  } | null>(null);

  const handleLongPressMessage = useCallback((
    msg: any,
    rect: { top: number; left: number; width: number; height: number },
    isUser: boolean,
    el?: HTMLElement
  ) => {
    setTapbackTarget({ msg, rect, isUser, el });
  }, []);

  const handlePinMessage = useCallback(async (msg: any) => {
    const snippet = (msg.content || '').slice(0, 50).replace(/\n+/g, ' ');
    const display = `@kiku pin ${snippet}`;
    await send(msg.content || 'pin message', display, undefined, 'capture');
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
  const [scoutsOpen, setScoutsOpen] = useState(false);
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
    spacerRef,
    lastExternalScrollRef,
    showJumpToBottom,
    scrollProgress,
    activeMsgIdx,
    unreadBelow,
    jumpToMessage,
    jumpToBottom,
  } = useChatScroll({ messages, loading, streaming, messageRefs });

  const { closing: overlayClosing, requestClose: exitOverlay } = useDelayedClose(OVERLAY_EXIT_MS, onClose);
  const requestClose = useCallback(() => {
    setThemeMenuOpen(false);
    setScoutsOpen(false);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) onClose();
    else exitOverlay();
  }, [exitOverlay, onClose]);

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
      requestClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lightboxSrc, requestClose]);

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
        (m.knowledgeImages?.length ?? 0) > 0 || (m.referencedIds?.length ?? 0) > 0;
      return hasBody;
    });
    const last = kept.length - 1;
    if (last < 0 || kept[last].role !== 'assistant') return kept;
    if (kept[last] !== messages[messages.length - 1]) return kept;
    // The stream ending is not the reveal ending: dropping the paced content
    // here printed the whole remaining reply in one frame.
    const draining = pacedContent.length < (kept[last].content?.length ?? 0);
    if (!inFlight && !draining) return kept;
    return kept.map((m, i) => (i === last ? { ...m, content: pacedContent } : m));
  }, [messages, loading, streaming, pacedContent]);

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

  const audioWaveItems = React.useMemo(() => {
    const items: Array<{
      idx: number;
      text?: string;
      audioUrl?: string;
      assistantAudioUrl?: string;
      assistantIdx?: number;
      duration?: number;
      spoken?: boolean;
    }> = [];

    displayMessages.forEach((m, idx) => {
      if (m.role === 'user' && !!m.content.trim()) {
        const clean = m.content.replace(/^@kiku\s*/i, '').replace(/\s+/g, ' ').trim();
        const nextMsg = displayMessages[idx + 1];
        const assistantAudioUrl = nextMsg?.role === 'assistant' ? nextMsg.audioUrl : undefined;
        const assistantIdx = nextMsg?.role === 'assistant' ? idx + 1 : undefined;
        items.push({
          idx,
          text: clean,
          audioUrl: m.audioUrl,
          assistantAudioUrl,
          assistantIdx,
          duration: nextMsg?.thoughtForSeconds,
          spoken: !!m.spoken || !!nextMsg?.spoken,
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
              title={title}
              logo={logo}
              hasMessages={messages.length > 0}
              avatarState={streaming ? 'speaking' : loading ? 'thinking' : 'idle'}
              unread={unreadBelow}
              awayFromBottom={showJumpToBottom}
              themeMenuOpen={themeMenuOpen}
              themeMenuClosing={themeMenuClosing}
              onThemeMenuClosed={closeThemeMenuNow}
              isNarrow={isNarrow}
              currentTheme={currentTheme}
              onJumpToLatest={jumpToBottom}
              onReset={handleReset}
              onClose={requestClose}
              onToggleThemeMenu={() => (themeMenuOpen ? closeThemeMenu() : setThemeMenuOpen(true))}
              onSelectTheme={(t) => { handleToggleTheme(t, true); }}
              themeAttr={hskThemeAttr}
              onScoutNew={(avatar) => {
                appendSpokenExchange(...sendOutExchange(avatar, t));
                setTimeout(() => textareaRef.current?.focus(), 60);
              }}
              scoutsAllowed={scoutsAllowed}
              onScoutAsk={(scout) => { void tellScoutStory(scout); }}
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
                  onPrewarmLanguage={(lang) => warmLanguage(client, lang, DEFAULT_UI_STRINGS)}
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
                  streaming={revealing}
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
              <div className={cn(
                composerExiting  && 'hsk-composer-exit-up',
                composerRevealing && 'hsk-composer-reveal',
              )}>
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
                  enableVision={enableVision && !inOnboarding}
                  enableVoice={enableVoice && !inOnboarding}
                  canConverse={canConverse}
                  voiceMode={voiceMode}
                  startVoice={startVoice}
                  inputLocked={inputLocked}
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
                  langSwitching={langSwitching || isLangPreparing}
                  t={t}
                />
              </div>
            )}
          </div>

          {voiceMode === 'off' ? (
            <ConversationTimeline
              items={timelineItems}
              activeIdx={activeMsgIdx}
              progress={scrollProgress}
              onJump={jumpToMessage}
              side={isRTL ? 'left' : 'right'}
            />
          ) : (
            <AudioWaveTimeline
              items={audioWaveItems}
              activeIdx={activeMsgIdx}
              progress={scrollProgress}
              onJump={jumpToMessage}
              side={isRTL ? 'left' : 'right'}
              voiceMuted={voiceMuted}
              setVoiceMuted={setVoiceMuted}
              voiceMode={voiceMode}
              voicePhase={voicePhase}
              live={live}
            />
          )}

          {/* Allowance pills removed: no upfront usage limit display */}

          <div className={cn("hsk-cb-kiku-id-rail", isRTL ? "hsk-cb-kiku-id-rail--right" : "hsk-cb-kiku-id-rail--left")}>
            <div className="hsk-cb-dock-frost" aria-hidden="true" />
            {scoutsAllowed && <ScoutReceipt
              scouts={receipts}
              isNarrow={isNarrow}
              lang={shopperLanguage}
              onOpen={openReceipt}
              onDismiss={dismissReceipt}
            />}

            {scoutsAllowed && <ScoutRail
              themeAttr={hskThemeAttr}
              open={scoutsOpen}
              onOpenChange={(v) => {
                setScoutsOpen(v);
                if (v && themeMenuOpen) closeThemeMenuNow();
              }}
              onAsk={(scout) => { void tellScoutStory(scout); }}
              onNew={(avatar) => {
                appendSpokenExchange(...sendOutExchange(avatar, t));
                setTimeout(() => textareaRef.current?.focus(), 60);
              }}
            />}

            <SoundToggle />

            {/* Themes Expandable Selection */}
            <div className={cn("hsk-cb-theme-squircle-wrap", themeMenuOpen && "is-open", themeMenuClosing && "is-closing")} ref={themeMenuRef}>
              {!themeMenuOpen ? (
                <button
                  type="button"
                  className="hsk-cb-theme-squircle-trigger"
                  onClick={() => { setScoutsOpen(false); setThemeMenuOpen(true); }}
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

            {/* Kiku ID Pill */}
            <button
              type="button"
              className="hsk-cb-kiku-id-pill"
              onClick={() => displayKikuPub !== 'N/A' && copyValue(displayKikuPub, 'pub')}
              aria-label={t('keyCopyId')}
            >
              <span className="hsk-cb-kiku-id-rail-val">{displayKikuPub}</span>
              {copied === 'pub' ? <CheckIcon /> : <CopyIcon />}
            </button>
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
              voiceError={voiceError}
              t={t}
            />
          )}

          {tapbackTarget && (
            <TapbackMenu
              msg={tapbackTarget.msg}
              rect={tapbackTarget.rect}
              anchorEl={tapbackTarget.el}
              containerEl={panelRef.current}
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
