'use client';

import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useKiku, ChatMessage, ChatSource } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { renderMarkdown } from '../utils/markdown';
import { AkropolysTheme, ChatAttachment, CaptureTarget, ScriptFont } from '@akropolys/sdk';
import { cn } from '../utils/cn';
import { resolveTheme } from '../utils/theme';
import { useHostFontFace, useScriptFontFace, preloadScriptFont } from '../utils/hostFont';
import { useDragToDismiss } from '../utils/sheetGesture';
import { downscaleImage } from '../utils/downscaleImage';
import { ComparisonMatrix } from './ComparisonMatrix';
import { MarkupEditor } from './MarkupEditor';
import { ArrowUpIcon } from '../utils/icons';
import { speak, stopSpeech, speechLevel, speechSpectrum, spectrumBins, isSpeaking } from '../utils/tts';
import { useVoiceSession, type VoicePhase } from '../utils/voiceSession';
import { useLiveVoice } from '../utils/liveVoice';
import { VoiceCanvas } from './VoiceCanvas';
import { KikuRocket } from './KikuRocket';
import KikuDoodles from './KikuDoodles';
import KikuGhost from './KikuGhost';


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

  /** Enable 🔊 TTS voice audio responses from AI */
  enableAudioResponse?: boolean;
  /** Optional platform voice name. Synthesis runs server-side — no key here. */
  ttsVoice?: string;
  /** Auto-speak assistant responses when user sends voice query */
  autoSpeakResponses?: boolean;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

