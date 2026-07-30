'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useKiku, ChatMessage, ChatSource } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { renderMarkdown } from '../utils/markdown';
import { AkropolysTheme, ChatAttachment, CaptureTarget } from '@akropolys/sdk';
import { cn } from '../utils/cn';
import { resolveTheme } from '../utils/theme';
import { useHostFontFace } from '../utils/hostFont';
import { useDragToDismiss } from '../utils/sheetGesture';
import { ComparisonMatrix } from './ComparisonMatrix';
import { MarkupEditor } from './MarkupEditor';
import { ArrowUpIcon } from '../utils/icons';


export interface KikuButtonProps {
  label?: string;
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
  /** Enable 🎙️ voice input via browser Web Speech API (free) */
  enableVoice?: boolean;
  /** BCP-47 tag for voice transcription (e.g. 'sw-KE', 'fr-FR'). Overrides the
      language chosen in onboarding; falls back to <html lang>, then browser. */
  voiceLang?: string;
  /** Enable 📷 visual style-match search via Gemini (requires backend GEMINI_API_KEY) */
  enableVision?: boolean;
  /** Optional category hint for visual search (e.g. 'dress', 'curtains') */
  visionCategoryHint?: string;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

// kiku brand mark — glyph extracted from public/brand/akropolys-icon.svg, fill
// only (no background rect) so it drops into the existing colored circles/badges.
const KikuIcon = ({ className, size = 18 }: { className?: string; size?: number }) => (
  <svg
    className={cn("hsk-brand-mark", className)}
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="kiku"
  >
    <g transform="translate(22.7 19) scale(0.62)" fill="currentColor" fillRule="evenodd">
      <path d="M39.4 10.4 Q44 0 48.6 10.4 L86.1 95.8 Q88 100 83.4 100 L4.6 100 Q0 100 1.9 95.8 Z M24 100 L24 65 Q24 60 27.4 56.3 Q44 38 60.6 56.3 Q64 60 64 65 L64 100 Z" />
      <circle cx="55" cy="82" r="3.4" />
    </g>
  </svg>
);

const SparkleIcon = KikuIcon;

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2"/>
  </svg>
);

const ExternalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const ContinueIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

const HistoryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M12 7v5l4 2"/>
  </svg>
);

const BookmarkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const SecureShieldIcon = ({ className, size = 18 }: { className?: string; size?: number }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    <path d="M12 11v4" />
  </svg>
);

const PaperclipIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>
);

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

const MicOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22"/>
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
    <path d="M5 10v2a7 7 0 0 0 12 5"/>
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────

// Blank canvas by default — the empty state is just the logo + a welcome line,
// like other chat assistants. Integrators can still pass their own `chips`.
const DEFAULT_CHIPS: string[] = [];

// English source strings for widget chrome that appears AFTER the shopper has
// chosen a language (step 3 onward) — translated once per language via
// client.getUIStrings and cached client-side. {tokens} are interpolated after
// translation, not before, so the model can place them naturally in the
// target language's word order.
// Shortcut chips for the first onboarding step, each written in its own script.
// This is NOT an allowlist — any language typed into the box is accepted and
// works identically; these are just the fastest paths for the most common ones.
// `value` stays English because it is what the model is told to reply in.
const LANGUAGE_CHOICES = [
  { value: 'English', native: 'English', tag: 'en', rtl: false },
  { value: 'Swahili', native: 'Kiswahili', tag: 'sw', rtl: false },
  { value: 'French', native: 'Français', tag: 'fr', rtl: false },
  { value: 'Spanish', native: 'Español', tag: 'es', rtl: false },
  { value: 'Arabic', native: 'العربية', tag: 'ar', rtl: true },
  { value: 'Portuguese', native: 'Português', tag: 'pt', rtl: false },
  { value: 'Hindi', native: 'हिन्दी', tag: 'hi', rtl: false },
  { value: 'Chinese', native: '中文', tag: 'zh', rtl: false },
];

// Shown while the chrome for a freshly chosen language is being fetched. It is
// deliberately wordless — any text here would have to be English, which is the
// exact thing this whole flow exists to avoid.
function ChromeLoading() {
  return (
    <div className="hsk-cb-chrome-loading" aria-busy="true">
      <span className="hsk-cb-chrome-loading-bar" />
      <span className="hsk-cb-chrome-loading-bar" />
      <span className="hsk-cb-chrome-loading-bar" />
    </div>
  );
}

// Browsers refuse mic access off a secure origin, which is why voice works on
// localhost but not over a LAN IP — the failure otherwise looks like a denial.
const isSecureOrigin = () =>
  typeof window === 'undefined' || window.isSecureContext !== false;

const WAVE_BARS = 64;


/**
 * ListeningWave — a row of dots that blooms outward from the centre with the
 * actual loudness of the shopper's voice, read from an AnalyserNode.
 *
 * Deliberately NOT a looping keyframe animation: a wave that dances while the
 * room is silent tells the shopper the mic is hearing them when it isn't. At
 * rest these are still dots; they only move when there is something to show.
 */
function ListeningWave() {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let audioCtx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;
    const level = new Array(WAVE_BARS).fill(0);

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AC();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const spectrum = new Uint8Array(analyser.frequencyBinCount);
        const mid = (WAVE_BARS - 1) / 2;

        const tick = () => {
          analyser.getByteFrequencyData(spectrum);
          const row = rowRef.current;
          if (row) {
            for (let i = 0; i < WAVE_BARS; i++) {
              // Mirror around the centre so the voice blooms outward instead of
              // reading left-to-right like a progress bar.
              const fromMid = Math.abs(i - mid) / mid;
              // Speech energy lives low in the spectrum; the top bins are hiss.
              const bin = Math.min(spectrum.length - 1, Math.round(fromMid * spectrum.length * 0.45));
              const target = (spectrum[bin] / 255) * (1 - fromMid * 0.45);
              level[i] += (target - level[i]) * 0.3;
              const dot = row.children[i] as HTMLElement | undefined;
              if (dot) {
                dot.style.transform = `scaleY(${(1 + level[i] * 13).toFixed(3)})`;
                dot.style.opacity = (0.3 + level[i] * 0.7).toFixed(3);
              }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // No meter available — the dots simply rest. Recognition is unaffected.
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      audioCtx?.close().catch(() => {});
    };
  }, []);

  return (
    <div className="hsk-cb-listening" ref={rowRef} aria-hidden="true">
      {Array.from({ length: WAVE_BARS }).map((_, i) => <span key={i} />)}
    </div>
  );
}

const DEFAULT_UI_STRINGS = {
  // Onboarding step 2. Step 1 asks for the language itself and is therefore the
  // only surface that cannot be translated — everything from here down is
  // rendered in the shopper's language before it is ever shown.
  nameStepTitle: 'Nice to meet you.',
  nameStepLead: 'I can search, visualize, or capture anything for you — on this site or any other.',
  nameStepAsk: 'What should I call you?',
  namePlaceholder: 'Type your name…',

  // The returning-shopper greeting, shown on every later visit before the first
  // question of the session.
  greetReturning: 'Hi, {name}.',
  greetReturningLead: 'What can I find for you today?',

  howShouldResultsLook: 'How should results look?',
  entityLangIntro: 'I reply in {lang}. Result cards can stay exactly as this site wrote them, or be translated too.',
  asWritten: 'As written',
  inLanguage: 'In {lang}',
  namesAsWritten: 'Names and details exactly as the site lists them.',
  detailsTranslated: 'Details translated. Numbers and links stay exactly as listed.',
  entityLangPlaceholder: 'Pick one of the two cards above…',
  allSet: "You're all set, {name}.",
  replyingTranslated: 'Replying in {lang}, results translated too. Ask me anything.',
  replyingOriginal: 'Replying in {lang}, results as this site wrote them. Ask me anything.',
  defaultPlaceholder: 'Ask me anything…',
  footerHint: 'kiku · searches the whole catalogue in real time',

  // Voice. Every one of these was previously a silent no-op.
  voiceListening: 'Listening… tap the mic to stop',
  voiceSending: 'Got it — sending…',
  micDenied: 'Microphone blocked. Allow mic access for this site, then try again.',
  micInsecure: 'Voice needs a secure (https) connection.',
  micMissing: 'No microphone found.',
  micLangUnsupported: 'This browser cannot transcribe that language yet. Type instead.',
  micNetwork: 'Voice needs a connection right now. Check yours and try again.',
  micNoSpeech: "Didn't catch anything. Try again, a little closer to the mic.",
  micFailed: "Couldn't hear that. Try again.",

  // Persistent chat chrome — visible on every turn, so English here is the
  // most jarring mismatch of all once the shopper has picked a language.
  clearChat: 'Clear chat',
  thinking: 'Thinking',
  // Duration is passed as a complete token ("5s"), not a bare number with the
  // unit appended outside — that produced "Fikiri kwa sekunde 5s" in Swahili,
  // where the translation supplied "seconds" and the template added "s" again.
  thoughtForSeconds: 'Thought for {duration}',
  thoughtProcess: 'Thought process',
  captureAndRemember: 'kiku — capture & remember',
  captureCurrentPage: 'Capture current page',
  captureAll: 'Capture all ({count})',
  whatHaveYouSaved: 'What have you saved?',
  deleteThis: 'Delete this',

  // Error copy. Server failures arrive as a stable code (see WriteErrorCode)
  // and are looked up here, so a shopper never sees an English error inside an
  // otherwise translated UI.
  errShopperReplyLimit: "You've reached this site's reply limit for your account.",
  errAccessRevoked: 'Your access to the assistant has been revoked by the store.',
  errAccountRequired: 'Please create an account to continue using the chat assistant.',
  errStreamInterrupted: 'The reply was interrupted. Please try again.',
  errTooManyRequests: 'The assistant is currently receiving too many requests. Please try again in a few moments.',
  errTokenLimit: "You've reached your usage limit. Please update your billing limits in your dashboard to continue.",

  statusSent: 'Sent',
  statusStopped: 'Sent · reply stopped',

  // Follow-up suggestion pills. Both halves are translated: the label is read,
  // and the query becomes the shopper's own next message — sending English on
  // their behalf inside a translated conversation reads as a glitch.
  pillCompareTop2: 'Compare top 2',
  pillCompareTop2Query: 'Compare the {a} and {b}',
  pillMoreOn: 'More on {name}',
  pillMoreOnQuery: 'Tell me more about the {name}',
  pillUnder: 'Under {amount}',
  pillUnderQuery: 'Show me options under {amount}',
  pillSimilarOptions: 'Similar options',
  pillSimilarOptionsQuery: 'Show me more like the {name}',
  pillWhichBest: 'Which is best?',
  pillWhichBestQuery: 'Which one would you recommend and why?',
  pillFindAlternatives: 'Find alternatives',
  pillFindAlternativesQuery: 'What are good alternatives to the {name}?',
  pillShowPopular: 'Show popular items',
  pillShowPopularQuery: 'What are your most popular items?',
  pillRecommend: 'Recommend something',
  pillRecommendQuery: 'What do you recommend for me?',

  // Sent on the shopper's behalf when they tap a result card, so it shows in
  // their own message bubble and must be in their language. Phrased without
  // assuming a purchase — the catalogue may be jobs, articles or property.
  cardClickAnswer: 'The {name}',
  cardClickQuery: 'Tell me more about the {name}{price} — what are its key details, who is it best suited for, and what should I know?',

  // Echoed into the shopper's own bubble when they use an @kiku command. The
  // "@kiku" token stays literal — it's the command itself, not prose.
  displayCapture: 'capture {name}',
  displayCaptureAll: 'capture all ({count} items)',
  displayViewHistory: 'what have you saved?',
  displayDelete: 'delete this',

} as const;

