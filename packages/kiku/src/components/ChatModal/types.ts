import React from 'react';
import type { AkropolysTheme, ChatSource } from '@akropolys/sdk';
import type { KikuButtonProps } from '../KikuButton';

export const DEFAULT_CHIPS: string[] = [];

export const LANGUAGE_CHOICES = [
  { value: 'English', native: 'English', tag: 'en', rtl: false },
  { value: 'Chinese', native: '中文', tag: 'zh', rtl: false },
  { value: 'Spanish', native: 'Español', tag: 'es', rtl: false },
  { value: 'Arabic', native: 'العربية', tag: 'ar', rtl: true },
  { value: 'Hindi', native: 'हिन्दी', tag: 'hi', rtl: false },
  { value: 'French', native: 'Français', tag: 'fr', rtl: false },
  { value: 'Swahili', native: 'Kiswahili', tag: 'sw', rtl: false },
  { value: 'Portuguese', native: 'Português', tag: 'pt', rtl: false },
  { value: 'Japanese', native: '日本語', tag: 'ja', rtl: false },
  { value: 'Urdu', native: 'اردو', tag: 'ur', rtl: true },
];

export function endonymFor(lang: string | null | undefined): string | undefined {
  if (!lang) return undefined;
  const typed = lang.trim();
  if (!typed) return undefined;
  const l = typed.toLowerCase();
  const hit = LANGUAGE_CHOICES.find(
    x => x.value.toLowerCase() === l || x.native.toLowerCase() === l || x.tag === l
  );
  return hit ? hit.native : typed;
}

export function isRTLText(s: string): boolean {
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x0590 && code <= 0x08ff) || // Hebrew, Arabic, Syriac, Arabic Supplement, Thaana, NKo, Samaritan, Mandaic, Arabic Extended-A
      (code >= 0xfb1d && code <= 0xfdff) || // Hebrew/Arabic presentation forms A
      (code >= 0xfe70 && code <= 0xfeff)    // Arabic presentation forms B
    ) {
      return true;
    }
  }
  return false;
}