// kiku brand mark — glyph extracted from public/brand/akropolys-icon.svg, fill
// only (no background rect) so it drops into the existing colored circles/badges.
// `tight` crops the viewBox to the glyph's own bounds. The source artboard
// leaves ~38% of the box empty, so at a given size the untight mark renders
// noticeably smaller — which is exactly the mismatch that appeared next to the
// rocket, whose viewBox is cropped the same way.
const KikuIcon = ({ className, size = 18, tight = false }: { className?: string; size?: number; tight?: boolean }) => (
  <svg
    className={cn("hsk-brand-mark", className)}
    width={size}
    height={size}
    viewBox={tight ? "10.2 17.4 79.5 79.5" : "0 0 100 100"}
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

const SpeakerIcon = ({ active }: { active?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={active ? 'currentColor' : 'none'} />
    {active ? (
      <>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </>
    ) : (
      <line x1="23" y1="9" x2="17" y2="15" />
    )}
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

const MicIcon = ({ className, size = 18 }: { className?: string; size?: number } = {}) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

const WaveformIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12h2" />
    <path d="M6 8v8" />
    <path d="M10 4v16" />
    <path d="M14 7v10" />
    <path d="M18 9v6" />
    <path d="M22 12h-2" />
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

// The endonym for a language the shopper picked from the chips. Anything typed
// in falls back to what they typed, which is already their own wording.
function endonymFor(lang: string | null | undefined): string | undefined {
  if (!lang) return undefined;
  const typed = lang.trim();
  if (!typed) return undefined;
  const l = typed.toLowerCase();
  const hit = LANGUAGE_CHOICES.find(
    x => x.value.toLowerCase() === l || x.native.toLowerCase() === l || x.tag === l
  );
  return hit ? hit.native : typed;
}

// Shown while the chrome for a freshly chosen language is being fetched. It is
// deliberately wordless — any text here would have to be English, which is the
// exact thing this whole flow exists to avoid.
//
// `label` is the one exception: the language's own endonym, which is by
// definition already in the language being fetched, so it names what the wait
// is for without a word of English.
function ChromeLoading({ label }: { label?: string }) {
  // A shimmer alone reads identical at 2s and at 25s. A bar that advances is
  // the part that says "still working" — it eases toward 92% over the ~30s a
  // live translation takes and never reaches the end on its own, so arriving
  // early looks fast and arriving late never looks stuck at 100%.
  const [pct, setPct] = useState(4);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - started) / 30000;
      setPct(4 + 88 * (1 - Math.exp(-2.2 * t)));
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hsk-cb-chrome-loading" aria-busy="true">
      <div className="hsk-cb-chrome-loading-bar" />
      <div className="hsk-cb-chrome-loading-bar" />
      <div className="hsk-cb-chrome-loading-bar" />
      <div className="hsk-cb-chrome-progress">
        <div className="hsk-cb-chrome-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {label && <span className="hsk-cb-chrome-progress-label">{label}</span>}
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
 *
 * Reads the session's analyser rather than opening its own microphone. It used
 * to call getUserMedia({ audio: true }) — a SECOND live stream, and one without
 * echoCancellation, which on several platforms downgrades the processing on the
 * capture stream that endpointing depends on. A meter must not be able to
 * degrade the thing it is metering.
 */
// Gemini Live prebuilt voices. Named explicitly because the API takes an exact
// name and silently substitutes its own choice for anything it doesn't
// recognise — which is why passing a Cloud TTS voice here produced a different
// voice on every connection.
const LIVE_VOICES = [
  { name: 'Puck', label: 'Puck', gender: 'male' },
  { name: 'Charon', label: 'Charon', gender: 'male' },
  { name: 'Kore', label: 'Kore', gender: 'female' },
  { name: 'Aoede', label: 'Aoede', gender: 'female' },
] as const;

const VOICE_STORAGE_KEY = 'hsk-live-voice';

function ListeningWave({ spectrumBins, micSpectrum }: {
  spectrumBins: () => number;
  micSpectrum: (out: Uint8Array) => boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const level = new Array(WAVE_BARS).fill(0);
    const mid = (WAVE_BARS - 1) / 2;
    let spectrum = new Uint8Array(0);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      // The bin count is only knowable once audio flows, and the session may
      // reopen the mic underneath us, so it is re-checked rather than captured.
      const bins = spectrumBins();
      if (bins === 0) return;
      if (spectrum.length !== bins) spectrum = new Uint8Array(bins);
      if (!micSpectrum(spectrum)) return;

      const row = rowRef.current;
      if (!row) return;
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
    };
    tick();

    return () => cancelAnimationFrame(raf);
  }, [spectrumBins, micSpectrum]);

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
  vizUnavailable: 'The preview could not be loaded.',
  // Spelled out rather than "AI": the abbreviation reads like marketing, and
  // this line exists to be believed. Also British spelling throughout — the two
  // literals these replaced disagreed with each other.
  vizDisclaimerImage: 'Generated using Artificial Intelligence — colours, size and placement may differ from the real product.',
  vizDisclaimerVideo: 'Generated using Artificial Intelligence — colours, size and movement may differ from the real product.',
  // Shown when something the shopper asked about has been withdrawn. Worded so
  // it fits any vertical — a retracted article, a booked property, a delisted
  // product — since the site owner's own reason follows it.
  staleTitle: 'No longer available',
  staleRemoved: '{title} has been removed and is no longer on offer.',
  staleUnavailable: '{title} is currently unavailable.',
  // The kiku-key flow. These were hardcoded English literals in the JSX, so a
  // shopper being asked to mint a portable identity read the whole exchange in
  // a language they may not have.
  keyPastePrompt: 'Paste your public id — or create one',
  keyPastePlaceholder: 'your public id…',
  keyUseMine: 'Use my id',
  keyCreating: 'Creating…',
  keyCreateNew: "I'm new — create one",
  keySecretTitle: 'Your secret — shown only once',
  keyDismiss: 'Dismiss',
  keyCopySecret: 'Copy secret',
  keyCopied: 'Copied',
  keySecretHint: 'Keep it private — use it to unlock your memory.',
  keyPublicTitle: 'Your public id',
  keyCopyId: 'Copy id',
  keyPublicHint: 'Paste this on any site to save to the same memory.',
  keyAutoHide: 'Hides automatically in {seconds}s.',

  // The returning-shopper greeting, shown on every later visit before the first
  // question of the session.
  greetReturning: 'Hi, {name}.',
  greetReturningLead: 'What can I find for you today?',

  howShouldResultsLook: 'How should results look?',
  entityLangIntro: 'I reply in {lang}. Product names stay as this site lists them — the details can too, or be translated.',
  asWritten: 'As written',
  inLanguage: 'In {lang}',
  namesAsWritten: 'Details exactly as the site lists them.',
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
  voiceModeStart: 'Hands-free conversation',
  voiceModeExit: 'Leave hands-free',
  voicePhaseListening: 'Listening',
  voicePhaseThinking: 'Thinking',
  voicePhaseSpeaking: 'Speaking',
  voiceHint: "Just talk — I'll answer when you pause.",
  voiceMuted: 'Muted',
  voiceMutedHint: 'Tap the microphone to speak again.',
  micDenied: 'Microphone blocked. Allow mic access for this site, then try again.',
  micInsecure: 'Voice needs a secure (https) connection.',
  micMissing: 'No microphone found.',
  micLangUnsupported: 'This browser cannot transcribe that language yet. Type instead.',
  micNetwork: "Couldn't reach voice. Try again in a moment.",
  voiceUnavailable: 'Voice is unavailable right now. Try again in a moment.',
  voicePickerLabel: 'Choose a voice',
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
  errNetwork: "The assistant couldn't respond just now — please try again in a moment.",
  errGeneric: 'Something went wrong. Please try again.',
  vizWorking: 'Visualizing…',
  vizMarkEdit: 'Mark & edit',
  // The markup editor's own chrome. It opens on top of a panel already speaking
  // the shopper's language, so English here reads as a different product.
  markupTitle: 'Mark where you want the change',
  markupCancel: 'Cancel',
  markupSketch: 'Sketch',
  markupText: 'Text',
  markupEraser: 'Eraser',
  markupUndo: 'Undo',
  markupClear: 'Clear',
  markupSend: 'Send',
  markupTextHint: 'Type, then Enter',
  markupInstruction: 'Describe the change — e.g. add the sofa here',
  markupDialogLabel: 'Mark up image',
  markupColorLabel: 'Colour {colour}',
  markupError: "Couldn't process this image — try a newer visualization.",
  markupLoadError: "This image can't be edited here.",
  markupLoading: 'Loading image…',
  // Becomes the shopper's own message when they marked without typing.
  markupApplyMarks: 'Apply the change I marked on the image.',
  openMemory: 'Open my memory on mimi',
  errTooManyRequests: 'The assistant is currently receiving too many requests. Please try again in a few moments.',
  errTokenLimit: "You've reached your usage limit. Please update your billing limits in your dashboard to continue.",

  statusSent: 'Sent',
  statusStopped: 'Sent · reply stopped',
  queuedWaiting: 'Queued',
  queuedSendNow: 'Send now',
  jumpToLatest: 'Scroll to latest',
  timelineLabel: 'Questions in this conversation',
  voiceConnecting: 'Connecting — wait for the tone before speaking',

  stoppedByYou: 'You stopped this response.',
  stoppedInterrupted: 'This response was interrupted.',
  continueGenerating: 'Continue generating',
  generateResponse: 'Generate response',

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
//
// There is deliberately no client-side intent parsing here. It used to match the
// text after "@kiku" against English keywords (capture|save, history, delete,
// language) and default anything unmatched to capture. That gave English typists
// deterministic routing and everyone else a different code path — and it broke
// outright in other languages: "@kiku Сменить язык на английский" matched no
// pattern, defaulted to capture, demanded a kiku key, and answered a language
// request with a key-minting prompt.
//
// Deliberate actions do not need parsing: the picker calls send() with an
// explicit intent, which is a button press and therefore language-independent.
// Typed text goes to the server with the @kiku prefix intact, where the model
// classifies it in any language and the allow-list degrades anything this
// site/plan disallows to a plain search.

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
    // In an RTL container scrollLeft starts at 0 and runs NEGATIVE toward the
    // end, so `scrollLeft > 10` was never true and the previous arrow never
    // appeared. Distance travelled from the start is the direction-free
    // quantity both arrows actually care about.
    const travelled = Math.abs(el.scrollLeft);
    const maxScroll = el.scrollWidth - el.clientWidth;
    setShowPrev(travelled > 10);
    setShowNext(maxScroll > 4 && travelled < maxScroll - 12);

    const cardWidth = 190;
    const idx = Math.round(travelled / cardWidth);
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

  // scrollBy's `left` is signed in layout terms, not visual ones: in RTL,
  // "further along the rail" is a negative delta.
  const railStep = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: 190 * dir * (rtl ? -1 : 1), behavior: 'smooth' });
  };

  const scrollNext = () => railStep(1);
  const scrollPrev = () => railStep(-1);

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
                {
                  const el = railRef.current;
                  if (el) {
                    const rtl = getComputedStyle(el).direction === 'rtl';
                    el.scrollTo({ left: i * 190 * (rtl ? -1 : 1), behavior: 'smooth' });
                  }
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Conversation timeline ────────────────────────────────────────────────────

/**
 * Every question asked so far, as dots down the gutter, with the connecting
 * line filling as the transcript scrolls.
 *
 * Reads nothing but message role and text, which is the point: a rail of
 * products with prices would assume the site sells things, and this platform
 * is domain-blind. A question is a landmark on any vertical.
 *
 * It also restores what hiding the scrollbar took away — where you are in a
 * long conversation — but says what is there rather than just how far down.
 */
function ConversationTimeline({
  items,
  activeIdx,
  progress,
  onJump,
}: {
  items: { idx: number; text: string }[];
  activeIdx: number;
  progress: number;
  onJump: (idx: number) => void;
}) {
  const tr = useT();
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cursorRef = useRef<HTMLSpanElement>(null);

  // activeIdx is an index into the whole transcript, but only questions get an
  // entry here — so it usually points at an answer, which matches no entry at
  // all. Resolve it to the question that answer belongs to: the last one at or
  // above it. Matching exactly meant every answer left the list unanchored,
  // and the offsets below snapped to the far end on each scroll tick.
  let anchor = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].idx <= activeIdx) anchor = i;
  }

  // One bright dot travels the spine rather than each marker taking its turn
  // being lit — switching a class from one dot to the next has nothing to
  // animate between them, so the highlight teleported.
  useEffect(() => {
    const node = itemRefs.current[anchor];
    const cursor = cursorRef.current;
    if (!node || !cursor) return;
    cursor.style.transform = `translateY(${node.offsetTop + node.offsetHeight / 2}px)`;
  }, [anchor, items.length]);

  // One question is not yet a timeline; two is where navigating starts to pay.
  // Guarded after the hooks, never before — the effect above has to run on
  // every render for the rules of hooks to hold.
  if (items.length < 2) return null;

  // Focus falls off with distance from that anchor, so the entries either side
  // shrink away toward the feathered edges and come back as you scroll. The
  // distance rides a custom property; the easing lives in CSS.
  return (
    <nav className="hsk-cb-timeline" aria-label={tr('timelineLabel')}>
      <div className="hsk-cb-timeline-track" style={{ '--hsk-tl-progress': progress } as React.CSSProperties}>
        <span className="hsk-cb-tl-cursor" ref={cursorRef} aria-hidden="true" />
        {items.map((item, i) => (
          <button
            key={item.idx}
            ref={(el) => { itemRefs.current[i] = el; }}
            type="button"
            className={cn('hsk-cb-tl-item', i === anchor && 'hsk-cb-tl-item--on')}
            style={{ '--hsk-tl-d': Math.min(Math.abs(i - anchor), 4) } as React.CSSProperties}
            onClick={() => onJump(item.idx)}
            title={item.text}
          >
            <span className="hsk-cb-tl-dot" />
            <span className="hsk-cb-tl-label">{item.text}</span>
          </button>
        ))}
      </div>
    </nav>
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

// Refusals the shopper cannot talk their way out of. Retrying is not just
// futile, it is the failure: the hands-free loop re-armed the mic after every
// rejected turn, so an unsigned shopper could keep talking indefinitely to a
// wall while text chat had already stopped after one.
const TERMINAL_ERROR_CODES = new Set(['account_required', 'access_revoked', 'shopper_reply_limit']);

const isTerminalError = (code: string | null | undefined): boolean =>
  Boolean(code && TERMINAL_ERROR_CODES.has(code));

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
    return tr('errNetwork');
  }

  // Anything unrecognised is server text, and server text is English. Showing
  // it verbatim dropped an English sentence into an otherwise translated
  // conversation, so the shopper gets a translated line instead and the raw
  // detail goes to the console for whoever is debugging.
  if (str) {
    try { console.warn('[kiku] untranslated error:', str); } catch { /* no console */ }
  }
  return tr('errGeneric');
};

// The kiku key is the shopper's portable, anonymous identity (kiku_<hex>) —
// server-minted, shown exactly once. Entering the same key on any site (or
// giving it to an AI agent) opens the same memory. Lost key = lost memory.
const KIKU_KEY_REVEAL_SECONDS = 15;

// ─── ChatModal Props ───────────────────────────────────────────────────────────

interface ChatModalProps extends Pick<KikuButtonProps, 'title' | 'placeholder' | 'backdropColor' | 'backdropBlur' | 'onSelectSource' | 'defaultCurrency' | 'chips' | 'theme' | 'classNames' | 'enableVoice' | 'voiceLang' | 'enableVision' | 'visionCategoryHint' | 'enableAudioResponse' | 'ttsVoice' | 'autoSpeakResponses'> {
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
        {/* No clock: the rocket beside this already says work is happening,
            and the label already carries the elapsed seconds. */}
        <span>{label}</span>
        {expandable && <span className={cn('hsk-cb-think-chevron', isOpen && 'hsk-cb-think-chevron--open')}>▶</span>}
      </button>
      {expandable && isOpen && <div className="hsk-cb-think-body">{text}</div>}
    </div>
  );
}