type UIStringKey = keyof typeof DEFAULT_UI_STRINGS;
type Translate = (key: UIStringKey, vars?: Record<string, string>) => string;

// Chat chrome lives in sibling components (the thinking block, the @kiku
// picker), so the translator is shared by context rather than threaded through
// every signature. Defaults to English, which is exactly what a consumer
// rendered outside the provider should show.
const UIStringsContext = React.createContext<Translate>(
  (key, vars) => {
    let s: string = DEFAULT_UI_STRINGS[key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }
);
const useT = () => React.useContext(UIStringsContext);

// Markdown was re-parsed for EVERY message on every streamed token, so a long
// conversation paid O(messages) parses per token. Memoised, only the message
// whose text actually changed re-parses.
const MarkdownBlock = React.memo(
  ({ content, streaming }: { content: string; streaming: boolean }) => <>{renderMarkdown(content, streaming)}</>,
  (a, b) => a.content === b.content && a.streaming === b.streaming
);
MarkdownBlock.displayName = 'MarkdownBlock';

// Pull a first name out of a first message ("John", "hey, I'm John", "call me
// Jean-Paul"). Returns null when the text reads like a real query instead, so a
// shopper who dives straight into searching is never mistaken for giving a name.
function extractName(raw: string): string | null {
  let s = raw.trim();
  if (!s || s.length > 40 || s.includes('?')) return null;
  s = s.replace(/^(hi|hey|hello|yo)[,!.\s]+/i, '');
  s = s.replace(/^(i['’]?m|im|my name is|call me|it['’]?s|this is|name['’]?s)\s+/i, '');
  s = s.trim().replace(/[.!,]+$/, '');
  const words = s.split(/\s+/);
  if (words.length === 0 || words.length > 3) return null;
  if (!/^[\p{L}][\p{L}\-'’ ]{0,30}$/u.test(s)) return null;
  const q = s.toLowerCase();
  const queryish = ['phone', 'laptop', 'tv', 'cheap', 'best', 'under', 'buy', 'search', 'find', 'show', 'need', 'want', 'price', 'sofa', 'shoe', 'headphone', 'camera', 'gift', 'help'];
  if (queryish.some(w => q.includes(w))) return null;
  const name = words[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── @kiku Mention System ─────────────────────────────────────────────────────

/**
 * Parses the user's input for an @kiku mention prefix.
 * Returns the resolved intent + a cleaned query (product name only, no @kiku prefix)
 * that gets sent as the actual search text. Returns null if not an @kiku command.
 */
function parseAtKiku(raw: string): { intent: string; cleanQuery: string } | null {
  const trimmed = raw.trim();
  if (!/^@kiku\b/i.test(trimmed)) return null;

  const rest = trimmed.slice(5).trim(); // everything after "@kiku"

  if (rest === '' || /^(capture|save)\b/i.test(rest)) {
    return {
      intent: 'capture',
      cleanQuery: rest.replace(/^(capture|save)\s*/i, '').trim() || trimmed,
    };
  }
  if (/^(history|what have you|show my|my items|what did you|saved|captures|recall)\b/i.test(rest)) {
    return { intent: 'view_history', cleanQuery: 'show my saved items' };
  }
  if (/^(delete|forget|remove|unsave)\b/i.test(rest)) {
    return {
      intent: 'delete',
      cleanQuery: rest.replace(/^(delete|forget|remove|unsave)\s*/i, '').trim() || trimmed,
    };
  }
  // A language change is an instruction to the assistant, not a capture —
  // forcing it to capture sent it down the kiku-history path, which rejects
  // on sites without capture enabled before the server ever saw the request.
  // Passing null sends it as a plain query (with the @kiku prefix intact),
  // where the backend detects the switch in any phrasing or language.
  if (/\b(language|lang)\b/i.test(rest) || /^(change|switch|set|update)\b/i.test(rest)) {
    return null;
  }

  // Bare "@kiku <text>" defaults to capture
  return { intent: 'capture', cleanQuery: rest || trimmed };
}

// ─── @kiku Picker Menu ────────────────────────────────────────────────────────

interface KikuPickerMenuProps {
  sources: ChatSource[];
  referencedIds: string[];
  defaultCurrency: string;
  onCapture: (product: ChatSource) => void;
  onCaptureAll: (products: ChatSource[]) => void;
  onViewHistory: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

function KikuPickerMenu({
  sources,
  referencedIds,
  defaultCurrency,
  onCapture,
  onCaptureAll,
  onViewHistory,
  onDelete,
  onDismiss,
}: KikuPickerMenuProps) {
  const tr = useT();
  // Show products that were actually referenced in this conversation
  const discussed = sources.filter(s => s.id && referencedIds.includes(s.id));

  return (
    <div
      className="hsk-kiku-picker"
      role="menu"
      aria-label="@kiku commands"
      onMouseDown={e => e.preventDefault()} // keep textarea focused
    >
      {discussed.map((src, i) => (
        <button
          key={src.id ?? i}
          className="hsk-kiku-picker-item"
          role="menuitem"
          onClick={() => { onCapture(src); onDismiss(); }}
        >
          <span className="hsk-kiku-picker-icon">
            {src.image ? <img src={src.image} alt="" /> : <BookmarkIcon />}
          </span>
          <span className="hsk-kiku-picker-item-name">{src.name}</span>
          {src.price && (
            <span className="hsk-kiku-picker-item-price">
              {src.currency ?? defaultCurrency} {parseFloat(String(src.price).replace(/[^0-9.]/g, '') || '0').toLocaleString()}
            </span>
          )}
        </button>
      ))}
      {discussed.length > 1 && (
        <button
          className="hsk-kiku-picker-item"
          role="menuitem"
          onClick={() => { onCaptureAll(discussed); onDismiss(); }}
        >
          <span className="hsk-kiku-picker-icon"><BookmarkIcon /></span>
          <span className="hsk-kiku-picker-item-name">{tr('captureAll', { count: String(discussed.length) })}</span>
        </button>
      )}
      {discussed.length === 0 && (
        <button
          className="hsk-kiku-picker-item"
          role="menuitem"
          onClick={() => { onCapture({ name: 'current page', id: undefined }); onDismiss(); }}
        >
          <span className="hsk-kiku-picker-icon"><BookmarkIcon /></span>
          <span className="hsk-kiku-picker-item-name">{tr('captureCurrentPage')}</span>
        </button>
      )}
      <button
        className="hsk-kiku-picker-item"
        role="menuitem"
        onClick={() => { onViewHistory(); onDismiss(); }}
      >
        <span className="hsk-kiku-picker-icon"><HistoryIcon /></span>
        <span className="hsk-kiku-picker-item-name">{tr('whatHaveYouSaved')}</span>
      </button>
      <button
        className="hsk-kiku-picker-item"
        role="menuitem"
        onClick={() => { onDelete(); onDismiss(); }}
      >
        <span className="hsk-kiku-picker-icon"><TrashIcon /></span>
        <span className="hsk-kiku-picker-item-name">{tr('deleteThis')}</span>
      </button>
    </div>
  );
}

// ─── @ Extension Picker Menu ──────────────────────────────────────────────────

interface AtPickerMenuProps {
  onSelect: (extension: string) => void;
  onDismiss: () => void;
}

function AtPickerMenu({ onSelect, onDismiss }: AtPickerMenuProps) {
  const tr = useT();
  return (
    <div
      className="hsk-kiku-picker"
      role="menu"
      aria-label="Extensions"
      onMouseDown={e => e.preventDefault()} // keep textarea focused
    >
      <button
        className="hsk-kiku-picker-item"
        role="menuitem"
        onClick={() => onSelect('@kiku')}
      >
        <span className="hsk-kiku-picker-icon hsk-kiku-picker-icon--accent"><SparkleIcon /></span>
        <span className="hsk-kiku-picker-item-name">{tr('captureAndRemember')}</span>
      </button>
    </div>
  );
}

// ─── Sources Carousel ──────────────────────────────────────────────────────────

interface SourcesCarouselProps {
  sources: ChatSource[];
  defaultCurrency: string;
  onSelectSource?: (src: ChatSource) => void;
  onImageClick?: (src: string) => void;
  referencedIds?: string[];
  compact?: boolean;
}

function SourceImg({ src, alt, onImageClick }: { src: string; alt?: string; onImageClick?: (src: string) => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hsk-chat-source-bg, rgba(0,0,0,.04))', color: 'var(--hsk-chat-muted, #888)' }}>
        <SparkleIcon />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      onError={() => setFailed(true)}
      onClick={onImageClick ? (e) => { e.stopPropagation(); onImageClick(src); } : undefined}
    />
  );
}

function SourcesCarousel({ sources, defaultCurrency, onSelectSource, onImageClick, referencedIds = [], compact = false }: SourcesCarouselProps) {
  const client = useAkropolysContext();
  const isProperty = client?.vertical === 'property';
  const railRef = useRef<HTMLDivElement>(null);
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const display = sources.filter(s => s.id && referencedIds.includes(s.id));

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el || display.length === 0) return;
    setShowPrev(el.scrollLeft > 10);
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 12;
    setShowNext(el.scrollWidth > el.clientWidth + 4 && !atEnd);

    const cardWidth = 190;
    const idx = Math.round(el.scrollLeft / cardWidth);
    setActiveIndex(Math.min(Math.max(0, idx), display.length - 1));
  }, [display.length]);

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure); };
  }, [measure, sources]);

  const scrollNext = () => {
    railRef.current?.scrollBy({ left: 190, behavior: 'smooth' });
  };

  const scrollPrev = () => {
    railRef.current?.scrollBy({ left: -190, behavior: 'smooth' });
  };

  if (display.length === 0) return null;

  return (
    <div className={cn("hsk-cb-sources-wrap", compact && "hsk-cb-sources-wrap--compact")}>
      {showPrev && (
        <>
          <div className="hsk-cb-sources-fade-left" />
          <button className="hsk-cb-sources-prev" onClick={scrollPrev} aria-label="Previous">
            <ChevronLeftIcon />
          </button>
        </>
      )}

      <div className="hsk-cb-sources" ref={railRef}>
        {display.map((src, si) => {
          const isReferenced = !!(src.id && referencedIds.includes(src.id));
          return (
            <div
              key={src.id ?? si}
              className={cn("hsk-cb-source", isReferenced && "hsk-cb-source--referenced")}
              style={{ animationDelay: `${si * 50}ms` }}
              onClick={() => onSelectSource?.(src)}
            >
              {src.image ? (
                <div className="hsk-cb-src-imgwrap" style={{ position: 'relative' }}>
                  <SourceImg src={src.image} alt={src.name} onImageClick={onImageClick} />
                  {isProperty && (
                    <div style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(14, 14, 15, 0.75)',
                      backdropFilter: 'blur(4px)',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fbbf24',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      <SparkleIcon size={12} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="hsk-cb-src-imgwrap-empty" style={{ position: 'relative' }}>
                  <SparkleIcon />
                </div>
              )}
              <div className="hsk-cb-src-info">
                <div className="hsk-cb-src-name">{src.name}</div>
                {src.price && (
                  <div className="hsk-cb-src-price">
                    {src.currency ?? defaultCurrency}{' '}
                    {parseFloat(String(src.price).replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNext && (
        <>
          <div className="hsk-cb-sources-fade-right" />
          <button className="hsk-cb-sources-next" onClick={scrollNext} aria-label="See more">
            <ChevronRightIcon />
          </button>
        </>
      )}

      {/* Instagram-style Pagination Dots */}
      {display.length > 1 && (
        <div className="hsk-cb-carousel-dots">
          {display.map((_, i) => (
            <div
              key={i}
              className={cn("hsk-cb-dot-item", i === activeIndex && "hsk-cb-dot-item--active")}
              onClick={() => {
                railRef.current?.scrollTo({ left: i * 190, behavior: 'smooth' });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Strip markdown tables (used for compare view to avoid duplicate) ──────────

function stripMarkdownTables(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (line.trim().startsWith('|')) continue;   // table row or separator
    out.push(line);
  }
  // Collapse runs of 3+ blank lines down to 2
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Smart context pills ──────────────────────────────────────────────────────
// Shown after every assistant response (when there's no cart action).
// Pills are generated from the current intent + sources so they're always relevant.

function SmartContextPills({
  intent,
  sources,
  onSend,
  loading,
  defaultCurrency = '',
}: {
  intent: string | null;
  sources: ChatSource[];
  onSend: (text: string) => void;
  loading: boolean;
  defaultCurrency?: string;
}) {
  const tr = useT();
  if (!intent) return null;

  const pills: { label: string; query: string; emoji: string }[] = [];

  // Find the cheapest item in the sources list
  const cheapest =
    sources.length > 0
      ? sources.reduce((min, s) => {
          const p = parseFloat(String(s.price ?? '').replace(/[^0-9.]/g, ''));
          const m = parseFloat(String(min.price ?? '').replace(/[^0-9.]/g, ''));
          return !isNaN(p) && (isNaN(m) || p < m) ? s : min;
        }, sources[0])
      : null;

  const firstName = sources[0]?.name ?? '';
  const firstTwo = sources.slice(0, 2).map(s => s.name);

  // A price threshold derived from what's actually on screen. The old pill
  // hardcoded "KSh 20K"/"KSh 5M", which is wrong for any site not pricing in
  // Kenyan shillings — and the platform is domain- and market-blind.
  const priceCeiling = (): string | null => {
    const nums = sources
      .map(s => parseFloat(String(s.price ?? '').replace(/[^0-9.]/g, '')))
      .filter(n => !isNaN(n) && n > 0);
    if (nums.length === 0) return null;
    const max = Math.max(...nums);
    // Round up to a clean figure so the suggestion reads like a human wrote it.
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const rounded = Math.ceil(max / mag) * mag;
    const raw = String(sources.find(s => s.price)?.price ?? '');
    const symbol = raw.replace(/[0-9.,\s]/g, '') || defaultCurrency;
    return `${symbol} ${rounded.toLocaleString()}`.trim();
  };

  if (intent === 'search' && sources.length > 0) {
    if (firstTwo.length >= 2) {
      pills.push({
        emoji: '⚖️',
        label: tr('pillCompareTop2'),
        query: tr('pillCompareTop2Query', { a: firstTwo[0], b: firstTwo[1] }),
      });
    }
    if (cheapest?.name) {
      const short = cheapest.name.split(' ').slice(0, 3).join(' ');
      pills.push({
        emoji: '💡',
        label: tr('pillMoreOn', { name: short }),
        query: tr('pillMoreOnQuery', { name: cheapest.name }),
      });
    }
    const ceiling = priceCeiling();
    if (ceiling) {
      pills.push({
        emoji: '💰',
        label: tr('pillUnder', { amount: ceiling }),
        query: tr('pillUnderQuery', { amount: ceiling }),
      });
    }
  } else if (intent === 'compare' && sources.length > 0) {
    if (firstName) {
      pills.push({
        emoji: '🔍',
        label: tr('pillSimilarOptions'),
        query: tr('pillSimilarOptionsQuery', { name: firstName }),
      });
    }
    pills.push({ emoji: '💡', label: tr('pillWhichBest'), query: tr('pillWhichBestQuery') });
  } else if (intent === 'specs' && sources.length > 0) {
    if (firstName) {
      pills.push({
        emoji: '🔄',
        label: tr('pillFindAlternatives'),
        query: tr('pillFindAlternativesQuery', { name: firstName }),
      });
    }
  } else if (intent === 'general') {
    pills.push({ emoji: '🔍', label: tr('pillShowPopular'), query: tr('pillShowPopularQuery') });
    pills.push({ emoji: '💡', label: tr('pillRecommend'), query: tr('pillRecommendQuery') });
  }

  if (pills.length === 0) return null;

  return (
    <div className="hsk-action-pills">
      {pills.map(pill => (
        <button
          key={pill.query}
          className="hsk-action-pill"
          onClick={() => onSend(pill.query)}
          disabled={loading}
        >
          <span className="hsk-pill-emoji">{pill.emoji}</span>
          {pill.label}
        </button>
      ))}
    </div>
  );
}

// ─── Error helper ──────────────────────────────────────────────────────────────

// Server errors carry a stable code; prefer it over matching English text so
// the message can be shown in the shopper's language. Falls back to substring
// matching for provider/network failures that have no code of our own.
const SERVER_ERROR_STRINGS: Record<string, UIStringKey> = {
  shopper_reply_limit: 'errShopperReplyLimit',
  access_revoked: 'errAccessRevoked',
  account_required: 'errAccountRequired',
  stream_interrupted: 'errStreamInterrupted',
};

const getFriendlyError = (err: any, tr: Translate) => {
  const code = err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
  if (code && SERVER_ERROR_STRINGS[code]) return tr(SERVER_ERROR_STRINGS[code]);

  let str = '';
  if (typeof err === 'string') str = err;
  else if (err && typeof err === 'object' && err.message) str = err.message;
  else try { str = JSON.stringify(err); } catch { str = String(err); }

  const lower = str.toLowerCase();
  if (
    lower.includes('429') ||
    lower.includes('too many requests') ||
    lower.includes('requests per minute limit exceeded') ||
    lower.includes('too_many_requests_error') ||
    lower.includes('request_quota_exceeded') ||
    lower.includes('quota')
  ) {
    return tr('errTooManyRequests');
  }

  if (lower.includes('token limit')) {
    return tr('errTokenLimit');
  }

  // Never let a raw status or network failure reach a shopper.
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('request failed')) {
    return "The assistant couldn't respond just now — please try again in a moment.";
  }

  try {
    const parsed = JSON.parse(str);
    return parsed.error || parsed.message || str;
  } catch {
    return str;
  }
};

// The kiku key is the shopper's portable, anonymous identity (kiku_<hex>) —
// server-minted, shown exactly once. Entering the same key on any site (or
// giving it to an AI agent) opens the same memory. Lost key = lost memory.
const KIKU_KEY_REVEAL_SECONDS = 15;

// ─── ChatModal Props ───────────────────────────────────────────────────────────

interface ChatModalProps extends Pick<KikuButtonProps, 'title' | 'placeholder' | 'backdropColor' | 'backdropBlur' | 'onSelectSource' | 'defaultCurrency' | 'chips' | 'theme' | 'classNames' | 'enableVoice' | 'voiceLang' | 'enableVision' | 'visionCategoryHint'> {
  theme?: 'light' | 'dark' | AkropolysTheme;
  classNames?: any;
  onClose: () => void;
}

// ─── ChatModal ─────────────────────────────────────────────────────────────────

function parseThinking(text: string): { thinking: string; content: string; isComplete: boolean } {
  const openMatch = text.match(/<\s*thinking\s*>/i);
  if (!openMatch) {
    return { thinking: '', content: text, isComplete: true };
  }

  const openIdx = openMatch.index ?? 0;
  const openTagLength = openMatch[0].length;
  const start = openIdx + openTagLength;
  
  const contentBefore = text.slice(0, openIdx);
  const textAfterOpen = text.slice(start);
  
  const closeMatch = textAfterOpen.match(/<\/\s*thinking\s*>/i);
  if (!closeMatch) {
    return { 
      thinking: textAfterOpen, 
      content: contentBefore, 
      isComplete: false 
    };
  }

  const closeIdx = closeMatch.index ?? 0;
  const closeTagLength = closeMatch[0].length;
  
  return {
    thinking: textAfterOpen.slice(0, closeIdx),
    content: contentBefore + textAfterOpen.slice(closeIdx + closeTagLength),
    isComplete: true
  };
}

function ThinkingBlock({ text, isComplete, seconds: fixedSeconds }: { text: string; isComplete: boolean; seconds?: number }) {
  const tr = useT();
  const startRef = useRef(Date.now());
  const [seconds, setSeconds] = useState<number | null>(() => (isComplete ? null : 0));
  const [isOpen, setIsOpen] = useState(!isComplete);

  // Live-tick while thinking streams; freeze the duration and fold the block
  // away once the answer takes over — the label becomes "Thought for Xs".
  useEffect(() => {
    if (isComplete) {
      if (seconds !== null) {
        setSeconds(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
        setIsOpen(false);
      }
      return;
    }
    setIsOpen(true);
    const t = setInterval(() => {
      setSeconds(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const finalSeconds = fixedSeconds ?? seconds;
  const label = isComplete
    ? (finalSeconds !== null && finalSeconds !== undefined
        ? tr('thoughtForSeconds', { duration: `${finalSeconds}s` })
        : tr('thoughtProcess'))
    : `${tr('thinking')}${seconds ? ` · ${seconds}s` : '…'}`;
  const expandable = !!text;

  return (
    <div className={cn('hsk-cb-think', !isComplete && 'hsk-cb-think--live')}>
      <button
        type="button"
        className={cn('hsk-cb-think-head', !expandable && 'hsk-cb-think-head--static')}
        onClick={expandable ? () => setIsOpen(o => !o) : undefined}
        aria-expanded={expandable ? isOpen : undefined}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={!isComplete ? 'hsk-cb-think-spin' : undefined}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>{label}</span>
        {expandable && <span className={cn('hsk-cb-think-chevron', isOpen && 'hsk-cb-think-chevron--open')}>▶</span>}
      </button>
      {expandable && isOpen && <div className="hsk-cb-think-body">{text}</div>}
    </div>
  );
}

export type EntitySample = {
  title?: string;
  detail?: string;
  price?: string;
  image?: string;
};

// A miniature of the real result card, used only in onboarding so the shopper
// can see the difference rather than read about it.
function EntityPreviewCard({ sample, loading }: { sample?: EntitySample; loading?: boolean }) {
  return (
    <span className="hsk-cb-entlang-preview">
      <span className={cn('hsk-cb-entlang-imgwrap', loading && 'hsk-cb-entlang-skeleton')}>
        {sample?.image ? (
          <img src={sample.image} alt="" className="hsk-cb-entlang-img" />
        ) : (
          <span className="hsk-cb-entlang-img hsk-cb-entlang-img--empty" />
        )}
      </span>
      {loading ? (
        <>
          <span className="hsk-cb-entlang-line hsk-cb-entlang-skeleton" />
          <span className="hsk-cb-entlang-line hsk-cb-entlang-line--short hsk-cb-entlang-skeleton" />
        </>
      ) : (
        <>
          {sample?.title && <span className="hsk-cb-entlang-title">{sample.title}</span>}
          {sample?.detail && <span className="hsk-cb-entlang-detail">{sample.detail}</span>}
          {sample?.price && <span className="hsk-cb-entlang-price">{sample.price}</span>}
        </>
      )}
    </span>
  );
}

function ChatModal({
  title = 'kiku',
  placeholder = 'Ask me anything…',
  backdropColor,
  backdropBlur,
  onClose,
  onSelectSource,
  defaultCurrency = 'KES',
  chips = DEFAULT_CHIPS,
  theme,
  classNames = {},
  enableVoice = false,
  voiceLang,
  enableVision = false,
  visionCategoryHint,
}: ChatModalProps) {
  const client = useAkropolysContext();
  const { messages, sources, loading, streaming, error, lastAction, lastIntent, allowedActions, send, stop, stopped, interrupted, continueGenerating, reset, referencedIds } = useKiku();

  // What the @kiku picker offers to capture. Entity refs are model-emitted and
  // routinely cover only some of the products an answer names — a two-way
  // comparison often refs one side — so a product the shopper just read about
  // silently had no way to be saved. Falling back to matching source names
  // against the answer text needs nothing from the model. The 5-char floor and
  // the leading-words aliases mirror getEntityAliases server-side.
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
  // Capture/history live behind a per-site toggle + plan gate. Before the
  // first reply the resolved set is unknown — offer optimistically then; once
  // known, stop offering actions the server would only reject.
  const captureAllowed = allowedActions === null || allowedActions.includes('capture');
  const [input, setInput] = useState('');
  const [shopperName, setShopperNameState] = useState<string>(() => {
    try { return client.getShopperName?.() ?? ''; } catch { return ''; }
  });
  const [shopperLanguage, setShopperLanguageState] = useState<string>(() => {
    try { return client.getShopperLanguage?.() ?? ''; } catch { return ''; }
  });
  const [entityLangPref, setEntityLangPrefState] = useState<string>(() => {
    try { return client.getEntityLanguageMode?.() ?? ''; } catch { return ''; }
  });
  // Shown once, immediately after the last step is answered.
  const [justCompleted, setJustCompleted] = useState(false);

  // Three-step onboarding: language → name → entity language. Language comes
  // first on purpose. Asking "what should I call you?" before knowing what the
  // shopper speaks assumes they read English, and every later step then has to
  // repaint once the translation lands. With the language settled up front,
  // every surface after step 1 is rendered in it the first time it is drawn.
  const onboarding = messages.length === 0;
  const awaitingLang = onboarding && !shopperLanguage;
  const awaitingName = onboarding && !!shopperLanguage && !shopperName;
  const awaitingEntityLang = onboarding && !!shopperLanguage && !!shopperName && !entityLangPref;
  const inOnboarding = awaitingLang || awaitingName || awaitingEntityLang;

  // Once a language is chosen, everything after that point speaks it — not just
  // AI replies but the widget's own chrome. Cached client-side, so it's one
  // fetch per language and instant on every later visit.
  const [chromeStrings, setChromeStrings] = useState<Record<string, string>>({});
  // Gates every translated surface. Without it the step painted in English and
  // swapped once the fetch landed — a visible flash of the wrong language,
  // which is worse than a beat of nothing.
  const [chromeReady, setChromeReady] = useState(false);

  // Writing direction is resolved server-side from the translated text and
  // cached alongside it, so the panel is laid out correctly on its first paint
  // rather than rendering LTR and flipping. It is deliberately not derived from
  // the language NAME: the shopper may say "Arabic", "farsi" or write it in its
  // own script, and any such list is one more allowlist that goes stale.
  const dirKey = shopperLanguage ? `akropolys_ui_dir_${shopperLanguage.toLowerCase()}` : '';
  const [isRTL, setIsRTL] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !dirKey) return false;
    try { return localStorage.getItem(dirKey) === 'rtl'; } catch { return false; }
  });
  // Resolved server-side from the chosen language; arrives with the dictionary.
  const [speechLang, setSpeechLang] = useState('');

  useEffect(() => {
    if (!shopperLanguage) { setSpeechLang(''); setChromeReady(true); return; }
    let cancelled = false;
    setChromeReady(false);
    (async () => {
      try {
        const res = await client.getUIStrings?.(shopperLanguage, DEFAULT_UI_STRINGS);
        // All or nothing. A partial dictionary renders as translated chrome
        // with a stray English sentence inside it, which reads as a bug to the
        // shopper; consistent English does not.
        if (!cancelled && res?.complete) {
          setChromeStrings(res.strings);
          setIsRTL(res.dir === 'rtl');
          setSpeechLang(res.bcp47 || '');
          try { localStorage.setItem(dirKey, res.dir); } catch { /* ignore */ }
        }
      } catch { /* English defaults are fine */ }
      if (!cancelled) setChromeReady(true);
    })();
    return () => { cancelled = true; };
  }, [shopperLanguage, dirKey, client]);

  // The brand display font covers Latin only, so in another script the glyphs
  // fall back to a system font while the SPACES still come from the brand font
  // — two sets of metrics in one line, which reads as uneven gaps between
  // words. Detected from the text itself rather than a language list, same as
  // direction is.
  const isNonLatin = React.useMemo(() => {
    let latin = 0;
    let other = 0;
    for (const v of Object.values(chromeStrings)) {
      for (const ch of v) {
        const c = ch.codePointAt(0) ?? 0;
        if (c < 0x00c0) continue; // ASCII, digits, punctuation: script-neutral
        if (c <= 0x024f) latin++; // Latin-1 Supplement + Latin Extended-A/B
        else other++;
      }
    }
    return other > latin;
  }, [chromeStrings]);

  // Whether the font the developer passed can actually draw this script. The
  // non-Latin rules used to swap in a system stack unconditionally, which threw
  // away a perfectly good font from, say, a Persian developer who passed one
  // that covers Persian — the host's font is supposed to win wherever it can.
  // Measured, not asked: render the sample in `family, <absent family>` and in
  // the absent family alone. Equal widths mean the family contributed nothing
  // and the browser fell through both to the same default. Spaces are stripped
  // because a Latin-only font supplies those and would mask a total gap.
  // A webfont is not measurable until it has loaded, so a first pass would
  // always report a gap and latch the fallback in. Re-measure when fonts settle.
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? (document as any).fonts : null;
    if (!fonts) return;
    const bump = () => setFontEpoch(e => e + 1);
    fonts.ready?.then(bump).catch(() => {});
    fonts.addEventListener?.('loadingdone', bump);
    return () => fonts.removeEventListener?.('loadingdone', bump);
  }, []);

  const hostFontCovers = React.useMemo(() => {
    void fontEpoch;
    if (!isNonLatin) return true;
    const declared = typeof theme === 'object' && theme ? theme.fontFamily : undefined;
    if (!declared || typeof document === 'undefined') return false;
    const family = declared.split(',')[0].trim();
    if (!family) return false;
    let sample = '';
    for (const v of Object.values(chromeStrings)) {
      for (const ch of v) {
        if ((ch.codePointAt(0) ?? 0) > 0x024f) sample += ch;
        if (sample.length >= 24) break;
      }
      if (sample.length >= 24) break;
    }
    if (!sample) return false;
    try {
      const cx = document.createElement('canvas').getContext('2d');
      if (!cx) return false;
      const absent = '"__hsk_no_such_family__"';
      // Assigning an unparseable value to cx.font is a silent no-op that leaves
      // the previous font in place, which would compare two different fonts and
      // wrongly report coverage. cx.font echoes back what was *asked for*, so
      // confirm the family survived the round trip before trusting a width.
      const width = (ff: string): number | null => {
        cx.font = `32px ${ff}`;
        const asked = ff.split(',')[0].trim().replace(/["']/g, '').toLowerCase();
        if (!cx.font.replace(/["']/g, '').toLowerCase().includes(asked)) return null;
        return cx.measureText(sample).width;
      };
      const a = width(`${family}, ${absent}`);
      const b = width(absent);
      if (a === null || b === null) return false;
      return Math.abs(a - b) > 0.5;
    } catch { return false; }
  }, [isNonLatin, theme, chromeStrings, fontEpoch]);

  const t = useCallback((key: keyof typeof DEFAULT_UI_STRINGS, vars?: Record<string, string>) => {
    let s = chromeStrings[key] || DEFAULT_UI_STRINGS[key];
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    }
    return s;
  }, [chromeStrings]);

  // Same as t(), but returns nodes with each substituted value wrapped in
  // <bdi>. A Latin language name inside RTL copy would otherwise get reordered
  // by the bidi algorithm — "In Arabic" rendering as "Arabic باللغة".
  const tNode = useCallback((key: keyof typeof DEFAULT_UI_STRINGS, vars: Record<string, string>) => {
    const s = chromeStrings[key] || DEFAULT_UI_STRINGS[key];
    return s.split(/(\{[a-zA-Z]+\})/g).map((part, i) => {
      const m = part.match(/^\{([a-zA-Z]+)\}$/);
      if (m && vars[m[1]] !== undefined) return <bdi key={i}>{vars[m[1]]}</bdi>;
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  }, [chromeStrings]);

  // A real entity from this site, shown side by side as written and translated,
  // so the choice is concrete rather than described. Null until it loads — the
  // cards fall back to a neutral placeholder so the step never blocks.
  const [entityPreview, setEntityPreview] = useState<{
    original?: EntitySample;
    translated?: EntitySample;
  } | null>(null);

  // Fires on language choice, not on reaching step 3 — the translation round
  // trip is the slow part, so starting it only once the step renders guaranteed
  // empty cards on arrival.
  useEffect(() => {
    if (!shopperLanguage || entityPreview) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await client.getEntityPreview?.(shopperLanguage);
        if (!cancelled && p) setEntityPreview(p);
      } catch { /* placeholder cards are fine */ }
    })();
    return () => { cancelled = true; };
  }, [shopperLanguage, entityPreview, client]);

  const chooseLanguage = (lang: string) => {
    const v = lang.trim();
    if (!v) return;
    try { client.setShopperLanguage?.(v); } catch { /* ignore */ }
    setShopperLanguageState(v);
  };

  const chooseEntityLang = (mode: 'original' | 'translated') => {
    try { client.setEntityLanguageMode?.(mode); } catch { /* ignore */ }
    setEntityLangPrefState(mode);
    setJustCompleted(true);
  };

  // ── Image attachments ────────────────────────────────────────────────────────
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          setAttachments(prev => [...prev, { type: 'image', data: dataUrl }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Voice mode (Web Speech API) ──────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [voiceError, setVoiceError] = useState<string>('');
  const recognitionRef = useRef<any>(null);
  const pendingVoiceRef = useRef<string | null>(null); // transcript queued for auto-send
  const heardRef = useRef(false); // any audio recognised this session

  // Advice, not state: it retires itself rather than sitting under the bar.
  useEffect(() => {
    if (!voiceError) return;
    const timer = setTimeout(() => setVoiceError(''), 5000);
    return () => clearTimeout(timer);
  }, [voiceError]);
  // Resolved after mount, never during render: the server has no window, so
  // deciding at render time makes SSR and hydration disagree about the button.
  const [hasSpeechAPI, setHasSpeechAPI] = useState(false);
  useEffect(() => {
    setHasSpeechAPI('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }, []);

  const startVoice = useCallback(() => {
    if (!hasSpeechAPI || voiceState !== 'idle') return;
    setVoiceError('');
    heardRef.current = false;
    if (!isSecureOrigin()) {
      setVoiceError('micInsecure');
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    // Transcribe in the language being SPOKEN: developer override → the language
    // chosen in onboarding → page <html lang> → browser language → English.
    recognition.lang = voiceLang || speechLang || document.documentElement.lang || navigator.language || 'en-US';
    // Stream partial results so the user SEES words appear as they speak —
    // without this there's no feedback that anything was captured until the end.
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setVoiceState('listening');
    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const seg = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += seg;
        else interimText += seg;
      }
      // Live feedback: show the (final + in-progress) text in the input box.
      const live = (finalText + ' ' + interimText).trim();
      if (live) { heardRef.current = true; setInput(live); }
      // Only auto-send once we have a finalized transcript.
      if (finalText.trim()) {
        pendingVoiceRef.current = finalText.trim();
        setVoiceState('processing');
      }
    };
    recognition.onerror = (event: any) => {
      // Every failure looked identical before this: the button blinked and
      // nothing happened, with no way to tell a denied mic from a silent one.
      const code = event?.error || '';
      if (code !== 'no-speech' && code !== 'aborted') {
        setVoiceError(
          code === 'not-allowed' || code === 'service-not-allowed'
            ? (isSecureOrigin() ? 'micDenied' : 'micInsecure')
            : code === 'audio-capture' ? 'micMissing'
            : code === 'language-not-supported' ? 'micLangUnsupported'
            : code === 'network' ? 'micNetwork'
            : 'micFailed'
        );
      }
      setVoiceState('idle');
    };
    recognition.onend = () => {
      // A session that captured nothing used to end in silence — the mic just
      // went dark, which reads as "voice is broken" rather than "say it again".
      if (!heardRef.current && !pendingVoiceRef.current) {
        setVoiceError(prev => prev || 'micNoSpeech');
      }
      // Only reset if we didn't already move to processing
      setVoiceState(prev => prev === 'listening' ? 'idle' : prev);
    };
    // start() throws InvalidStateError if a previous run is still winding down.
    try {
      recognition.start();
    } catch {
      setVoiceError('micFailed');
      setVoiceState('idle');
    }
  }, [hasSpeechAPI, voiceState, voiceLang, speechLang]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    // Tapping stop as the final result lands must not discard it: 'processing'
    // is what drives the auto-send, and clobbering it drops the transcript.
    setVoiceState(prev => (prev === 'processing' ? prev : 'idle'));
  }, []);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  // No vertical pre-determination: chips and placeholder are whatever the
  // integrator passed (blank by default). One widget can't guess what a given
  // site sells, so it never assumes.
  const activeChips = chips;
  const activeTitle = title;
  // Step 1 has no language to translate into yet. Past that point, only
  // substitute the translated default when the caller left `placeholder` at
  // its own default — an integrator's custom placeholder is their content,
  // left as-is rather than silently overridden.
  const activePlaceholder = awaitingLang
    ? 'Type preferred language…'
    : awaitingName
      ? t('namePlaceholder')
      : awaitingEntityLang
        ? t('entityLangPlaceholder')
        : shopperLanguage && placeholder === 'Ask me anything…'
          ? t('defaultPlaceholder')
          : placeholder;


  const [selectedProduct, setSelectedProduct] = useState<ChatSource | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [markupSrc, setMarkupSrc] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);



  const [keyInput, setKeyInput] = useState('');
  const [keyPhase, setKeyPhase] = useState<'idle' | 'prompt_key'>('idle');
  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [mintedPub, setMintedPub] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copyValue = (value: string, which: string) => {
    try { navigator.clipboard?.writeText(value); } catch { /* ignore */ }
    setCopied(which);
    setTimeout(() => setCopied(c => (c === which ? null : c)), 1600);
  };
  const [keyCountdown, setKeyCountdown] = useState(KIKU_KEY_REVEAL_SECONDS);
  const [minting, setMinting] = useState(false);
  const [showKikuPicker, setShowKikuPicker] = useState(false);
  const [showAtPicker, setShowAtPicker] = useState(false);

  // React to lastAction from chat
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.type === 'request_kiku_key') {
      setKeyPhase('prompt_key');
    }
  }, [lastAction]);

  // Show-once countdown: the minted key is visible for a fixed window, then
  // gone for good — it stays active on this device, but is never shown again.
  useEffect(() => {
    if (!mintedKey) return;
    setKeyCountdown(KIKU_KEY_REVEAL_SECONDS);
    const t = setInterval(() => {
      setKeyCountdown(s => {
        if (s <= 1) {
          clearInterval(t);
          setMintedKey(null);
          setMintedPub(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [mintedKey]);

  const { themeAttr: hskThemeAttr, vars: customStyles } = resolveTheme(theme);
  useHostFontFace(theme);

  // Retry the interrupted request (e.g. the capture) under the new identity.
  // Goes through handleSend so an "@kiku …" prefix is re-parsed back into a
  // forced intent instead of being sent as literal query text.
  const retryLastMessage = async () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) await handleSend(lastUserMsg.content);
  };

  // Returning shopper: paste an existing public id.
  const handleUseExistingKey = async () => {
    const pub = keyInput.trim();
    if (!pub) return;
    client.setKikuPub(pub);
    setKeyInput('');
    setKeyPhase('idle');
    await retryLastMessage();
  };

  // New shopper: mint server-side. The secret is revealed once; the public id
  // is stored for saving across sites.
  const handleCreateKey = async () => {
    if (minting) return;
    setMinting(true);
    try {
      const { secret, publicId } = await client.mintKikuKey();
      setMintedKey(secret);
      setMintedPub(publicId);
      setKeyPhase('idle');
      await retryLastMessage();
    } catch {
      // mint failed — keep the prompt open so the shopper can try again
    } finally {
      setMinting(false);
    }
  };

  // Auto-scroll. A freshly sent user message is pinned to the top of the
  // view (like Claude) so the question and the start of the answer are both
  // visible without scrolling. While a response streams in, we only follow it
  // to the bottom if the user is already pinned there — this lets them freely
  // scroll up to re-read earlier messages.
  const msgsContainerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Drag the sheet down to dismiss, tracking the finger and carrying release
  // velocity into the spring. Touch only — a mouse has no equivalent gesture.
  useDragToDismiss({
    panel: useCallback(() => panelRef.current, []),
    scroller: useCallback(() => msgsContainerRef.current, []),
    onDismiss: onClose,
  });
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Lets a programmatic scroll re-seed the wheel interpolator below, so the
  // next wheel tick doesn't yank the list back to a stale target.
  const resyncScrollRef = useRef<() => void>(() => {});
  // Set by the momentum scroller; lets streaming glide to the bottom on the
  // same easing curve as the wheel instead of snapping there each token.
  const glideScrollRef = useRef<((to: number) => void) | null>(null);

  // On iOS a programmatic scrollTop write kills in-flight momentum dead, so a
  // flick during streaming stops short. Track the gesture — including the
  // momentum that outlives touchend — and leave the list alone until it rests.
  const touchScrollingRef = useRef(false);
  useEffect(() => {
    const el = msgsContainerRef.current;
    if (!el) return;
    let idle: ReturnType<typeof setTimeout>;
    const settle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => { touchScrollingRef.current = false; }, 150);
    };
    const onTouchStart = () => { clearTimeout(idle); touchScrollingRef.current = true; };
    const onScroll = () => { if (touchScrollingRef.current) settle(); };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', settle, { passive: true });
    el.addEventListener('touchcancel', settle, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(idle);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', settle);
      el.removeEventListener('touchcancel', settle);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const container = msgsContainerRef.current;
    if (!container) return;
    const lastMsg = messages[messages.length - 1];
    // Deferred to the next frame: reading scrollHeight straight out of render
    // forces a synchronous layout on every streamed token.
    const raf = requestAnimationFrame(() => {
      const before = container.scrollTop;
      if (lastMsg?.role === 'user') {
        const el = messageRefs.current[messages.length - 1];
        if (el) container.scrollTop = el.offsetTop - container.offsetTop;
      } else {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 120 && !touchScrollingRef.current) {
          const bottom = container.scrollHeight - container.clientHeight;
          // Glide when we can — a hard write per token is what made following
          // the stream feel like a series of jerks rather than one motion.
          if (glideScrollRef.current) { glideScrollRef.current(bottom); return; }
          container.scrollTop = container.scrollHeight;
        }
      }
      // Only re-seed if we actually moved it — an unconditional resync would
      // cancel an in-flight wheel animation on every streamed token.
      if (container.scrollTop !== before) resyncScrollRef.current();
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, loading, selectedProduct]);

  // ── Lenis-style Smooth Momentum Wheel Scroll ─────────────────────────────────
  useEffect(() => {
    const el = msgsContainerRef.current;
    if (!el) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const LAMBDA = 12; // exponential damping rate — higher is snappier
    const LINE_PX = 16;

    // Writes land on the device-pixel grid. Without this the tail of the easing
    // curve writes sub-pixel deltas that round to alternating pixels — visible
    // as a shimmer while the scroll settles.
    const step = 1 / (window.devicePixelRatio || 1);
    const snap = (v: number) => Math.round(v / step) * step;

    let target = el.scrollTop;
    let current = el.scrollTop;
    let written = el.scrollTop;
    let lastTime = 0;
    let rafId: number | null = null;

    const write = (v: number) => {
      if (v === written) return;
      written = v;
      el.scrollTop = v;
    };

    const resync = () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      el.classList.remove('hsk-scrolling');
      target = current = written = el.scrollTop;
    };
    resyncScrollRef.current = resync;

    // Same damped curve the wheel uses, so streaming and manual scrolling are
    // indistinguishable in feel and never fight each other for scrollTop.
    glideScrollRef.current = (to: number) => {
      if (Math.abs(el.scrollTop - written) > 1) { target = current = written = el.scrollTop; }
      const next = Math.round(Math.max(0, Math.min(el.scrollHeight - el.clientHeight, to)));
      if (next === target) return;
      target = next;
      if (rafId === null) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(update);
      }
    };

    // Frame-rate independent easing, so 60Hz and 120Hz displays feel identical.
    const update = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      current += (target - current) * (1 - Math.exp(-LAMBDA * dt));
      // Settle once the remainder can no longer move a whole device pixel.
      if (Math.abs(target - current) < step) {
        current = target;
        write(Math.round(target));
        el.classList.remove('hsk-scrolling');
        rafId = null;
        return;
      }
      write(snap(current));
      rafId = requestAnimationFrame(update);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;

      // Scrollbar drags, keyboard and touch move the list behind our back —
      // re-seed from reality before applying the delta, or we snap backwards.
      if (Math.abs(el.scrollTop - written) > 1) target = current = written = el.scrollTop;

      const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? el.clientHeight : 1;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const next = Math.round(Math.max(0, Math.min(maxScroll, target + e.deltaY * scale)));

      // At either end, let the event through instead of swallowing it.
      if (next === target) return;
      e.preventDefault();
      target = next;

      if (rafId === null) {
        lastTime = performance.now();
        el.classList.add('hsk-scrolling');
        rafId = requestAnimationFrame(update);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
      el.classList.remove('hsk-scrolling');
      resyncScrollRef.current = () => {};
      glideScrollRef.current = null;
    };
  }, []);

  // Lock the host page's own scroll while the panel is open, so only the
  // widget's internal message list scrolls — otherwise both scrollbars show.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // 100dvh does not shrink when the on-screen keyboard opens, so the panel stays
  // taller than what's visible — the input lands under the keyboard and the top
  // bar is pushed off-screen. visualViewport is the only thing that sees the
  // keyboard, so drive the height from it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--hsk-vvh', `${vv.height}px`);
      // The visual viewport can be scrolled within the layout viewport; offsetTop
      // is how far down it sits, and the fixed panel has to follow it.
      root.style.setProperty('--hsk-vvtop', `${vv.offsetTop}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--hsk-vvh');
      root.style.removeProperty('--hsk-vvtop');
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
  }, [reset]);

  const handleSourceClick = (src: ChatSource) => {
    setSelectedProduct(src);
    onSelectSource?.(src);
    // If the assistant just asked a question ("Which sofa would you like…?"),
    // clicking a card answers it with that product instead of pivoting to specs.
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant && lastAssistant.content.trim().endsWith('?')) {
      send(t('cardClickAnswer', { name: src.name }));
      return;
    }
    const price = src.price ? ` (${src.currency ?? defaultCurrency} ${src.price})` : '';
    send(t('cardClickQuery', { name: src.name, price }));
  };

  const handleSend = async (text?: string, extraAttachments?: ChatAttachment[], forcedIntent?: string, captureTargets?: CaptureTarget[]) => {
    const raw = (text ?? input).trim();
    if (!raw || loading) return;

    // Onboarding: the first thing typed is treated as the shopper's name when it
    // reads like one; we store it and greet them, with no backend call. If it
    // reads like a query, we skip the name step and search normally.
    // Onboarding steps consume the input rather than sending it — the flow must
    // complete before the first query, so nothing here falls through to search.
    if (awaitingName) {
      const name = extractName(raw) || raw.slice(0, 40);
      try { client.setShopperName?.(name); } catch { /* ignore */ }
      setShopperNameState(name);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    if (awaitingLang) {
      chooseLanguage(raw);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    if (awaitingEntityLang) {
      // Typed input can't express this choice — it's a two-card pick.
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    const kiku = parseAtKiku(raw);
    const q = kiku ? kiku.cleanQuery : raw;
    const resolvedForcedIntent = forcedIntent ?? kiku?.intent;

    setSelectedProduct(null);
    setShowKikuPicker(false);
    setShowAtPicker(false);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    const toSend = extraAttachments ?? attachments;
    setAttachments([]);
    await send(q, raw /* displayQuery */, toSend.length > 0 ? toSend : undefined, resolvedForcedIntent, captureTargets);
  };

  const handleSelectExtension = (ext: string) => {
    setInput(ext + ' ');
    setShowAtPicker(false);
    setShowKikuPicker(true);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Convenience wrappers for @kiku picker actions
  const handleKikuCapture = useCallback((product: ChatSource) => {
    const name = product.name || '';
    const display = `@kiku ${t('displayCapture', { name }).trim()}`;
    const q = name || 'capture current page';
    setInput('');
    setSelectedProduct(null);
    const toSend = attachments;
    setAttachments([]);
    send(q, display, toSend.length > 0 ? toSend : undefined, 'capture');
  }, [attachments, send, t]);

  const handleKikuCaptureAll = useCallback((products: ChatSource[]) => {
    const targets: CaptureTarget[] = products
      .filter(p => p.id)
      .map(p => ({
        name: p.name || '',
        url: (p as any).url || '',
        image: p.image || '',
        price: p.price ? String(p.price) : '',
        currency: p.currency || defaultCurrency,
      }));
    const names = products.map(p => p.name).filter(Boolean).join(', ');
    const display = `@kiku ${t('displayCaptureAll', { count: String(products.length) })}`;
    setInput('');
    setSelectedProduct(null);
    setAttachments([]);
    send(names || 'capture all', display, undefined, 'capture_all', targets);
  }, [defaultCurrency, send, t]);

  const handleKikuViewHistory = useCallback(() => {
    const display = `@kiku ${t('displayViewHistory')}`;
    setInput('');
    setSelectedProduct(null);
    setAttachments([]);
    send('show my saved items', display, undefined, 'view_history');
  }, [send, t]);

  const handleKikuDelete = useCallback(() => {
    const display = `@kiku ${t('displayDelete')}`;
    setInput('');
    setSelectedProduct(null);
    setAttachments([]);
    send('delete this', display, undefined, 'delete');
  }, [send, t]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && showKikuPicker) { e.preventDefault(); setShowKikuPicker(false); return; }
    if (e.key === 'Escape' && showAtPicker) { e.preventDefault(); setShowAtPicker(false); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (voiceError) setVoiceError('');
    const trimmed = val.trim();
    // Show @ picker when input is exactly '@'
    setShowAtPicker(trimmed === '@');
    // Show the @kiku picker only while the mention is bare — once the shopper
    // types a query past it, they've chosen to write instead of pick, so it hides.
    setShowKikuPicker(/^@kiku\s*$/i.test(trimmed));
    const t = e.target;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  };

  // Auto-send voice transcript once processing state is reached
  useEffect(() => {
    if (voiceState !== 'processing') return;
    const transcript = pendingVoiceRef.current;
    if (!transcript) { setVoiceState('idle'); return; }
    pendingVoiceRef.current = null;
    // Brief delay so user sees the transcript fill in before it fires
    const timer = setTimeout(() => {
      setVoiceState('idle');
      handleSend(transcript);
    }, 400);
    return () => clearTimeout(timer);
  }, [voiceState]);


  const blurVal = typeof backdropBlur === 'number' ? `${backdropBlur}px` : (backdropBlur ?? '20px');

  const displayMessages = messages;

  return (
    <UIStringsContext.Provider value={t}>
    <div
      ref={overlayRef}
      className={cn("hsk-cb-overlay", classNames.overlay)}
      onClick={onClose}
      data-hsk-theme={hskThemeAttr}
      style={{
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`,
        ...(backdropColor ? { background: backdropColor } : {}),
        ...customStyles,
      }}
    >
      <div
        ref={panelRef}
        className={cn("hsk-cb-panel", classNames.panel)}
        dir={isRTL ? 'rtl' : 'ltr'}
        data-script={isNonLatin ? 'nonlatin' : 'latin'}
        data-host-font={hostFontCovers ? 'covers' : 'gap'}
        onClick={e => {
          e.stopPropagation();
          const target = e.target as HTMLElement;
          if (target.tagName === 'IMG' && (target.classList.contains('hsk-markdown-img') || target.classList.contains('hsk-cb-user-img-thumb'))) {
            const src = (target as HTMLImageElement).src;
            if (src) setLightboxSrc(src);
          }
        }}
      >
        {lightboxSrc && (
          <div className="hsk-lightbox" onClick={() => setLightboxSrc(null)}>
            <button className="hsk-lightbox-close" onClick={() => setLightboxSrc(null)} aria-label="Close image">
              <CloseIcon />
            </button>
            <img src={lightboxSrc} alt="" className="hsk-lightbox-img" onClick={e => e.stopPropagation()} />
          </div>
        )}

        {markupSrc && (
          <div className="hsk-markup-overlay">
            <MarkupEditor
              src={markupSrc}
              onCancel={() => setMarkupSrc(null)}
              onSend={(dataUrl, instruction) => {
                setMarkupSrc(null);
                handleSend(
                  instruction || 'Apply the change indicated by the markings on the image.',
                  [{ type: 'image', data: dataUrl, annotated: true }],
                );
              }}
            />
          </div>
        )}

        {/* ── Main Chat Area ── */}
        <div className="hsk-cb-main" ref={mainRef}>

          {/* Top bar */}
          <div className="hsk-cb-topbar">
            <div className="hsk-cb-topbar-left">
              <span className="hsk-cb-topbar-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <SparkleIcon />
              </span>
              <div>
                <div className="hsk-cb-topbar-title">{activeTitle}</div>
              </div>
            </div>
            <div className="hsk-cb-topbar-actions">
              {messages.length > 0 && (
                <button className="hsk-cb-topbar-btn" onClick={handleReset}>{t('clearChat')}</button>
              )}
              <button className="hsk-cb-close" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="hsk-cb-msgs" ref={msgsContainerRef}>
            {displayMessages.length === 0 ? (
              <div className="hsk-cb-empty">
                {awaitingLang ? (
                  <div className="hsk-cb-hello-wrap">
                    <span className="hsk-cb-step" dir="ltr">1 / 3</span>
                    <h2 className="hsk-cb-hello">Hi, I'm <b>kiku</b>.</h2>
                    <p className="hsk-cb-hello-ask">Which language should I speak?</p>
                    {/* Each option is written in its own script, not in English:
                        this is the one screen a shopper reaches before we know
                        what they read, so it has to be recognisable without
                        understanding the sentence above it. */}
                    <div className="hsk-cb-lang-chips">
                      {LANGUAGE_CHOICES.map(l => (
                        <button
                          key={l.value}
                          type="button"
                          className="hsk-cb-lang-chip"
                          lang={l.tag}
                          dir={l.rtl ? 'rtl' : 'ltr'}
                          onClick={() => chooseLanguage(l.value)}
                        >
                          {l.native}
                        </button>
                      ))}
                    </div>
                    <p className="hsk-cb-hello-hint">Or type any other language.</p>
                  </div>
                ) : awaitingName ? (
                  <div className="hsk-cb-hello-wrap">
                    <span className="hsk-cb-step" dir="ltr">2 / 3</span>
                    {chromeReady ? (
                      <>
                        <h2 className="hsk-cb-hello">{t('nameStepTitle')}</h2>
                        <p className="hsk-cb-hello-lead">{t('nameStepLead')}</p>
                        <p className="hsk-cb-hello-ask">{t('nameStepAsk')}</p>
                      </>
                    ) : (
                      <ChromeLoading />
                    )}
                  </div>
                ) : awaitingEntityLang ? (
                  <div className="hsk-cb-hello-wrap">
                    <span className="hsk-cb-step" dir="ltr">3 / 3</span>
                    {chromeReady && (
                      <>
                        <h2 className="hsk-cb-hello">{t('howShouldResultsLook')}</h2>
                        <p className="hsk-cb-hello-lead">
                          {tNode('entityLangIntro', { lang: shopperLanguage })}
                        </p>
                      </>
                    )}
                    <div className="hsk-cb-entlang-cards">
                      <button
                        type="button"
                        className="hsk-cb-entlang-card"
                        onClick={() => chooseEntityLang('original')}
                        disabled={!entityPreview}
                      >
                        {chromeReady && <span className="hsk-cb-entlang-tag">{t('asWritten')}</span>}
                        <EntityPreviewCard sample={entityPreview?.original} loading={!entityPreview} />
                        {chromeReady && <span className="hsk-cb-entlang-note">{t('namesAsWritten')}</span>}
                      </button>
                      <button
                        type="button"
                        className="hsk-cb-entlang-card"
                        onClick={() => chooseEntityLang('translated')}
                        disabled={!entityPreview}
                      >
                        {chromeReady && (
                          <span className="hsk-cb-entlang-tag">{tNode('inLanguage', { lang: shopperLanguage })}</span>
                        )}
                        <EntityPreviewCard sample={entityPreview?.translated} loading={!entityPreview} />
                        {chromeReady && <span className="hsk-cb-entlang-note">{t('detailsTranslated')}</span>}
                      </button>
                    </div>
                  </div>
                ) : justCompleted ? (
                  <div className="hsk-cb-hello-wrap">
                    {chromeReady && (
                      <>
                        <h2 className="hsk-cb-hello">{tNode('allSet', { name: shopperName })}</h2>
                        <p className="hsk-cb-hello-lead">
                          {entityLangPref === 'translated'
                            ? tNode('replyingTranslated', { lang: shopperLanguage })
                            : tNode('replyingOriginal', { lang: shopperLanguage })}
                        </p>
                      </>
                    )}
                  </div>
                ) : shopperName ? (
                  <>
                    <h2 className="hsk-cb-hello">{tNode('greetReturning', { name: shopperName })}</h2>
                    <p className="hsk-cb-hello-lead">{t('greetReturningLead')}</p>
                  </>
                ) : (
                  <>
                    <h2 className="hsk-cb-hello">Hi, I'm <b>kiku</b>.</h2>
                    <p className="hsk-cb-hello-lead">Ask me to search, visualize, or capture anything — I look across the whole site in real time.</p>
                  </>
                )}
                {!inOnboarding && activeChips.length > 0 && (
                  <div className="hsk-cb-chips">
                    {activeChips.map(chip => (
                      <button
                        key={chip}
                        className="hsk-cb-chip"
                        onClick={() => handleSend(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              displayMessages.map((msg: ChatMessage, idx: number) => {
                const isLast = idx === displayMessages.length - 1;
                const isLastUser = msg.role === 'user' && !displayMessages.slice(idx + 1).some(m => m.role === 'user');
                const isUser = msg.role === 'user';
                // iMessage grouping: only the last bubble in a consecutive same-sender run gets a tail.
                const isRunEnd = isUser && displayMessages[idx + 1]?.role !== 'user';
                // The matrix can only stand in for the LLM's table when BOTH compared
                // products came from this turn's retrieval; a follow-up compare against
                // an item from memory must keep the markdown table.
                const compareSources = discussedSources;
                const showMatrix = isLast && lastIntent === 'compare' && compareSources.length >= 2;
                const displayContent =
                  !isUser && showMatrix ? stripMarkdownTables(msg.content) : msg.content;
                return (
                  <div key={idx} className="hsk-cb-msg-group" ref={(el) => { messageRefs.current[idx] = el; }}>
                    {isUser ? (
                      <div className={`hsk-cb-user-msg${isLastUser ? ' hsk-sent' : ''}`}>
                        {/* Image thumbnails in user bubble */}
                        {msg.images && msg.images.length > 0 && (
                          <div
                            className="hsk-cb-user-imgs"
                            data-count={Math.min(msg.images.length, 4)}
                          >
                            {msg.images.slice(0, 4).map((img, i) => (
                              <button
                                key={i}
                                type="button"
                                className="hsk-cb-user-img-cell"
                                onClick={() => setLightboxSrc(img)}
                              >
                                <img src={img} alt={`attachment ${i + 1}`} className="hsk-cb-user-img-thumb" />
                                {i === 3 && msg.images!.length > 4 && (
                                  <span className="hsk-cb-user-img-more">+{msg.images!.length - 3}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        {msg.content && (
                          <div className={`hsk-cb-user-bubble${isRunEnd ? '' : ' hsk-cb-user-bubble--grouped'}`}>
                            {/^@kiku\b/i.test(msg.content) ? (
                              <>
                                <span className="hsk-kiku-badge">@kiku</span>
                                {msg.content.replace(/^@kiku\s*/i, '')}
                              </>
                            ) : msg.content}
                          </div>
                        )}
                        {/* Confirms the message actually left, which matters
                            most when the reply is paused or stopped and the
                            panel would otherwise look inert. */}
                        {isLastUser && (
                          <span className="hsk-cb-sent-status">
                            {stopped || interrupted ? t('statusStopped') : t('statusSent')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="hsk-cb-ai-msg">
                        <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                          {isLast && (loading || streaming) ? (
                            <div className="hsk-cb-thinking-icon">
                              <svg className="hsk-brand-mark" viewBox="0 0 100 100" aria-hidden="true">
                                <path d="M39.4 10.4 Q44 0 48.6 10.4 L86.1 95.8 Q88 100 83.4 100 L4.6 100 Q0 100 1.9 95.8 Z M24 100 L24 65 Q24 60 27.4 56.3 Q44 38 60.6 56.3 Q64 60 64 65 L64 100 Z" transform="translate(22.7 19) scale(0.62)" fillRule="evenodd" />
                              </svg>
                              <svg className="hsk-brand-mark hsk-brand-mark--sheen" viewBox="0 0 100 100" aria-hidden="true">
                                <path d="M39.4 10.4 Q44 0 48.6 10.4 L86.1 95.8 Q88 100 83.4 100 L4.6 100 Q0 100 1.9 95.8 Z M24 100 L24 65 Q24 60 27.4 56.3 Q44 38 60.6 56.3 Q64 60 64 65 L64 100 Z" transform="translate(22.7 19) scale(0.62)" fillRule="evenodd" />
                              </svg>
                              <span className="hsk-arch-glow"><span className="hsk-arch-noise" /></span>
                              <span className="hsk-handle-orbit">
                                <span className="hsk-handle-ring">
                                  <span className="hsk-handle-ball" />
                                  <span className="hsk-handle-ball" />
                                  <span className="hsk-handle-ball" />
                                  <span className="hsk-handle-ball" />
                                  <span className="hsk-handle-ball" />
                                </span>
                              </span>
                              <span className="hsk-handle-rest" />
                            </div>
                          ) : (
                            <SparkleIcon />
                          )}
                        </div>
                        <div className="hsk-cb-ai-body">
                          {(() => {
                            // Structured thinking (SSE event) is primary; parseThinking stays as a
                            // net for legacy inline tags in restored histories.
                            const parsed = parseThinking(displayContent);
                            const thinking = msg.thinking || parsed.thinking;
                            let content = parsed.content;
                            const isComplete = msg.thoughtForSeconds != null || content.length > 0 || !(isLast && (streaming || loading));
                            return (
                              <>
                                {(thinking || msg.thoughtForSeconds != null || (isLast && (streaming || loading))) && (
                                  <ThinkingBlock text={thinking} isComplete={isComplete} seconds={msg.thoughtForSeconds} />
                                )}
                                {content && (
                                  <div className="hsk-cb-ai-content">
                                    <MarkdownBlock content={content} streaming={isLast && streaming} />
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          {msg.visualizing && (
                            <div className="hsk-cb-viz hsk-cb-viz--loading">
                              <span className="hsk-cb-viz-spinner" />
                              <span>{msg.visualizingText || 'Visualizing…'}</span>
                            </div>
                          )}
                          {msg.visualization && (
                            <div className="hsk-cb-viz">
                              <div className="hsk-cb-viz-imgwrap">
                                {msg.visualizationType === 'video' || msg.visualization.includes('/videos/') ? (
                                  <video
                                    src={msg.visualization}
                                    controls
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    className="hsk-markdown-video"
                                    style={{ display: 'block', maxHeight: '400px', objectFit: 'contain', width: '100%' }}
                                  />
                                ) : (
                                  <img
                                    src={msg.visualization}
                                    alt="Product visualized in your photo"
                                    className="hsk-markdown-img"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                )}
                                {isLast && !streaming && (msg.visualizationType !== 'video' && !msg.visualization.includes('/videos/')) && (
                                  <button className="hsk-cb-viz-mark" onClick={() => setMarkupSrc(msg.visualization!)}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                    </svg>
                                    Mark &amp; edit
                                  </button>
                                )}
                              </div>
                              <div className="hsk-cb-viz-disclaimer">
                                {msg.visualizationType === 'video' || msg.visualization.includes('/videos/') ?
                                  "AI-generated video makeover — colors, size and movement may differ from the real product." :
                                  "AI-generated preview — colours, size and placement may differ from the real product."
                                }
                              </div>
                            </div>
                          )}

                          {/* Owner-authored reference images (directed knowledge) — structured, never model-pasted */}
                          {!isUser && (msg.knowledgeImages?.length ?? 0) > 0 && (
                            <div className="hsk-cb-kimgs">
                              {msg.knowledgeImages!.map((ref) => (
                                <div key={ref.entryId} className="hsk-cb-kimg-group">
                                  <div className="hsk-cb-kimg-grid">
                                    {ref.images.map((img, i) => (
                                      <img
                                        key={i}
                                        src={img.url}
                                        alt={img.note || ref.title || 'Reference image'}
                                        className="hsk-cb-kimg"
                                        loading="lazy"
                                        onClick={() => setLightboxSrc(img.url)}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    ))}
                                  </div>
                                  {(ref.title || ref.images[0]?.note) && (
                                    <div className="hsk-cb-kimg-caption">{ref.title || ref.images[0]?.note}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Comparison matrix — replaces the markdown table when comparing products */}
                          {showMatrix && (
                            <ComparisonMatrix sources={compareSources} defaultCurrency={defaultCurrency} />
                          )}

                          {(() => {
                            const msgReferencedIds = isLast ? referencedIds : (msg.referencedIds ?? []);
                            const msgSources = isLast ? sources : (msg.sources ?? []);
                            // Gate on this message's own intent — the live lastAction hid every earlier carousel.
                            const msgIntent = isLast ? lastIntent : msg.intent;
                            const hiddenIntent = msgIntent === 'compare' || msgIntent === 'capture' ||
                              msgIntent === 'capture_all' || msgIntent === 'delete' || msgIntent === 'view_history';
                            const showCarousel = msgReferencedIds.length > 0 && !hiddenIntent &&
                              (!isLast || lastAction?.type !== 'request_kiku_key');
                            return showCarousel && (
                              <SourcesCarousel
                                sources={msgSources}
                                defaultCurrency={defaultCurrency}
                                onSelectSource={handleSourceClick}
                                onImageClick={setLightboxSrc}
                                referencedIds={msgReferencedIds}
                                compact={!!msg.visualization}
                              />
                            );
                          })()}

                          {/* Single memory pill button for open_memory actions (aligned with text) */}
                          {isLast && !loading && !streaming && lastAction?.type === 'open_memory' && lastAction.url && (
                            <a
                              className="hsk-cb-memory-pill"
                              href={String(lastAction.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open my memory on mimi
                              <ExternalIcon />
                            </a>
                          )}

                          {/* Registered action link — the site executes; we just route */}
                          {isLast && !loading && lastAction?.url && lastAction.type !== 'open_memory' && (
                            <div className="hsk-action-pills">
                              <a className="hsk-action-pill" href={lastAction.url}>
                                {String(lastAction.type || 'continue').replace(/_/g, ' ')} →
                              </a>
                            </div>
                          )}

                          {/* Smart context pills — built only from products the answer referenced */}
                          {isLast && !loading && (
                            <SmartContextPills
                              intent={lastIntent}
                              sources={discussedSources}
                              onSend={handleSend}
                              loading={loading}
                              defaultCurrency={defaultCurrency}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Selected product pinned card — shows while LLM fetches details */}
            {selectedProduct && loading && (
              <div
                className="hsk-cb-selected-product"
                onClick={() => selectedProduct.url && window.open(selectedProduct.url, '_blank')}
              >
                {selectedProduct.image && (
                  <img className="hsk-cb-selected-img" src={selectedProduct.image} alt={selectedProduct.name} />
                )}
                <div className="hsk-cb-selected-info">
                  <div className="hsk-cb-selected-name">{selectedProduct.name}</div>
                  {selectedProduct.price && (
                    <div className="hsk-cb-selected-price">
                      {selectedProduct.currency ?? defaultCurrency} {parseFloat(String(selectedProduct.price ?? '').replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}





            {/* Resume affordance after a manual stop or a mid-answer interruption.
                A stop before the first token (last message still the user's) resends
                the question; with a partial answer it resumes into the same bubble. */}
            {(stopped || interrupted) && !loading && !streaming && messages.length > 0 && (
              <div className="hsk-cb-stopped">
                <span className="hsk-cb-stopped-label">
                  {stopped ? 'You stopped this response.' : 'This response was interrupted.'}
                </span>
                <button className="hsk-cb-continue" onClick={continueGenerating}>
                  <ContinueIcon />
                  {messages[messages.length - 1]?.role === 'assistant' ? 'Continue generating' : 'Generate response'}
                </button>
              </div>
            )}

            {error && <div className="hsk-cb-error">{getFriendlyError(error, t)}</div>}

            {/* Carry-your-items prompt: paste an existing kiku key, or mint a
                new one (shown exactly once). No phone, no account. */}
            {keyPhase === 'prompt_key' && (
              <div className="hsk-cb-ai-msg">
                <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                  <SparkleIcon />
                </div>
                <div className="hsk-cb-ai-body">
                  <div className="hsk-cb-ai-text">
                    <div className="hsk-cb-phone-form">
                      <label className="hsk-cb-phone-label">Paste your public id — or create one</label>
                      <input
                        type="text"
                        className="hsk-cb-phone-input"
                        placeholder="your public id…"
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleUseExistingKey()}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="hsk-cb-phone-submit" onClick={handleUseExistingKey} disabled={!keyInput.trim()}>
                          Use my id
                        </button>
                        <button className="hsk-cb-phone-submit" onClick={handleCreateKey} disabled={minting}>
                          {minting ? 'Creating…' : "I'm new — create one"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {mintedKey && (
              <div className="hsk-cb-ai-msg">
                <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                  <SparkleIcon />
                </div>
                <div className="hsk-cb-ai-body">
                  <div className="hsk-cb-ai-text">
                    <div style={{ padding: '12px 14px', border: '1px solid var(--hsk-border, rgba(255,255,255,0.1))', borderRadius: 'var(--hsk-border-radius, 12px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>Your secret — shown only once</span>
                          <button
                            className="hsk-cb-phone-submit"
                            style={{ padding: '2px 8px', fontSize: 11, background: 'transparent', border: '1px solid var(--hsk-chat-divide, rgba(255,255,255,0.15))' }}
                            onClick={() => { setMintedKey(null); setMintedPub(null); }}
                          >
                            Dismiss ✕
                          </button>
                        </div>
                        <code style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, wordBreak: 'break-all' }}>{mintedKey}</code>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button className="hsk-cb-phone-submit" style={{ padding: '4px 10px' }} onClick={() => copyValue(mintedKey, 'secret')}>
                            {copied === 'secret' ? 'Copied' : 'Copy secret'}
                          </button>
                          <span style={{ fontSize: 11, opacity: 0.7, flex: '1 1 180px' }}>
                            Keep it private — use it to unlock your memory.
                          </span>
                        </div>
                      </div>
                      {mintedPub && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Your public id</div>
                          <code style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, wordBreak: 'break-all', opacity: 0.85 }}>{mintedPub}</code>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button className="hsk-cb-phone-submit" style={{ padding: '4px 10px' }} onClick={() => copyValue(mintedPub, 'pub')}>
                              {copied === 'pub' ? 'Copied' : 'Copy id'}
                            </button>
                            <span style={{ fontSize: 11, opacity: 0.7, flex: '1 1 180px' }}>
                              Paste this on any site to save to the same memory.
                            </span>
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 11, opacity: 0.6 }}>Hides automatically in {keyCountdown}s.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} style={{ height: 1 }} />
          </div>

          <div className="hsk-cb-input-wrap">
              <div className="hsk-cb-input-card">
                {/* Seamless Top Docked Header (Antigravity IDE style) */}
                {(/^@kiku\b/i.test(input) || showKikuPicker || showAtPicker) && (
                  <div className="hsk-cb-docked-header">
                    <span className="hsk-cb-docked-sub">{t('captureAndRemember')}</span>
                    <button
                      type="button"
                      className="hsk-cb-docked-close"
                      onClick={() => {
                        setInput(prev => prev.replace(/^@kiku\s*/i, ''));
                        setShowKikuPicker(false);
                        setShowAtPicker(false);
                      }}
                      aria-label="Close mode"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Docked Choices & Options List (INSIDE THE DOCKED CARD AREA!) */}
                {(showKikuPicker || showAtPicker) && (
                  <div className="hsk-cb-docked-options" onMouseDown={e => e.preventDefault()}>
                    {showAtPicker && captureAllowed && (
                      <button
                        type="button"
                        className="hsk-cb-docked-option"
                        onClick={() => handleSelectExtension('@kiku')}
                      >
                        <span className="hsk-cb-docked-option-icon"><SparkleIcon /></span>
                        <span className="hsk-cb-docked-option-title">kiku</span>
                        <span className="hsk-cb-docked-option-desc">capture &amp; remember</span>
                      </button>
                    )}

                    {showKikuPicker && captureAllowed && (
                      <>
                        {discussedSources.map((src, i) => (
                          <button
                            key={src.id ?? i}
                            type="button"
                            className="hsk-cb-docked-option"
                            onClick={() => { handleKikuCapture(src); setShowKikuPicker(false); }}
                          >
                            <span className="hsk-cb-docked-option-icon">
                              {src.image ? <img src={src.image} alt="" /> : <BookmarkIcon />}
                            </span>
                            <span className="hsk-cb-docked-option-title">{src.name}</span>
                            {src.price && (
                              <span className="hsk-cb-docked-option-price">
                                {src.currency ?? defaultCurrency} {parseFloat(String(src.price).replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                              </span>
                            )}
                          </button>
                        ))}
                        {discussedSources.length > 1 && (
                          <button
                            type="button"
                            className="hsk-cb-docked-option"
                            onClick={() => { handleKikuCaptureAll(discussedSources); setShowKikuPicker(false); }}
                          >
                            <span className="hsk-cb-docked-option-icon"><BookmarkIcon /></span>
                            <span className="hsk-cb-docked-option-title">{t('captureAll', { count: String(discussedSources.length) })}</span>
                          </button>
                        )}
                        {discussedSources.length === 0 && (
                          <button
                            type="button"
                            className="hsk-cb-docked-option"
                            onClick={() => { handleKikuCapture({ name: 'current page', id: undefined }); setShowKikuPicker(false); }}
                          >
                            <span className="hsk-cb-docked-option-icon"><BookmarkIcon /></span>
                            <span className="hsk-cb-docked-option-title">{t('captureCurrentPage')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="hsk-cb-docked-option"
                          onClick={() => { handleKikuViewHistory(); setShowKikuPicker(false); }}
                        >
                          <span className="hsk-cb-docked-option-icon"><HistoryIcon /></span>
                          <span className="hsk-cb-docked-option-title">{t('whatHaveYouSaved')}</span>
                        </button>
                        <button
                          type="button"
                          className="hsk-cb-docked-option"
                          onClick={() => { handleKikuDelete(); setShowKikuPicker(false); }}
                        >
                          <span className="hsk-cb-docked-option-icon"><TrashIcon /></span>
                          <span className="hsk-cb-docked-option-title">{t('deleteThis')}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Image attachment strip inside card */}
                {attachments.length > 0 && (
                  <div className="hsk-cb-img-strip">
                    {attachments.map((att, i) => (
                      <div key={i} className="hsk-cb-img-thumb-wrap">
                        <img src={att.data} alt={`attachment ${i + 1}`} className="hsk-cb-img-thumb" />
                        <button
                          className="hsk-cb-img-thumb-remove"
                          onClick={() => removeAttachment(i)}
                          aria-label="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="hsk-cb-input-box">
                  {/* Hidden file input */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => handleImageFiles(e.target.files)}
                  />
                  {/* Attach button — only shown if vision is enabled */}
                  {enableVision && (
                    <button
                      className="hsk-cb-attach-btn"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={loading}
                      aria-label="Attach image"
                      title="Attach image"
                    >
                      <PaperclipIcon />
                    </button>
                  )}
                  <div className="hsk-cb-field">
                    <textarea
                      ref={textareaRef}
                      className={cn("hsk-cb-textarea", classNames.input)}
                      value={input}
                      onChange={handleInput}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        voiceState === 'listening' ? ''
                        : voiceState === 'processing' ? t('voiceSending')
                        : activePlaceholder
                      }
                      rows={1}
                      disabled={loading}
                      aria-label={voiceState === 'listening' ? t('voiceListening') : undefined}
                    />
                    {voiceState === 'listening' && !input && <ListeningWave />}
                  </div>
                  {/* Voice button — only shown if SpeechRecognition is supported and enabled */}
                  {hasSpeechAPI && enableVoice && (
                    <button
                      className={cn(
                        "hsk-cb-mic-btn",
                        voiceState === 'listening' && "hsk-cb-mic-btn--listening",
                        voiceState === 'processing' && "hsk-cb-mic-btn--processing"
                      )}
                      onClick={voiceState === 'idle' ? startVoice : stopVoice}
                      disabled={loading}
                      aria-label={voiceState === 'idle' ? 'Start voice input' : 'Stop recording'}
                      title={voiceState === 'idle' ? 'Voice input' : 'Stop'}
                    >
                      {voiceState === 'listening' ? <MicOffIcon /> : <MicIcon />}
                    </button>
                  )}
                  {(loading || streaming) ? (
                    <button
                      className={cn("hsk-cb-send", "hsk-cb-send--stop", classNames.sendButton)}
                      onClick={stop}
                      aria-label="Stop generating"
                      title="Stop generating"
                    >
                      <StopIcon />
                    </button>
                  ) : (
                    <button
                      className={cn("hsk-cb-send", classNames.sendButton)}
                      onClick={() => handleSend()}
                      disabled={!input.trim() && attachments.length === 0}
                      aria-label="Send message"
                    >
                      <ArrowUpIcon />
                    </button>
                  )}
                </div>
              </div>
              {voiceError && (
                <div className="hsk-cb-voice-error" role="status">
                  {t(voiceError as keyof typeof DEFAULT_UI_STRINGS)}
                </div>
              )}
              <div className="hsk-cb-hint">{shopperLanguage ? t('footerHint') : 'kiku · searches the whole catalogue in real time'}</div>
            </div>

        </div>{/* end .hsk-cb-main */}

      </div>
    </div>
    </UIStringsContext.Provider>
  );
}

// ─── KikuButton (public export) ─────────────────────────────────────────────

export function KikuButton({
  label,
  title,
  placeholder,
  backdropColor,
  backdropBlur,
  className,
  onSelectSource,
  defaultCurrency,
  chips,
  theme,
  classNames = {},
  enableVoice = false,
  voiceLang,
  enableVision = false,
  visionCategoryHint,
}: KikuButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (typeof window !== 'undefined' && !(window as any).__akropolys_nav_patched) {
      (window as any).__akropolys_nav_patched = true;
      const originalPush = window.history.pushState;
      const originalReplace = window.history.replaceState;

      window.history.pushState = function(...args) {
        originalPush.apply(this, args);
        window.dispatchEvent(new CustomEvent('akropolys:navigation'));
      };

      window.history.replaceState = function(...args) {
        originalReplace.apply(this, args);
        window.dispatchEvent(new CustomEvent('akropolys:navigation'));
      };
    }

    const handleNavigation = () => {
      setOpen(false);
    };

    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('akropolys:navigation', handleNavigation);

    return () => {
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('akropolys:navigation', handleNavigation);
    };
  }, []);

  const { themeAttr: hskThemeAttr, vars: customStyles } = resolveTheme(theme);
  useHostFontFace(theme);

  return (
    <>
      <button
        className={cn("hsk-cb-btn", classNames.button, className)}
        onClick={() => setOpen(true)}
        style={customStyles}
        data-hsk-theme={hskThemeAttr}
        aria-label="Open AI chat"
      >
        <span className="hsk-cb-btn-icon" style={{ display: 'flex', alignItems: 'center' }}>
          <SparkleIcon />
        </span>
        {label !== undefined ? label : null}
      </button>
      {open && mounted && createPortal(
        <ChatModal
          title={title}
          placeholder={placeholder}
          backdropColor={backdropColor}
          backdropBlur={backdropBlur}
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
        />,
        document.body
      )}
    </>
  );
}