export const LANGUAGE_METAS: Record<string, { preparing: string; changeLang: string; rtl?: boolean; endonym?: string }> = {
  english: { preparing: 'Preparing in English…', changeLang: 'Change language', endonym: 'English' },
  swahili: { preparing: 'Inatayarisha kwa Kiswahili…', changeLang: 'Badilisha lugha', endonym: 'Kiswahili' },
  french: { preparing: 'Configuration en français…', changeLang: 'Changer de langue', endonym: 'Français' },
  spanish: { preparing: 'Configurando en español…', changeLang: 'Cambiar idioma', endonym: 'Español' },
  arabic: { preparing: 'جارٍ الإعداد باللغة العربية…', changeLang: 'تغيير اللغة', rtl: true, endonym: 'العربية' },
  portuguese: { preparing: 'Configurando em português…', changeLang: 'Alterar idioma', endonym: 'Português' },
  hindi: { preparing: 'हिन्दी में तैयार किया जा रहा है…', changeLang: 'भाषा बदलें', endonym: 'हिन्दी' },
  chinese: { preparing: '正在准备中文环境…', changeLang: '更改语言', endonym: '中文' },
  urdu: { preparing: 'اردو میں تیاری جاری ہے…', changeLang: 'زبان تبدیل کریں', rtl: true, endonym: 'اردو' },
  japanese: { preparing: '日本語を設定中…', changeLang: '言語を変更', endonym: '日本語' },
  german: { preparing: 'Wird auf Deutsch eingerichtet…', changeLang: 'Sprache ändern', endonym: 'Deutsch' },
  italian: { preparing: 'Configurazione in italiano…', changeLang: 'Cambia lingua', endonym: 'Italiano' },
  russian: { preparing: 'Настройка на русском…', changeLang: 'Изменить язык', endonym: 'Русский' },
  korean: { preparing: '한국어로 설정 중…', changeLang: '언어 변경', endonym: '한국어' },
  turkish: { preparing: 'Türkçe olarak hazırlanıyor…', changeLang: 'Dili değiştir', endonym: 'Türkçe' },
  vietnamese: { preparing: 'Đang thiết lập bằng Tiếng Việt…', changeLang: 'Đổi ngôn ngữ', endonym: 'Tiếng Việt' },
  indonesian: { preparing: 'Menyiapkan dalam Bahasa Indonesia…', changeLang: 'Ubah bahasa', endonym: 'Bahasa Indonesia' },
  polish: { preparing: 'Przygotowywanie w języku polskim…', changeLang: 'Zmień język', endonym: 'Polski' },
  dutch: { preparing: 'Instellen in het Nederlands…', changeLang: 'Taal wijzigen', endonym: 'Nederlands' },
  thai: { preparing: 'กำลังตั้งค่าเป็นภาษาไทย…', changeLang: 'เปลี่ยนภาษา', endonym: 'ไทย' },
  bengali: { preparing: 'বাংলায় প্রস্তুত করা হচ্ছে…', changeLang: 'ভাষা পরিবর্তন করুন', endonym: 'বাংলা' },
  tamil: { preparing: 'தமிழில் தயார் செய்யப்படுகிறது…', changeLang: 'மொழியை மாற்றவும்', endonym: 'தமிழ்' },
  telugu: { preparing: 'తెలుగులో సిద్ధం చేస్తోంది…', changeLang: 'భాషను మార్చండి', endonym: 'తెలుగు' },
  persian: { preparing: 'در حال آماده‌سازی به زبان فارسی…', changeLang: 'تغییر زبان', rtl: true, endonym: 'فارسی' },
  farsi: { preparing: 'در حال آماده‌سازی به زبان فارسی…', changeLang: 'تغییر زبان', rtl: true, endonym: 'فارسی' },
  greek: { preparing: 'Ρύθμιση στα ελληνικά…', changeLang: 'Αλλαγή γλώσσας', endonym: 'Ελληνικά' },
  hebrew: { preparing: 'מגדיר בעברית…', changeLang: 'שנה שפה', rtl: true, endonym: 'עברית' },
  swedish: { preparing: 'Ställer in på svenska…', changeLang: 'Byt språk', endonym: 'Svenska' },
  kikuyu: { preparing: 'Gĩkũyũ gĩgĩthondekwo…', changeLang: 'Cenjia rũthiomi', endonym: 'Gĩkũyũ' },
  gikuyu: { preparing: 'Gĩkũyũ gĩgĩthondekwo…', changeLang: 'Cenjia rũthiomi', endonym: 'Gĩkũyũ' },
  akan: { preparing: 'Yɛresiesie wɔ Akan mu…', changeLang: 'Sesa kasa', endonym: 'Akan' },
  twi: { preparing: 'Yɛresiesie wɔ Twi mu…', changeLang: 'Sesa kasa', endonym: 'Twi' },
  yoruba: { preparing: 'Ngbaradi ni Èdè Yorùbá…', changeLang: 'Yi ede pada', endonym: 'Èdè Yorùbá' },
  amharic: { preparing: 'በአማርኛ በመዘጋጀት ላይ…', changeLang: 'ቋንቋ ቀይር', endonym: 'አማርኛ' },
  somali: { preparing: 'Diyaarinta af Soomaali…', changeLang: 'Beddel luqadda', endonym: 'Af-Soomaali' },
  hausa: { preparing: 'Shirya cikin Hausa…', changeLang: 'Canja harshe', endonym: 'Hausa' },
  zulu: { preparing: 'Ilungiselela ngesiZulu…', changeLang: 'Shintsha ulimi', endonym: 'isiZulu' },
  oromo: { preparing: 'Afaan Oromootiin qophaa\'aa jira…', changeLang: 'Afaan jijjiiri', endonym: 'Afaan Oromoo' },
  luganda: { preparing: 'Tuteekateeka mu Oluganda…', changeLang: 'Kyusa olulimi', endonym: 'Oluganda' },
};