function ChatModal({
  title = 'kiku',
  placeholder = 'Ask me anything…',
  backdropColor,
  backdropBlur,
  onClose,
  onSelectSource,
  // Empty by default: a currency the developer never configured must not be
  // asserted to a shopper. Sites that price in one pass it explicitly.
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
}: ChatModalProps) {
  const client = useAkropolysContext();
  const { messages, sources, loading, streaming, error, errorCode, lastAction, lastIntent, allowedActions, send, queuedMessage, sendQueuedNow, appendSpokenExchange, stop, stopped, interrupted, continueGenerating, reset, referencedIds } = useKiku();

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
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<number | null>(null);
  const prevStreamingRef = useRef(streaming);
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
  // The webfont for this script, also resolved server-side and served from our
  // own origin. Null for Latin and CJK, where nothing needs loading.
  const [scriptFont, setScriptFont] = useState<ScriptFont | null>(null);

  useEffect(() => {
    if (!shopperLanguage) { setSpeechLang(''); setScriptFont(null); setChromeReady(true); return; }
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
          // Awaited (bounded) before the panel is allowed to paint: without
          // this, chrome text appeared in the system font and visibly swapped
          // to the real one a moment later. No-op for Latin, where res.font is
          // null — nothing to wait for, so that path is exactly as fast as
          // before. Set AFTER the wait so the panel never renders the old
          // scriptFont's stack against the new dictionary's text.
          if (res.font) await preloadScriptFont(res.font);
          setScriptFont(res.font ?? null);
        }
      } catch { /* English defaults are fine */ }
      if (!cancelled) setChromeReady(true);
    })();
    return () => { cancelled = true; };
  }, [shopperLanguage, dirKey, client]);

  useScriptFontFace(scriptFont);

  // There is no widget brand font, so the language picker — painted before any
  // language exists — simply inherits the host page's own font, same as a
  // Latin conversation does once one is chosen. Nothing to fetch or preload
  // for that surface: it is short, known chip labels, not a paragraph, and the
  // system fallback already renders them (proven live: Segoe UI carries
  // Arabic glyphs, just not the ones we'd have chosen).
  //
  // The host's font stays FIRST. CSS falls back per glyph, not per element, so
  // a developer whose font already covers the script keeps it, and ours draws
  // only the characters theirs actually lacks — which is the whole reason this
  // is a stack and not a replacement.
  // The rocket paints into a canvas sized in JS, so a media query cannot shrink
  // it — scaling the element instead would just resample the bitmap. Matched to
  // the same 768px the panel's own mobile layout uses.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 768px)');
    if (!mq) return;
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  const fontStack = React.useMemo(() => {
    if (!scriptFont) return undefined;
    // Only the developer's OWN font name, never their whole stack. theme.fontFamily
    // is typically itself a fallback chain ("'General Sans', system-ui, sans-serif"),
    // and pasting that whole string ahead of ours put system-ui — which resolves to
    // Segoe UI on Windows, which DOES carry Arabic glyphs — before Noto Sans Arabic
    // ever got a turn. Per-glyph fallback stops at the first font that has the
    // glyph, so Noto was declared but unreachable: hostFontCovers below measures
    // this same single name, and the stack must agree with what it measured or the
    // two silently contradict each other.
    const declared = typeof theme === 'object' && theme?.fontFamily ? theme.fontFamily : '';
    const first = declared.split(',')[0].trim();
    // A var() reference has to be passed through untouched. next/font and most
    // design systems hand out a CSS variable rather than a literal family name,
    // and quoting one turns it into a family called "var(--x)", which matches
    // nothing — the developer's font would silently never apply.
    const isVarRef = /^var\(/i.test(first);
    const hostName = first.replace(/^['"]|['"]$/g, '');
    const host = hostName ? (isVarRef ? `${first}, ` : `"${hostName}", `) : '';
    // Deliberately NOT var(--chat-font-family, var(--hsk-default-font)) here. Both
    // resolve to Latin fallback chains ending in Segoe UI / Arial / sans-serif —
    // our OWN default included — and per-glyph resolution stops at the first font
    // that has the glyph. Segoe UI does carry Arabic glyphs on Windows, so it was
    // winning ahead of Noto Sans Arabic even after the developer's stack was
    // trimmed to one name; the widget's own default chain reintroduced the exact
    // bug it was supposed to fix.
    // Latin ahead of the script font, but only faces that carry NO Arabic or
    // Persian glyphs. A script font like Noto Sans Arabic also ships Latin, and
    // per-glyph fallback stops at the first font that has the glyph — so with
    // the script font first, English rendered in its Latin cut: wide, loose and
    // visibly not a UI face. Helvetica Neue (Apple) and Roboto (Android) are
    // Latin-only, so they take the Latin run and the script font still wins
    // every glyph they lack. system-ui must stay behind the script font for the
    // reason above it: Segoe UI does carry Arabic.
    return `${host}"Helvetica Neue", Roboto, "${scriptFont.family}", system-ui, sans-serif`;
  }, [scriptFont, typeof theme === 'object' && theme ? theme.fontFamily : undefined]);

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

  // The string, not the theme object: hosts pass an inline object literal, whose
  // identity changes every render and would re-run the canvas probe each time.
  const declaredFontFamily = typeof theme === 'object' && theme ? theme.fontFamily : undefined;

  const hostFontCovers = React.useMemo(() => {
    void fontEpoch;
    if (!isNonLatin) return true;
    const declared = declaredFontFamily;
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
  }, [isNonLatin, declaredFontFamily, chromeStrings, fontEpoch]);

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
  // Load state per visualization URL. The mark button is absolutely positioned
  // against the image wrapper, so while the image has no size "right: 10px"
  // measures from a zero-width box and lands the button beside the bubble. It
  // also distinguishes "still loading" from "will never load".
  const [vizState, setVizState] = useState<Record<string, 'ok' | 'err'>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(async file => {
      if (!file.type.startsWith('image/')) return;
      // Shrink before upload. A phone photo is several MB and base64 adds a
      // third on top; that went to the backend and straight on to the image
      // model inline, where it blew the request timeout.
      const dataUrl = await downscaleImage(file);
      if (dataUrl) setAttachments(prev => [...prev, { type: 'image', data: dataUrl }]);
    });
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Voice ─────────────────────────────────────────────────────────────────
  // 'dictate' fills the composer from speech. 'converse' is the live session.
  const [voiceMode, setVoiceMode] = useState<'off' | 'dictate' | 'converse'>('off');
  // Dictation is one utterance: listen, send, close. No floor to negotiate.
  const [dictateState, setDictateState] = useState<'idle' | 'listening' | 'thinking'>('idle');
  const dictatePhase: VoicePhase = dictateState;
  const [voiceError, setVoiceError] = useState<string>('');
  const [voiceMuted, setVoiceMuted] = useState(false);
  // null = no allowance applies (signed in, or the site sets no cap).
  const [voiceSecondsLeft, setVoiceSecondsLeft] = useState<number | null>(null);
  // Set once the allowance is spent: voice stays closed until they sign in.
  const [voiceBlocked, setVoiceBlocked] = useState(false);
  const voiceModeRef = useRef<'off' | 'dictate' | 'converse'>('off');
  const handleSendRef = useRef<(text: string) => void>(() => {});

  // Advice, not state: it retires itself rather than sitting under the bar.
  useEffect(() => {
    if (!voiceError) return;
    const timer = setTimeout(() => setVoiceError(''), 5000);
    return () => clearTimeout(timer);
  }, [voiceError]);

  // Transcribe in the language being SPOKEN: developer override → the language
  // chosen in onboarding → page <html lang> → browser language → English.
  const speechBCP47 =
    voiceLang || speechLang ||
    (typeof document !== 'undefined' ? document.documentElement.lang : '') ||
    (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-US';

  const handleVoiceError = useCallback((code: string) => {
    // Every failure looked identical before this: the button blinked and
    // nothing happened, with no way to tell a denied mic from a silent one.
    setVoiceError(
      code === 'not-allowed' || code === 'service-not-allowed'
        ? (isSecureOrigin() ? 'micDenied' : 'micInsecure')
        : code === 'audio-capture' ? 'micMissing'
        : code === 'language-not-supported' ? 'micLangUnsupported'
        // A dropped socket is not a deaf microphone. Reporting it as one sent
        // the shopper to check a device that was working the whole time.
        : code === 'network' || code === 'connection' ? 'micNetwork'
        : code === 'unavailable' ? 'voiceUnavailable'
        : 'micFailed'
    );
  }, []);

  const stopSessionRef = useRef<() => void>(() => {});
  const handleUtterance = useCallback((text: string) => {
    setInput('');
    setDictateState('thinking');
    // Dictation is one utterance, not a conversation: close the mic rather
    // than leaving it open behind a sent message.
    if (voiceModeRef.current === 'dictate') {
      voiceModeRef.current = 'off';
      setVoiceMode('off');
      stopSessionRef.current();
    }
    handleSendRef.current(text);
  }, []);

  const voice = useVoiceSession({
    lang: speechBCP47,
    onUtterance: handleUtterance,
    onError: handleVoiceError,
    // The mic stays open through both, but recognition is torn down so the
    // assistant's own answer is never transcribed back as a new question.
    paused: voiceMuted || dictateState === 'thinking',
  });

  useEffect(() => { stopSessionRef.current = voice.stop; }, [voice.stop]);

  // Hands-free conversation is a live audio session with the model, not a
  // transcribe → chat → synthesize relay. Turn-taking, barge-in and endpointing
  // are decided where the audio already is, which is why none of the floor
  // machinery below applies to it.
  // Remembered across sessions: a shopper who picked a voice should not have to
  // pick it again, and the default must be stable rather than whatever the
  // model felt like.
  const [liveVoiceName, setLiveVoiceName] = useState<string>(() => {
    if (typeof localStorage === 'undefined') return LIVE_VOICES[0].name;
    const saved = localStorage.getItem(VOICE_STORAGE_KEY);
    return LIVE_VOICES.some(v => v.name === saved) ? saved! : LIVE_VOICES[0].name;
  });

  const live = useLiveVoice({
    apiUrl: (client as any)?.api?.apiUrl ?? '',
    siteId: (client as any)?.api?.siteId ?? '',
    token: (client as any)?.api?.apiToken ?? '',
    kikuId: (client as any)?.api?.getShopperId?.(),
    language: shopperLanguage,
    voice: liveVoiceName,
    // The mute button drove only the dictation session's `paused`; live mode
    // never saw it, so the mic stayed open and streaming with the icon crossed
    // out — the tab's own recording indicator gave that away.
    muted: voiceMuted,
    // Each finished spoken turn joins the transcript, so closing voice mode
    // leaves the conversation behind and a typed follow-up can refer back to
    // what was said aloud.
    onExchange: ({ heard, said }) => appendSpokenExchange(heard, said),
    onError: handleVoiceError,
    onRefused: (reason) => {
      setVoiceSecondsLeft(0);
      voiceModeRef.current = 'off';
      setVoiceMode('off');
      if (reason === 'guest') setVoiceBlocked(true);
    },
  });

  const conversing = voiceMode === 'converse';
  // Conversation needs a microphone and a socket, not SpeechRecognition —
  // gating it on Web Speech hid it entirely on mobile Safari.
  const canConverse = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  // The voice is fixed when the session opens, so changing it mid-conversation
  // means reconnecting. Done in an effect rather than in the click handler so
  // the restart reads the name React has actually committed.
  const prevVoiceRef = useRef(liveVoiceName);
  // Reached through refs, and `live` is deliberately NOT a dependency: the hook
  // returns a fresh object every render, so depending on it re-ran this effect
  // on the very re-render that live.stop() caused. The cleanup then cleared the
  // pending restart, and the guard above returned early on the way back in — so
  // the session stopped and never came back. That was the silence.
  const liveStartRef = useRef(live.start);
  const liveStopRef = useRef(live.stop);
  liveStartRef.current = live.start;
  liveStopRef.current = live.stop;
  useEffect(() => {
    if (prevVoiceRef.current === liveVoiceName) return;
    prevVoiceRef.current = liveVoiceName;
    if (!conversing) return;
    liveStopRef.current();
    const id = setTimeout(() => { void liveStartRef.current(); }, 120);
    return () => clearTimeout(id);
  }, [liveVoiceName, conversing]);

  // In conversation the server says what it retrieved, so there is nothing to
  // guess: cards land with the sentence rather than after it. The keyword
  // inference still serves text, where no such signal exists.
  const shownSources = conversing && live.sources.length ? live.sources : discussedSources;

  const chooseVoice = useCallback((name: string) => {
    setLiveVoiceName(name);
    try { localStorage.setItem(VOICE_STORAGE_KEY, name); } catch { /* private mode */ }
  }, []);
  // One name for what the interface renders, two machines behind it: the floor
  // reducer still owns dictation, the live session owns conversation.
  const voicePhase: VoicePhase = conversing
    ? (live.state === 'speaking' ? 'speaking'
      : live.state === 'connecting' || live.state === 'thinking' ? 'thinking'
      : live.state === 'listening' ? 'listening' : 'idle')
    : dictatePhase;

  // The microphone genuinely is not open until the session is ready — capture
  // arms on the server's ready frame, because audio sent before then reaches
  // the model as one compressed burst it reads as a single unfinished turn.
  // So the interface has to say so: this state used to draw the same animated
  // filament as thinking, which reads as listening, and people spoke into a
  // dead mic and lost their opening words.
  const voiceConnecting = conversing && live.state === 'connecting';

  useEffect(() => {
    if (conversing) setVoiceSecondsLeft(live.secondsLeft);
  }, [conversing, live.secondsLeft]);

  // Both analysers are created lazily, so the bin count is only knowable once
  // audio is flowing. The canvas reads it per frame — polling it into state
  // re-rendered the entire modal twice a second for a value that never changes.
  const voiceBins = useCallback(
    () => (voicePhase === 'speaking' ? spectrumBins() : voice.spectrumBins()),
    [voicePhase, voice]
  );



  // Live feedback: partial words appear in the composer as they are heard.
  useEffect(() => {
    if (voice.active && voice.interim) setInput(voice.interim);
  }, [voice.interim, voice.active]);

  const startVoice = useCallback((mode: 'dictate' | 'converse') => {
    setVoiceError('');
    // Otherwise the loop is one tap away from restarting: ending the session on
    // a terminal refusal accomplishes nothing if the mic can be reopened into
    // the same wall.
    if (voiceBlocked || isTerminalError(errorCode)) return;
    if (!isSecureOrigin()) { setVoiceError('micInsecure'); return; }
    if (mode === 'dictate' && !voice.supported) { setVoiceError('micFailed'); return; }
    stopSpeech();
    setSpeakingMsgIndex(null);
    voiceModeRef.current = mode;
    setVoiceMode(mode);
    setVoiceMuted(false);
    if (mode === 'converse') {
      // No SpeechRecognition dependency: the live session needs a microphone
      // and a socket, which is why it works in browsers dictation never did.
      setTimeout(() => { void live.start(); }, 220);
      return;
    }
    setDictateState('listening');
    // Opening the microphone is a ~60ms blocking task. Running it in the same
    // frame as the overlay's entrance made the animation visibly stutter, so
    // the surface paints first and the device is acquired right after.
    setTimeout(() => { void voice.start(); }, 220);
  }, [voice, live, error, voiceBlocked]);

  const stopVoice = useCallback(() => {
    voice.stop();
    live.stop();
    stopSpeech();
    voiceModeRef.current = 'off';
    setVoiceMode('off');
    setDictateState('idle');
    setSpeakingMsgIndex(null);
  }, [voice, live]);

  const speakMessage = useCallback((idx: number, text: string) => {
    if (speakingMsgIndex === idx) {
      stopSpeech();
      setSpeakingMsgIndex(null);
      return;
    }
    setSpeakingMsgIndex(idx);
    void speak({
      client: client as any,
      text,
      voice: ttsVoice,
      language: shopperLanguage,
      bcp47: speechLang,
      onEnd: () => setSpeakingMsgIndex(null),
      onError: () => setSpeakingMsgIndex(null),
    });
  }, [speakingMsgIndex, client, ttsVoice, shopperLanguage, speechLang]);

  // Declared BEFORE the resume effect below so that when both fire in the same
  // commit — the refusal sets `error` and drops `streaming` together — voice
  // mode is already off by the time the loop decides whether to listen again.
  useEffect(() => {
    if (!isTerminalError(errorCode)) return;
    voiceModeRef.current = 'off';
    setVoiceMode('off');
    stopSessionRef.current();
    stopSpeech();
    setSpeakingMsgIndex(null);
    setDictateState('idle');
  }, [errorCode]);


  useEffect(() => () => { stopSpeech(); }, []);

  // No vertical pre-determination: chips and placeholder are whatever the
  // integrator passed (blank by default). One widget can't guess what a given
  // site sells, so it never assumes.
  const activeChips = chips;
  const activeTitle = title;
  // Step 1 has no language to translate into yet. Past that point, only
  // substitute the translated default when the caller left `placeholder` at
  // its own default — an integrator's custom placeholder is their content,
  // left as-is rather than silently overridden.
  // The onboarding steps past the language pick have nothing to accept until
  // their own chrome exists: a name sent mid-fetch advanced to step 3, which
  // then had to render its question in a language that had not arrived yet.
  const chromeLoading = (awaitingName || awaitingEntityLang) && !chromeReady;

  const activePlaceholder = awaitingLang
    ? 'Type preferred language…'
    : awaitingName
      ? (chromeReady ? t('namePlaceholder') : '')
      : awaitingEntityLang
        ? (chromeReady ? t('entityLangPlaceholder') : '')
        : shopperLanguage && placeholder === 'Ask me anything…'
          ? t('defaultPlaceholder')
          : placeholder;


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
  const lastExternalScrollRef = useRef(0);

  // Drag the sheet down to dismiss, tracking the finger and carrying release
  // velocity into the spring. Touch only — a mouse has no equivalent gesture.
  useDragToDismiss({
    panel: useCallback(() => panelRef.current, []),
    scroller: useCallback(() => msgsContainerRef.current, []),
    onDismiss: onClose,
    // Momentum keeps firing scroll events after the finger lifts. Starting a
    // sheet drag then means the native fling and the gesture both own the
    // frame, so wait for the list to actually be still.
    quiescent: useCallback(() => performance.now() - lastExternalScrollRef.current > 90, []),
  });
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);
  // The scrollbar itself used to be the only way to tell there was more below
  // — and on Windows/Chrome its track reserves width, shifting every bubble
  // a few pixels the moment scrolling becomes possible. Hidden in CSS now;
  // this replaces it as the "there's more" signal.
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  // Drives the timeline: how far through the transcript we are, and which
  // question owns the part of it currently on screen.
  const [scrollProgress, setScrollProgress] = useState(1);
  const [activeMsgIdx, setActiveMsgIdx] = useState(0);
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

  // Whether the reader is parked at the bottom and wants the stream to carry
  // them along. A distance test alone is not enough: within the old 120px band
  // the autoscroll kept overwriting the wheel's own target every token, so the
  // two took turns writing scrollTop and the list shook.
  const stickToBottomRef = useRef(true);
  const [alertTick, setAlertTick] = useState(0);
  // Bumped each time the reader leaves the bottom, so leaving again during one
  // long answer counts as a fresh reason to speak up.
  const awayEpochRef = useRef(0);
  const lastAlertKeyRef = useRef('');
  // Declared here so the scroll effect below can reach them; filled in once the
  // alert state exists further down.
  const dismissJumpAlertRef = useRef<() => void>(() => {});
  const resetAlertArmingRef = useRef<() => void>(() => {});

  useEffect(() => {
    const el = msgsContainerRef.current;
    if (!el) return;
    let idle: ReturnType<typeof setTimeout>;
    const settle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => { touchScrollingRef.current = false; }, 150);
    };
    const onTouchStart = () => {
      clearTimeout(idle);
      touchScrollingRef.current = true;
      dismissJumpAlertRef.current();
    };
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
    const el = msgsContainerRef.current;
    if (!el) return;
    const JUMP_THRESHOLD = 160;
    const STICK_ON = 8;
    let queued = 0;

    const measure = () => {
      queued = 0;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      // Distance can only ever switch following back ON. Letting it switch
      // following OFF conflated two different things: the reader scrolling up,
      // and the content growing underneath them. Clicking a product inserts a
      // whole card block at once, which spikes the distance while the reader
      // has not moved at all — that read as "they left", so the ghost fired and
      // the stream stopped being followed. Leaving is a decision, so only real
      // input makes it (see the wheel and external-scroll handlers).
      if (distance <= STICK_ON) {
        if (!stickToBottomRef.current) resetAlertArmingRef.current();
        stickToBottomRef.current = true;
      }

      // Gated on following, not on distance alone. While the stream is being
      // followed every chunk spikes the distance for the frames it takes the
      // glide to catch up, so a pure distance test mounted and unmounted the
      // button once per chunk — that flashing was the "patched up" look. If the
      // reader is being carried along there is nothing to jump to anyway.
      setShowJumpToBottom(distance > JUMP_THRESHOLD && !stickToBottomRef.current);

      const max = el.scrollHeight - el.clientHeight;
      setScrollProgress(max > 8 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 1);

      // The question that owns the screen is the last one to have passed the
      // upper third — the same point a reader's eye is actually resting on.
      const line = el.scrollTop + el.clientHeight * 0.33;
      let active = 0;
      for (let i = 0; i < messageRefs.current.length; i++) {
        const node = messageRefs.current[i];
        if (node && node.offsetTop - el.offsetTop <= line) active = i;
      }
      setActiveMsgIdx(active);
    };

    // Coalesced to one measurement per frame. A flick fires scroll events far
    // faster than paint, and re-rendering the timeline on every one of them is
    // what made a fast scroll look like it was fighting itself. Reading layout
    // inside rAF also keeps it out of the event handler's critical path.
    const onScroll = () => {
      if (queued) return;
      queued = requestAnimationFrame(measure);
    };

    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      if (queued) cancelAnimationFrame(queued);
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [messages.length]);

  // Keyed on the turn plus which trip away from the bottom this is, so the
  // ghost fires once for each — a new answer while the reader is away, or the
  // reader leaving mid-answer. A plain 0/1 latch here alerted exactly once and
  // then went silent for the rest of the session, because the effect watching
  // it never saw the value change again.
  const notifyNewBelow = useCallback((turn: number) => {
    const key = `${turn}:${awayEpochRef.current}`;
    if (lastAlertKeyRef.current === key) return;
    lastAlertKeyRef.current = key;
    setAlertTick(t => t + 1);
  }, []);

  // The ghost rests tucked into the edge and only travels out to say something
  // arrived. Parked in the middle it would sit on top of whatever is being
  // read, so it retreats on its own once it has had its moment.
  const [jumpAlert, setJumpAlert] = useState(false);
  // Namespaced per mount: an SVG filter id is global to the document, and two
  // embeds of the widget on one page would otherwise collide on the same id.
  const gooId = `hsk-goo-${useId()}`;
  const jumpAlertRef = useRef(false);
  const alertShownAtRef = useRef(0);
  const clearAlert = useCallback(() => {
    jumpAlertRef.current = false;
    setJumpAlert(false);
  }, []);
  // Rearms the trigger outright: after returning to the bottom the next thing
  // to arrive should summon the ghost again, whatever it is.
  const resetAlertArming = useCallback(() => {
    lastAlertKeyRef.current = '';
    clearAlert();
  }, [clearAlert]);
  // The scroll that carries the reader away is still settling when the alert
  // fires, and those frames are not an acknowledgement — without this window
  // the ghost was dismissed by the very gesture that summoned it.
  const dismissJumpAlert = useCallback(() => {
    if (!jumpAlertRef.current) return;
    if (performance.now() - alertShownAtRef.current < 700) return;
    clearAlert();
  }, [clearAlert]);
  dismissJumpAlertRef.current = dismissJumpAlert;
  resetAlertArmingRef.current = resetAlertArming;
  useEffect(() => {
    if (alertTick === 0) return;
    jumpAlertRef.current = true;
    alertShownAtRef.current = performance.now();
    setJumpAlert(true);
    const t = setTimeout(clearAlert, 4200);
    return () => clearTimeout(t);
  }, [alertTick, clearAlert]);

  const jumpToMessage = useCallback((idx: number) => {
    const el = msgsContainerRef.current;
    const node = messageRefs.current[idx];
    if (!el || !node) return;
    const to = node.offsetTop - el.offsetTop - 12;
    if (glideScrollRef.current) glideScrollRef.current(to);
    else el.scrollTo({ top: to, behavior: 'smooth' });
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = msgsContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    resetAlertArmingRef.current();
    const bottom = el.scrollHeight - el.clientHeight;
    if (glideScrollRef.current) glideScrollRef.current(bottom);
    else el.scrollTo({ top: bottom, behavior: 'smooth' });
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
        // Asking a question is a request to be taken to the answer.
        stickToBottomRef.current = true;
        resetAlertArmingRef.current();
      } else if (!stickToBottomRef.current) {
        notifyNewBelow(messages.length);
      } else {
        if (!touchScrollingRef.current) {
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
  }, [messages, loading]);

  // ── Lenis-style Smooth Momentum Wheel Scroll ─────────────────────────────────
  useEffect(() => {
    const el = msgsContainerRef.current;
    if (!el) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // Lenis defaults to lerp 0.1 per frame at 60Hz, which is this curve at ~6.3.
    // 12 reached the target in half the time and read as a stop rather than a
    // glide; 7 keeps the long tail that makes the settle feel unforced.
    const LAMBDA = 7;
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
      el.scrollTop = v;
      // Record what the browser accepted, not what we asked for. It clamps to
      // max scroll, and max scroll moves under us while an answer streams in —
      // storing the request made every clamp look like a user scroll, so the
      // glide cancelled and restarted once per token. That was the shake.
      written = el.scrollTop;
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

      // Scrolling up is an explicit request to stop being carried along. Waiting
      // for the distance to cross a threshold lets the autoscroll win the first
      // few frames, and that argument is what the eye reads as a shake.
      if (e.deltaY < 0) {
        if (stickToBottomRef.current) awayEpochRef.current += 1;
        stickToBottomRef.current = false;
      }

      // Dismissal keys off real input, not scroll events: the list keeps
      // emitting those as the answer grows and as our own glide settles, and
      // none of that is the reader acknowledging anything.
      dismissJumpAlertRef.current();

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

    // Any scroll we did not write is the user (touch momentum, scrollbar, keys)
    // or the browser. Previously the loop re-seeded from it and kept easing to
    // its old target, so the two fought all the way down — visible as a jitter
    // as the scroll settled. Yielding outright is always the right call: the
    // user's input outranks an animation we started.
    let lastTop = el.scrollTop;
    const handleScroll = () => {
      // Only scrolls we did NOT write count as "the list is moving on its own".
      // Counting ours meant streaming autoscroll kept the list permanently
      // non-quiescent, and the sheet could never be dragged during a reply.
      const external = Math.abs(el.scrollTop - written) > 1;
      if (external) {
        lastExternalScrollRef.current = performance.now();
        // The wheel handler cannot see scrollbar drags, keyboard paging or
        // touch momentum, so the same "the reader chose to leave" decision has
        // to be made here too. Tested on direction, never on distance: content
        // growing below moves the distance without moving scrollTop at all.
        if (el.scrollTop < lastTop - 1 && stickToBottomRef.current) {
          awayEpochRef.current += 1;
          stickToBottomRef.current = false;
        }
      }
      lastTop = el.scrollTop;
      if (rafId !== null && external) {
        cancelAnimationFrame(rafId);
        rafId = null;
        el.classList.remove('hsk-scrolling');
        target = current = written = el.scrollTop;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
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
    // Not gated on `loading`: a message typed while one is already in flight
    // is queued by useKiku's send() itself, not dropped here. One queued
    // message at a time though — leave a third attempt sitting in the
    // composer rather than clearing it for a send that won't happen.
    if (!raw || chromeLoading || queuedMessage) return;

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

    // Typed @kiku text is classified server-side; only the picker forces an intent.
    const q = raw;
    const resolvedForcedIntent = forcedIntent;

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
    setAttachments([]);
    send(names || 'capture all', display, undefined, 'capture_all', targets);
  }, [defaultCurrency, send, t]);

  const handleKikuViewHistory = useCallback(() => {
    const display = `@kiku ${t('displayViewHistory')}`;
    setInput('');
    setAttachments([]);
    send('show my saved items', display, undefined, 'view_history');
  }, [send, t]);

  const handleKikuDelete = useCallback(() => {
    const display = `@kiku ${t('displayDelete')}`;
    setInput('');
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

  // The voice session is declared above handleSend and must reach it without
  // dragging the whole send pipeline into its dependencies.
  useEffect(() => {
    handleSendRef.current = (text: string) => { void handleSend(text); };
  });


  const blurVal = typeof backdropBlur === 'number' ? `${backdropBlur}px` : (backdropBlur ?? '20px');

  // A stop before the first token leaves an assistant turn with nothing in it.
  // Rendering it anyway drew the brand mark over an empty column, which read as
  // an answer that had failed to paint rather than as one that never started.
  const halted = (stopped || interrupted) && !loading && !streaming;
  const displayMessages = React.useMemo(() => {
    const inFlight = loading || streaming;
    return messages.filter((m, i) => {
      if (m.role !== 'assistant') return true;
      const isLastMsg = i === messages.length - 1;
      // The live turn is empty on purpose until its first token arrives — that
      // is the thinking indicator, not a blank answer.
      if (isLastMsg && inFlight) return true;
      // Anything the turn may have produced other than prose still counts as
      // an answer worth its row.
      const hasBody = !!m.content || !!m.visualization || m.visualizing ||
        (m.knowledgeImages?.length ?? 0) > 0 || (m.referencedIds?.length ?? 0) > 0;
      // A settled turn that produced nothing at all: the server closed the
      // stream without ever sending a token. Drawing it left the brand mark
      // floating over a column of white space between two real messages.
      return hasBody;
    });
  }, [messages, loading, streaming]);

  // One entry per question asked. Answers are not landmarks — nobody scrolls
  // back looking for "the reply", they look for what they asked.
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

  // Nothing was generated at all, so the notice has no answer to sit beneath
  // and is centred on its own instead of hanging off the leading edge.
  const haltedEmpty =
    halted && displayMessages[displayMessages.length - 1]?.role !== 'assistant';

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
        data-nastaliq={scriptFont?.family === 'Noto Nastaliq Urdu' ? 'true' : undefined}
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

        {/* ── Main Chat Area ── */}
        <div className="hsk-cb-main" ref={mainRef}>

          <KikuDoodles seed={(client as any)?.api?.siteId ?? ''} theme={hskThemeAttr} />

          {/* Top bar */}
          <div className="hsk-cb-topbar">
            <div className="hsk-cb-topbar-left">
              {/* Name only: the mark already appears beside every answer, and
                  twice over read as branding rather than as an assistant. */}
              <div className="hsk-cb-topbar-title">{activeTitle}</div>
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
                      <ChromeLoading label={endonymFor(shopperLanguage)} />
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
                    {chromeReady && (
                      <div className="hsk-cb-entlang-opts" role="radiogroup" aria-label={t('howShouldResultsLook')}>
                        {(['translated', 'original'] as const).map(mode => (
                          <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={false}
                            className="hsk-cb-entlang-opt"
                            onClick={() => chooseEntityLang(mode)}
                          >
                            <span className="hsk-cb-entlang-radio" aria-hidden="true" />
                            <span className="hsk-cb-entlang-opt-text">
                              <span className="hsk-cb-entlang-opt-title">
                                {mode === 'translated'
                                  ? tNode('inLanguage', { lang: shopperLanguage })
                                  : t('asWritten')}
                              </span>
                              <span className="hsk-cb-entlang-opt-note">
                                {mode === 'translated' ? t('detailsTranslated') : t('namesAsWritten')}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
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
                // …and the run closes up: consecutive bubbles from one sender
                // sit a couple of pixels apart, not a turn's worth of space.
                const runMid = isUser && !isRunEnd;
                const runCont = isUser && displayMessages[idx - 1]?.role === 'user';
                // The matrix can only stand in for the LLM's table when BOTH compared
                // products came from this turn's retrieval; a follow-up compare against
                // an item from memory must keep the markdown table.
                const compareSources = discussedSources;
                const showMatrix = isLast && lastIntent === 'compare' && compareSources.length >= 2;
                const displayContent =
                  !isUser && showMatrix ? stripMarkdownTables(msg.content) : msg.content;
                return (
                  <div
                    key={idx}
                    className={cn(
                      'hsk-cb-msg-group',
                      runMid && 'hsk-cb-msg-group--run-mid',
                      runCont && 'hsk-cb-msg-group--run-cont',
                    )}
                    ref={(el) => { messageRefs.current[idx] = el; }}
                  >
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
                          <div className={cn(
                            'hsk-cb-user-bubble',
                            isRunEnd && 'hsk-cb-user-bubble--tail',
                            msg.spoken && 'hsk-cb-user-bubble--spoken',
                          )}>
                            {/* Marked as spoken: transcription is imperfect, and
                                a bubble nobody typed needs to say why it is
                                there. Absolutely positioned, so it adds no
                                height to the bubble it annotates. */}
                            {msg.spoken && <MicIcon className="hsk-cb-spoken-mark" size={10} />}
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
                            // Lands on the first character of the ANSWER, not
                            // on `loading`: that flips false as soon as any
                            // event arrives — a thinking chunk included — so
                            // tying it there parked the rocket for the whole
                            // reasoning phase, however long it ran.
                            <KikuRocket landed={!!msg.content.trim()} size={isNarrow ? 26 : 40} />
                          ) : (
                            // Same crop and same box as the rocket, so the mark
                            // does not shrink the instant the turn finishes.
                            <SparkleIcon tight size={40} className="hsk-cb-ai-mark" />
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
                                {/* A spoken reply was never "thought about" in
                                    the streaming sense — it already happened,
                                    out loud, in the voice session. */}
                                {!msg.spoken && (thinking || msg.thoughtForSeconds != null || (isLast && (streaming || loading))) && (
                                  <ThinkingBlock text={thinking} isComplete={isComplete} seconds={msg.thoughtForSeconds} />
                                )}
                                {content && (
                                  <div className="hsk-cb-ai-content">
                                    <MarkdownBlock content={content} streaming={isLast && streaming} />
                                  </div>
                                )}
                                {/* Per-message speaker, parked rather than deleted — the whole
                                    TTS path behind it (speakMessage, speakingMsgIndex,
                                    enableAudioResponse) is still wired, so restoring it is
                                    uncommenting this block and nothing else.
                                {content && enableAudioResponse !== false && !(isLast && streaming) && (
                                  <button
                                    type="button"
                                    className={cn('hsk-cb-listen', speakingMsgIndex === idx && 'hsk-cb-listen--active')}
                                    onClick={() => speakMessage(idx, content)}
                                    aria-label={speakingMsgIndex === idx ? t('voiceModeExit') : t('voicePhaseSpeaking')}
                                    title={speakingMsgIndex === idx ? t('voiceModeExit') : t('voicePhaseSpeaking')}
                                  >
                                    <SpeakerIcon active={speakingMsgIndex === idx} />
                                  </button>
                                )}
                                */}
                              </>
                            );
                          })()}

                          {msg.visualizing && (
                            <div className="hsk-cb-viz hsk-cb-viz--loading">
                              <span className="hsk-cb-viz-spinner" />
                              <span>{msg.visualizingText || t('vizWorking')}</span>
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
                                    style={vizState[msg.visualization] === 'err' ? { display: 'none' } : undefined}
                                    onLoad={() => setVizState(p => ({ ...p, [msg.visualization!]: 'ok' }))}
                                    onError={() => setVizState(p => ({ ...p, [msg.visualization!]: 'err' }))}
                                  />
                                )}
                                {vizState[msg.visualization] === 'err' && (
                                  <div className="hsk-cb-viz-broken">{t('vizUnavailable')}</div>
                                )}
                                {isLast && !streaming && vizState[msg.visualization] === 'ok' && (msg.visualizationType !== 'video' && !msg.visualization.includes('/videos/')) && (
                                  <button className="hsk-cb-viz-mark" onClick={() => setMarkupSrc(msg.visualization!)}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                    </svg>
                                    {t('vizMarkEdit')}
                                  </button>
                                )}
                              </div>
                              <div className="hsk-cb-viz-disclaimer">
                                {msg.visualizationType === 'video' || msg.visualization.includes('/videos/')
                                  ? t('vizDisclaimerVideo')
                                  : t('vizDisclaimerImage')}
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

                          {/* Withdrawn entries — structured, so the warning survives however the model phrased the answer */}
                          {!isUser && (msg.staleNotices?.length ?? 0) > 0 && (
                            <div className="hsk-cb-stale" role="status">
                              <div className="hsk-cb-stale-title">{t('staleTitle')}</div>
                              {msg.staleNotices!.map((n, i) => (
                                <div key={i} className="hsk-cb-stale-item">
                                  {n.state === 'removed'
                                    ? t('staleRemoved', { title: n.title })
                                    : t('staleUnavailable', { title: n.title })}
                                  {n.reason && <span className="hsk-cb-stale-reason"> {n.reason}</span>}
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
                              {t('openMemory')}
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





            {/* Resume affordance after a manual stop or a mid-answer interruption.
                A stop before the first token (last message still the user's) resends
                the question; with a partial answer it resumes into the same bubble. */}
            {halted && messages.length > 0 && (
              <div className={cn("hsk-cb-stopped", haltedEmpty && "hsk-cb-stopped--empty")}>
                {haltedEmpty && (
                  <span className="hsk-cb-stopped-dots" aria-hidden="true">
                    <i /><i /><i />
                  </span>
                )}
                <span className="hsk-cb-stopped-label">
                  {stopped ? t('stoppedByYou') : t('stoppedInterrupted')}
                </span>
                <button className="hsk-cb-continue" onClick={continueGenerating}>
                  <ContinueIcon />
                  {t(messages[messages.length - 1]?.role === 'assistant' ? 'continueGenerating' : 'generateResponse')}
                </button>
              </div>
            )}

            {error && <div className="hsk-cb-error">{getFriendlyError({ code: errorCode ?? undefined, message: error }, t)}</div>}

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
                      <label className="hsk-cb-phone-label">{t('keyPastePrompt')}</label>
                      <input
                        type="text"
                        className="hsk-cb-phone-input"
                        placeholder={t('keyPastePlaceholder')}
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleUseExistingKey()}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="hsk-cb-phone-submit" onClick={handleUseExistingKey} disabled={!keyInput.trim()}>
                          {t('keyUseMine')}
                        </button>
                        <button className="hsk-cb-phone-submit" onClick={handleCreateKey} disabled={minting}>
                          {minting ? t('keyCreating') : t('keyCreateNew')}
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
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{t('keySecretTitle')}</span>
                          <button
                            className="hsk-cb-phone-submit"
                            style={{ padding: '2px 8px', fontSize: 11, background: 'transparent', border: '1px solid var(--hsk-chat-divide, rgba(255,255,255,0.15))' }}
                            onClick={() => { setMintedKey(null); setMintedPub(null); }}
                          >
                            {t('keyDismiss')} ✕
                          </button>
                        </div>
                        <code style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, wordBreak: 'break-all' }}>{mintedKey}</code>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button className="hsk-cb-phone-submit" style={{ padding: '4px 10px' }} onClick={() => copyValue(mintedKey, 'secret')}>
                            {copied === 'secret' ? t('keyCopied') : t('keyCopySecret')}
                          </button>
                          <span style={{ fontSize: 11, opacity: 0.7, flex: '1 1 180px' }}>
                            {t('keySecretHint')}
                          </span>
                        </div>
                      </div>
                      {mintedPub && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t('keyPublicTitle')}</div>
                          <code style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, wordBreak: 'break-all', opacity: 0.85 }}>{mintedPub}</code>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button className="hsk-cb-phone-submit" style={{ padding: '4px 10px' }} onClick={() => copyValue(mintedPub, 'pub')}>
                              {copied === 'pub' ? t('keyCopied') : t('keyCopyId')}
                            </button>
                            <span style={{ fontSize: 11, opacity: 0.7, flex: '1 1 180px' }}>
                              {t('keyPublicHint')}
                            </span>
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{t('keyAutoHide', { seconds: String(keyCountdown) })}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Held outside `messages` until it dispatches: every stream write
                targets the last message expecting the assistant's turn, and a
                queued user bubble in that slot swallowed the whole answer. */}
            {queuedMessage && (
              <div className={cn(
                'hsk-cb-msg-group',
                displayMessages[displayMessages.length - 1]?.role === 'user' && 'hsk-cb-msg-group--run-cont',
              )}>
                <div className="hsk-cb-user-msg">
                  <div className="hsk-cb-user-bubble hsk-cb-user-bubble--tail hsk-cb-user-bubble--queued">
                    {queuedMessage.content}
                  </div>
                  <button type="button" className="hsk-cb-queued-status" onClick={sendQueuedNow}>
                    <span className="hsk-cb-queued-dot" />
                    {t('queuedWaiting')}
                    <span className="hsk-cb-queued-now">{t('queuedSendNow')}</span>
                  </button>
                </div>
              </div>
            )}

            <div ref={bottomRef} style={{ height: 1 }} />

          </div>

          <div className="hsk-cb-input-wrap">
              {showJumpToBottom && (
                <div className="hsk-cb-jump-wrap">
                  {/* Blur enough to let a nearby circle and the strip below it
                      merge, then a contrast ramp steep enough to snap the
                      blur's soft gradient back to a hard edge — the classic
                      metaball recipe. Only the plain-colour shapes sit inside
                      this filter; the ghost glyph is layered on top afterwards
                      so it stays crisp instead of blurring with them. */}
                  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
                    <defs>
                      <filter id={gooId}>
                        <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
                        <feColorMatrix in="blur" mode="matrix"
                          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" />
                      </filter>
                    </defs>
                  </svg>
                  {/* drop-shadow is chained after the goo so it outlines the
                      already-fused silhouette rather than each shape — this is
                      what makes the bulge readable in light mode, where the
                      card and the panel behind it are both white. */}
                  <div
                    className="hsk-cb-jump-goo"
                    style={{ filter: `url(#${gooId}) drop-shadow(0 -1px 2px rgba(0,0,0,.13))` }}
                  >
                    {/* Spans the full card width: the bump has to melt into the
                        card's whole top edge for the edge itself to look like
                        it is being raised. Kept shallow so it only covers the
                        card's top few pixels and never the send button. */}
                    <div className="hsk-cb-jump-seam" />
                    <div className={cn('hsk-cb-jump-bump', jumpAlert && 'hsk-cb-jump-bump--alert')} />
                  </div>
                  <button
                    type="button"
                    className={cn('hsk-cb-jump-bottom', jumpAlert && 'hsk-cb-jump-bottom--alert')}
                    onClick={jumpToBottom}
                    aria-label={t('jumpToLatest')}
                    title={t('jumpToLatest')}
                  >
                    <span className="hsk-cb-jump-arrow"><KikuGhost /></span>
                  </button>
                </div>
              )}

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
                <div className={cn("hsk-cb-input-box", chromeLoading && "hsk-cb-input-box--waiting")}>
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
                  {enableVoice && canConverse && (
                    <button
                      className={cn("hsk-cb-voice-mode-btn", voiceMode === 'converse' && "hsk-cb-voice-mode-btn--active")}
                      onClick={() => voiceMode === 'converse' ? stopVoice() : startVoice('converse')}
                      disabled={loading || chromeLoading || voiceBlocked}
                      aria-label={voiceMode === 'converse' ? t('voiceModeExit') : t('voiceModeStart')}
                      title={t('voiceModeStart')}
                    >
                      <WaveformIcon active={voiceMode === 'converse'} />
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
                        voice.active && voicePhase === 'listening' ? ''
                        : voicePhase === 'thinking' ? t('voiceSending')
                        : activePlaceholder
                      }
                      rows={1}
                      disabled={loading || chromeLoading}
                      aria-label={voice.active ? t('voiceListening') : undefined}
                    />
                    {voice.active && voicePhase === 'listening' && !input && <ListeningWave spectrumBins={voice.spectrumBins} micSpectrum={voice.micSpectrum} />}
                  </div>
                  {enableVoice && voice.supported && (
                    <button
                      className={cn(
                        "hsk-cb-mic-btn",
                        voiceMode === 'dictate' && voicePhase === 'listening' && "hsk-cb-mic-btn--listening",
                        voicePhase === 'thinking' && "hsk-cb-mic-btn--processing"
                      )}
                      onClick={() => voiceMode === 'off' ? startVoice('dictate') : stopVoice()}
                      disabled={loading || chromeLoading}
                      aria-label={voiceMode === 'off' ? 'Start voice input' : 'Stop recording'}
                      title={voiceMode === 'off' ? 'Voice input' : 'Stop'}
                    >
                      {voiceMode === 'off' ? <MicIcon /> : <MicOffIcon />}
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
                      disabled={chromeLoading || (!input.trim() && attachments.length === 0)}
                      aria-label="Send message"
                    >
                      <ArrowUpIcon />
                    </button>
                  )}
                </div>
              </div>
              {voiceBlocked ? (
                <div className="hsk-cb-voice-error" role="status">
                  {t('errAccountRequired')}
                </div>
              ) : voiceError && (
                <div className="hsk-cb-voice-error" role="status">
                  {t(voiceError as keyof typeof DEFAULT_UI_STRINGS)}
                </div>
              )}
              <div className="hsk-cb-hint">{shopperLanguage ? t('footerHint') : 'kiku · searches the whole catalogue in real time'}</div>
            </div>

        </div>{/* end .hsk-cb-main */}

        {/* Desktop only — CSS removes it below the breakpoint, where the
            jump-to-bottom pill is the only navigation affordance needed. */}
        <ConversationTimeline
          items={timelineItems}
          activeIdx={activeMsgIdx}
          progress={scrollProgress}
          onJump={jumpToMessage}
        />

        {/* Hands-free conversation. The transcript stays behind it, so the
            overlay is a mode of the same chat rather than a separate screen. */}
        {voiceMode === 'converse' && (
          <div className="hsk-voice-overlay" role="dialog" aria-label={t('voiceModeStart')}>
            {/* Same ground as the thread — voice mode covers the panel whole, so
                without this it is the one screen with a bare background. */}
            <KikuDoodles seed={(client as any)?.api?.siteId ?? ''} theme={hskThemeAttr} />

            <button
              className="hsk-voice-exit"
              onClick={stopVoice}
              aria-label={t('voiceModeExit')}
              title={t('voiceModeExit')}
            >
              <CloseIcon />
            </button>

            <div className="hsk-voice-picker" role="radiogroup" aria-label={t('voicePickerLabel')}>
              {LIVE_VOICES.map(v => (
                <button
                  key={v.name}
                  type="button"
                  role="radio"
                  aria-checked={liveVoiceName === v.name}
                  className={cn('hsk-voice-pill', liveVoiceName === v.name && 'hsk-voice-pill--on')}
                  onClick={() => chooseVoice(v.name)}
                >
                  <span className={cn('hsk-voice-pill-dot', `hsk-voice-pill-dot--${v.gender}`)} aria-hidden="true" />
                  {v.label}
                </button>
              ))}
            </div>

            {/* Only while an allowance is actually running. A shopper with no
                cap never sees a clock counting their conversation down. */}
            {voiceSecondsLeft !== null && (
              <div
                className={cn('hsk-voice-allowance', voiceSecondsLeft <= 5 && 'hsk-voice-allowance--low')}
                role="timer"
                aria-live="off"
              >
                {Math.max(0, Math.ceil(voiceSecondsLeft))}s
              </div>
            )}

            <div className={cn('hsk-voice-stage', voiceConnecting && 'hsk-voice-stage--connecting')}>
              <VoiceCanvas
                className="hsk-voice-canvas"
                phase={voicePhase}
                level={live.micLevel}
                spectrum={live.micSpectrum}
                bins={live.spectrumBins}
              />
            </div>

            {/* Said plainly, because the waveform alone cannot distinguish a
                mic that is open from one that is about to be. */}
            {voiceConnecting && (
              <div className="hsk-voice-connecting" role="status">
                <span className="hsk-voice-connecting-dot" />
                {t('voiceConnecting')}
              </div>
            )}

            {/* No phase label. The waveform already says whether anyone is
                talking, and naming the state was only ever narrating what the
                shopper can see. Announced for screen readers, not drawn. */}
            <div className="hsk-voice-caption" aria-live="polite">
              <span className="hsk-sr-only">
                {voiceMuted ? t('voiceMuted')
                  : voicePhase === 'speaking' ? t('voicePhaseSpeaking')
                  : voicePhase === 'thinking' ? t('voicePhaseThinking')
                  : t('voicePhaseListening')}
              </span>
              {voiceMuted && <span className="hsk-voice-heard">{t('voiceMutedHint')}</span>}
            </div>

            {/* What is being talked about. Hearing "the black sneakers are
                3,500" and having nothing to look at is the whole reason voice
                alone feels thin — these are the same entities the answer
                referenced, not a fresh search. */}
            {shownSources.length > 0 && (
              <div className="hsk-voice-items">
                {shownSources.slice(0, 4).map((src, i) => (
                  <button
                    key={src.id ?? i}
                    type="button"
                    className="hsk-voice-item"
                    style={{ animationDelay: `${i * 70}ms` }}
                    onClick={() => onSelectSource?.(src)}
                  >
                    {src.image
                      ? <img src={src.image} alt="" className="hsk-voice-item-img" loading="lazy" />
                      : <span className="hsk-voice-item-img hsk-voice-item-img--empty"><SparkleIcon /></span>}
                    <span className="hsk-voice-item-name">{src.name}</span>
                    {src.price && (
                      <span className="hsk-voice-item-price">
                        {src.currency ?? defaultCurrency}{' '}
                        {parseFloat(String(src.price).replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {voiceError && <div className="hsk-voice-error">{t(voiceError as keyof typeof DEFAULT_UI_STRINGS)}</div>}

            <div className="hsk-voice-controls">
              <button
                className={cn('hsk-voice-control', voiceMuted && 'hsk-voice-control--muted')}
                onClick={() => setVoiceMuted(m => !m)}
                aria-label={voiceMuted ? t('voicePhaseListening') : t('voiceModeExit')}
                title={voiceMuted ? t('voicePhaseListening') : t('voiceModeExit')}
              >
                {voiceMuted ? <MicOffIcon /> : <MicIcon />}
              </button>
            </div>
          </div>
        )}

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
  enableAudioResponse,
  ttsVoice,
  autoSpeakResponses,
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
          enableAudioResponse={enableAudioResponse}
          ttsVoice={ttsVoice}
          autoSpeakResponses={autoSpeakResponses}
        />,
        document.body
      )}
    </>
  );
}