function formatLangName(str: string): string {
  const trimmed = str.trim();
  if (!trimmed) return '…';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function getLoadingMeta(lang: string | null | undefined) {
  if (!lang) {
    return {
      nativeName: '…',
      preparing: 'Preparing…',
      changeLang: '←',
      rtl: false,
      known: true,
    };
  }
  const l = lang.trim().toLowerCase();
  const hit = Object.entries(LANGUAGE_METAS).find(
    ([k, v]) => k === l || v.endonym?.toLowerCase() === l || endonymFor(k)?.toLowerCase() === l
  );
  if (hit) {
    return {
      nativeName: hit[1].endonym || endonymFor(lang) || formatLangName(lang),
      preparing: hit[1].preparing,
      changeLang: hit[1].changeLang,
      rtl: !!hit[1].rtl || isRTLText(hit[1].preparing),
      known: true,
    };
  }
  const rawName = endonymFor(lang) || lang;
  const nativeName = formatLangName(rawName);
  const rtl = isRTLText(nativeName);
  return {
    nativeName,
    preparing: `Preparing in ${nativeName}…`,
    changeLang: rtl ? 'تغيير' : 'Change',
    rtl,
    known: false,
  };
}

export const LIVE_VOICES = [
  { name: 'Puck', label: 'Puck', gender: 'male' },
  { name: 'Charon', label: 'Charon', gender: 'male' },
  { name: 'Kore', label: 'Kore', gender: 'female' },
  { name: 'Aoede', label: 'Aoede', gender: 'female' },
] as const;

export type { VoicePhase } from '../../utils/voiceSession';

export const VOICE_STORAGE_KEY = 'hsk-live-voice';

export const DEFAULT_UI_STRINGS = {
  langPlaceholder: 'Type your preferred language…',
  nameStepTitle: 'Nice to meet you.',
  nameStepLead: 'I can search, visualize, or capture anything for you — on this site or any other.',
  nameStepAsk: 'What should I call you?',
  namePlaceholder: 'Type your name…',
  attachImage: 'Attach a photo',
  vizUnavailable: 'The preview could not be loaded.',
  vizDisclaimerImage: 'Generated using Artificial Intelligence — colours, size and placement may differ from the real product.',
  vizDisclaimerVideo: 'Generated using Artificial Intelligence — colours, size and movement may differ from the real product.',
  calcDisclaimer: 'This is a calculation from live figures, not a guarantee — the market can move against it.',
  staleTitle: 'No longer available',
  staleRemoved: '{title} has been removed and is no longer on offer.',
  staleUnavailable: '{title} is currently unavailable.',
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
  greetReturning: 'Hi, {name}.',
  greetReturningLead: 'What can I find for you today?',
  howShouldResultsLook: 'How should results look?',
  entityLangIntro: 'I reply in {lang}. Product names stay as this site lists them — the details can too, or be translated.',
  asWritten: 'As written',
  inLanguage: 'In {lang}',
  namesAsWritten: 'Details exactly as the site lists them.',
  detailsTranslated: 'Details translated. Numbers and links stay exactly as listed.',
  entityLangPlaceholder: 'Pick one of the two cards above…',
  termsStepTitle: 'Privacy & Terms of Use',
  termsStepSubtitle: 'Transparent, anonymous, and zero-PII by design.',
  termsPiiTitle: 'Zero PII Collection',
  termsPiiDesc: 'We never collect or store personal identifying information (no emails, phone numbers, or real-world identities) from your chats or voice sessions.',
  termsSessionTitle: 'Anonymous Session Tokens',
  termsSessionDesc: 'Your session uses an anonymous client-side token solely to maintain context. It is never linked to your real identity.',
  termsMemoryTitle: 'Ephemeral Chats vs. Mimi Vault',
  termsMemoryDesc: 'Regular chats are ephemeral — closing the tab or clicking "Clear Chat" terminates them forever. Items you save with "@kiku" are encrypted and can be unlocked at mimi.akropolys.cloud with your Secret Access Key.',
  termsCookieTitle: 'Host Website Telemetry',
  termsCookieDesc: 'The host website where Kiku is embedded may collect cookies and analytics per their own cookie policy, outside Kiku\'s control.',
  termsAgreeButton: 'Agree & Continue',
  termsAgreeCounting: 'Agree & Continue ({seconds}s)',
  termsPlaceholder: 'Please review and accept our Privacy & Terms above…',
  allSet: "You're all set, {name}.",
  replyingTranslated: 'Replying in {lang}, results translated too. Ask me anything.',
  replyingOriginal: 'Replying in {lang}, results as this site wrote them. Ask me anything.',
  defaultPlaceholder: 'Ask me anything…',
  footerHint: 'kiku · searches the whole catalogue in real time',
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
  voiceLimitReached: "You've used up today's voice time. It resets in a day — chat still works.",
  voiceSiteLimit: 'Voice is out of allowance on this site for now. Chat still works.',
  voicePickerLabel: 'Choose a voice',
  micNoSpeech: "Didn't catch anything. Try again, a little closer to the mic.",
  micFailed: "Couldn't hear that. Try again.",
  clearChat: 'Clear chat',
  thinking: 'Thinking',
  thoughtForSeconds: 'Thought for {duration}',
  thoughtProcess: 'Thought process',
  captureAndRemember: 'kiku — capture & remember',
  captureCurrentPage: 'Capture current page',
  captureAll: 'Capture all ({count})',
  whatHaveYouSaved: 'What have you saved?',
  deleteThis: 'Delete this',
  errShopperReplyLimit: "You've reached this site's reply limit for your account.",
  errAccessRevoked: 'Your access to the assistant has been revoked by the store.',
  errAccountRequired: 'Please create an account to continue using the chat assistant.',
  errStreamInterrupted: 'The reply was interrupted. Please try again.',
  errNetwork: "The assistant couldn't respond just now — please try again in a moment.",
  errGeneric: 'Something went wrong. Please try again.',
  vizWorking: 'Visualizing…',
  vizMarkEdit: 'Mark & edit',
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
  cardClickAnswer: 'The {name}',
  cardClickQuery: 'Tell me more about the {name}{price} — what are its key details, who is it best suited for, and what should I know?',
  displayCapture: 'capture {name}',
  displayCaptureAll: 'capture all ({count} items)',
  displayViewHistory: 'what have you saved?',
  displayDelete: 'delete this',
} as const;

export type UIStringKey = keyof typeof DEFAULT_UI_STRINGS;
export type Translate = (key: UIStringKey, vars?: Record<string, string>) => string;

export const UIStringsContext = React.createContext<Translate>(
  (key, vars) => {
    let s: string = DEFAULT_UI_STRINGS[key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }
);
export const useT = () => React.useContext(UIStringsContext);

export function extractName(raw: string): string | null {
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

export const SERVER_ERROR_STRINGS: Record<string, UIStringKey> = {
  shopper_reply_limit: 'errShopperReplyLimit',
  RATE_LIMIT_EXCEEDED: 'errShopperReplyLimit',
  access_revoked: 'errAccessRevoked',
  account_required: 'errAccountRequired',
  stream_interrupted: 'errStreamInterrupted',
};

export const TERMINAL_ERROR_CODES = new Set(['account_required', 'access_revoked', 'shopper_reply_limit', 'RATE_LIMIT_EXCEEDED']);

export const isTerminalError = (code: string | null | undefined): boolean =>
  Boolean(code && TERMINAL_ERROR_CODES.has(code));

export const getFriendlyError = (err: any, tr: Translate) => {
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

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('request failed')) {
    return tr('errNetwork');
  }

  if (str) {
    try { console.warn('[kiku] untranslated error:', str); } catch { /* no console */ }
  }
  return tr('errGeneric');
};

export const isSecureOrigin = () =>
  typeof window === 'undefined' || window.isSecureContext !== false;

export const KIKU_KEY_REVEAL_SECONDS = 15;

export interface ModalOrigin {
  x: number;
  y: number;
  r: number;
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  borderRadius?: number;
}

export interface ChatModalProps extends Pick<KikuButtonProps, 'title' | 'placeholder' | 'backdropColor' | 'backdropBlur' | 'onSelectSource' | 'defaultCurrency' | 'chips' | 'theme' | 'classNames' | 'enableVoice' | 'voiceLang' | 'enableVision' | 'visionCategoryHint' | 'enableAudioResponse' | 'ttsVoice' | 'autoSpeakResponses'> {
  theme?: 'light' | 'dark' | AkropolysTheme;
  classNames?: any;
  origin?: ModalOrigin | null;
  onClose: () => void;
}
