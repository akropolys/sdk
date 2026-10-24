import React from 'react';
import type { AkropolysTheme, ChatSource, ChatAttachment } from '@akropolys/sdk';
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

export function endonymFor(lang: string | null | undefined, bcp47?: string | null): string | undefined {
  if (!lang) return undefined;
  const typed = lang.trim();
  if (!typed) return undefined;
  const l = typed.toLowerCase();
  const hit = LANGUAGE_CHOICES.find(
    x => x.value.toLowerCase() === l || x.native.toLowerCase() === l || x.tag === l
  );
  if (hit) return hit.native;
  if (LANGUAGE_METAS[l]?.endonym) return LANGUAGE_METAS[l].endonym;
  const byEndonym = Object.values(LANGUAGE_METAS).find(m => m.endonym?.toLowerCase() === l);
  if (byEndonym?.endonym) return byEndonym.endonym;

  const tag = bcp47 || (l.length <= 3 ? l : undefined);
  if (tag && typeof Intl !== 'undefined' && Intl.DisplayNames) {
    try {
      const dn = new Intl.DisplayNames([tag], { type: 'language' });
      const name = dn.of(tag);
      if (name && name.toLowerCase() !== tag.toLowerCase()) {
        return name;
      }
    } catch {  }
  }

  return typed;
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
  malay: { preparing: 'Menyediakan dalam Bahasa Melayu…', changeLang: 'Tukar bahasa', endonym: 'Bahasa Melayu' },
  bahasa: { preparing: 'Menyediakan dalam Bahasa Melayu…', changeLang: 'Tukar bahasa', endonym: 'Bahasa Melayu' },
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
  burmese: { preparing: 'မြန်မာဘာသာဖြင့် ပြင်ဆင်နေသည်…', changeLang: 'ဘာသာစကားပြောင်းရန်', endonym: 'မြန်မာဘာသာ' },
  burma: { preparing: 'မြန်မာဘာသာဖြင့် ပြင်ဆင်နေသည်…', changeLang: 'ဘာသာစကားပြောင်းရန်', endonym: 'မြန်မာဘာသာ' },
  myanmar: { preparing: 'မြန်မာဘာသာဖြင့် ပြင်ဆင်နေသည်…', changeLang: 'ဘာသာစကားပြောင်းရန်', endonym: 'မြန်မာဘာသာ' },
  khmer: { preparing: 'កំពុងរៀបចំជាភាសាខ្មែរ…', changeLang: 'ប្តូរភាសា', endonym: 'ភាសាខ្មែរ' },
  cambodian: { preparing: 'កំពុងរៀបចំជាភាសាខ្មែរ…', changeLang: 'ប្តូរភាសា', endonym: 'ភាសាខ្មែរ' },
  swedish: { preparing: 'Ställer in på svenska…', changeLang: 'Byt språk', endonym: 'Svenska' },
  svenska: { preparing: 'Ställer in på svenska…', changeLang: 'Byt språk', endonym: 'Svenska' },
  sv: { preparing: 'Ställer in på svenska…', changeLang: 'Byt språk', endonym: 'Svenska' },
  kikuyu: { preparing: 'Gĩkũyũ gĩgĩthondekwo…', changeLang: 'Cenjia rũthiomi', endonym: 'Gĩkũyũ' },
  gikuyu: { preparing: 'Gĩkũyũ gĩgĩthondekwo…', changeLang: 'Cenjia rũthiomi', endonym: 'Gĩkũyũ' },
  akan: { preparing: 'Yɛresiesie wɔ Akan mu…', changeLang: 'Sesa kasa', endonym: 'Akan' },
  twi: { preparing: 'Yɛresiesie wɔ Twi mu…', changeLang: 'Sesa kasa', endonym: 'Twi' },
  yoruba: { preparing: 'Ngbaradi ni Èdè Yorùbá…', changeLang: 'Yi ede pada', endonym: 'Èdè Yorùbá' },
  amharic: { preparing: 'በአማርኛ በመዘጋጀት ላይ…', changeLang: 'ቋንቋ ቀይር', endonym: 'አማርኛ' },
  somali: { preparing: 'Diyaarinta af Soomaali…', changeLang: 'Beddel luqadda', endonym: 'Af-Soomaali' },
  soomaali: { preparing: 'Diyaarinta af Soomaali…', changeLang: 'Beddel luqadda', endonym: 'Af-Soomaali' },
  'af-soomaali': { preparing: 'Diyaarinta af Soomaali…', changeLang: 'Beddel luqadda', endonym: 'Af-Soomaali' },
  so: { preparing: 'Diyaarinta af Soomaali…', changeLang: 'Beddel luqadda', endonym: 'Af-Soomaali' },
  hausa: { preparing: 'Shirya cikin Hausa…', changeLang: 'Canja harshe', endonym: 'Hausa' },
  zulu: { preparing: 'Ilungiselela ngesiZulu…', changeLang: 'Shintsha ulimi', endonym: 'isiZulu' },
  oromo: { preparing: 'Afaan Oromootiin qophaa\'aa jira…', changeLang: 'Afaan jijjiiri', endonym: 'Afaan Oromoo' },
  luganda: { preparing: 'Tuteekateeka mu Oluganda…', changeLang: 'Kyusa olulimi', endonym: 'Oluganda' },
  igbo: { preparing: 'Na-akwadebe na Asụsụ Igbo…', changeLang: 'Gbanwee asụsụ', endonym: 'Asụsụ Igbo' },
  xhosa: { preparing: 'Ilungiselela ngesiXhosa…', changeLang: 'Tshintsha ulwimi', endonym: 'isiXhosa' },
  kinyarwanda: { preparing: 'Guteza imbere mu Kinyarwanda…', changeLang: 'Hindura ururimi', endonym: 'Ikinyarwanda' },
  lingala: { preparing: 'Kozala na Lingála…', changeLang: 'Bongola lokótá', endonym: 'Lingála' },
  shona: { preparing: 'Kugadzirira mu chiShona…', changeLang: 'Chinja mutauro', endonym: 'chiShona' },
  tigrinya: { preparing: 'ብትግርኛ ኣብ ምድላው ይርከብ…', changeLang: 'ቋንቋ ምቕያር', endonym: 'ትግርኛ' },
  wolof: { preparing: 'Waajal ci Wolof…', changeLang: 'Soppi làkk', endonym: 'Wolof' },
  afrikaans: { preparing: 'Berei voor in Afrikaans…', changeLang: 'Verander taal', endonym: 'Afrikaans' },
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

// Gemini's prebuilt voices; Live accepts every one. Genders from Google's Chirp 3 HD voice list.
export const LIVE_VOICES = [
  { name: 'Puck', trait: 'Upbeat', gender: 'male' },
  { name: 'Charon', trait: 'Informative', gender: 'male' },
  { name: 'Kore', trait: 'Firm', gender: 'female' },
  { name: 'Aoede', trait: 'Breezy', gender: 'female' },
  { name: 'Zephyr', trait: 'Bright', gender: 'female' },
  { name: 'Fenrir', trait: 'Excitable', gender: 'male' },
  { name: 'Leda', trait: 'Youthful', gender: 'female' },
  { name: 'Orus', trait: 'Firm', gender: 'male' },
  { name: 'Callirrhoe', trait: 'Easy-going', gender: 'female' },
  { name: 'Autonoe', trait: 'Bright', gender: 'female' },
  { name: 'Enceladus', trait: 'Breathy', gender: 'male' },
  { name: 'Iapetus', trait: 'Clear', gender: 'male' },
  { name: 'Umbriel', trait: 'Easy-going', gender: 'male' },
  { name: 'Algieba', trait: 'Smooth', gender: 'male' },
  { name: 'Despina', trait: 'Smooth', gender: 'female' },
  { name: 'Erinome', trait: 'Clear', gender: 'female' },
  { name: 'Algenib', trait: 'Gravelly', gender: 'male' },
  { name: 'Rasalgethi', trait: 'Informative', gender: 'male' },
  { name: 'Laomedeia', trait: 'Upbeat', gender: 'female' },
  { name: 'Achernar', trait: 'Soft', gender: 'female' },
  { name: 'Alnilam', trait: 'Firm', gender: 'male' },
  { name: 'Schedar', trait: 'Even', gender: 'male' },
  { name: 'Gacrux', trait: 'Mature', gender: 'female' },
  { name: 'Pulcherrima', trait: 'Forward', gender: 'female' },
  { name: 'Achird', trait: 'Friendly', gender: 'male' },
  { name: 'Zubenelgenubi', trait: 'Casual', gender: 'male' },
  { name: 'Vindemiatrix', trait: 'Gentle', gender: 'female' },
  { name: 'Sadachbia', trait: 'Lively', gender: 'male' },
  { name: 'Sadaltager', trait: 'Knowledgeable', gender: 'male' },
  { name: 'Sulafat', trait: 'Warm', gender: 'female' },
] as const;

export type { VoicePhase } from '../../utils/voiceSession';

export const VOICE_STORAGE_KEY = 'hsk-live-voice';

export const ONBOARDING_UI_STRINGS: Record<string, string> = {
  langPlaceholder: "Type your language…",
  nameStepTitle: "Good to meet you.",
  nameStepAsk: "What should I call you?",
  namePlaceholder: "Type your name…",
  howShouldResultsLook: "How do you want to see results?",
  entityLangIntro: "I will write to you in {lang}. Names stay as this website wrote them. For the other details, choose below.",
  asWritten: "Same as the website",
  inLanguage: "In {lang}",
  namesAsWritten: "Details stay exactly as the website wrote them.",
  detailsTranslated: "Details are translated. Numbers and links do not change.",
  entityLangPlaceholder: "Choose one, then press Continue…",
  termsStepTitle: "Privacy and terms",
  termsStepSubtitle: "Please read how kiku works on this website.",
  termsPiiTitle: "Your contact details",
  termsPiiDesc: "kiku never asks for your email, phone number or real name. Any name or nickname is fine.",
  termsSessionTitle: "A random code",
  termsSessionDesc: "Your browser keeps a random code so kiku can remember your conversation. The code is not linked to your name.",
  termsMemoryTitle: "What is kept",
  termsMemoryDesc: "Chat messages aren't saved for analytics. Search-bar queries and usage counts help this website improve. If you ask to speak to its team, that support conversation is saved. Things you save with @kiku are kept at mimi.akropolys.cloud, and only your secret key opens them.",
  termsCookieTitle: "This website's own rules",
  termsCookieDesc: "This website may use cookies or collect more information. kiku does not control this.",
  termsAiTitle: "From this website, explained by AI",
  termsAiDesc: "kiku answers from what this website really lists. The facts are the website's own; how kiku summarises, compares or translates them is AI and may read them differently. Check anything that matters on the website itself.",
  termsAgreeButton: "I agree",
  termsAgreeCounting: "I agree ({seconds}s)",
  nameStepHint: "Any name or nickname is fine.",
  privacyMore: "Read our full terms at",
  continueButton: "Continue",
  termsPlaceholder: "Please read the notes above…",
  allSet: "You are ready, {name}.",
  replyingOriginal: "I will write to you in {lang}. Results stay as this website wrote them. Ask me anything.",
  replyingTranslated: "I will write to you in {lang}. Results will be translated too. Ask me anything.",
  greetReturning: "Hello, {name}.",
  greetReturningLead: "What can I find for you today?",
  defaultPlaceholder: "Ask me anything…",
};

export const DEFAULT_UI_STRINGS = {
  back: 'Back',
  langPlaceholder: "Type your language…",
  nameStepTitle: "Good to meet you.",
  nameStepAsk: "What should I call you?",
  namePlaceholder: "Type your name…",
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
  keySecretTitle: 'Your secret key — shown once',
  keyDismiss: 'Dismiss',
  keyCopySecret: 'Copy',
  keyCopied: 'Copied',
  keySecretHint: 'Keep it private. It unlocks your memory.',
  keyPublicTitle: 'Your public id',
  keyCopyId: 'Copy id',
  greetReturning: "Hello, {name}.",
  greetReturningLead: "What can I find for you today?",
  howShouldResultsLook: "How do you want to see results?",
  entityLangIntro: "I will write to you in {lang}. Names stay as this website wrote them. For the other details, choose below.",
  asWritten: "Same as the website",
  inLanguage: "In {lang}",
  namesAsWritten: "Details stay exactly as the website wrote them.",
  detailsTranslated: "Details are translated. Numbers and links do not change.",
  entityLangPlaceholder: "Choose one, then press Continue…",
  termsStepTitle: "Privacy and terms",
  termsStepSubtitle: "Please read how kiku works on this website.",
  termsPiiTitle: "Your contact details",
  termsPiiDesc: "kiku never asks for your email, phone number or real name. Any name or nickname is fine.",
  termsSessionTitle: "A random code",
  termsSessionDesc: "Your browser keeps a random code so kiku can remember your conversation. The code is not linked to your name.",
  termsMemoryTitle: "What is kept",
  termsMemoryDesc: "Chat messages aren't saved for analytics. Search-bar queries and usage counts help this website improve. If you ask to speak to its team, that support conversation is saved. Things you save with @kiku are kept at mimi.akropolys.cloud, and only your secret key opens them.",
  termsCookieTitle: "This website's own rules",
  termsCookieDesc: "This website may use cookies or collect more information. kiku does not control this.",
  termsAiTitle: "From this website, explained by AI",
  termsAiDesc: "kiku answers from what this website really lists. The facts are the website's own; how kiku summarises, compares or translates them is AI and may read them differently. Check anything that matters on the website itself.",
  termsAgreeButton: "I agree",
  termsAgreeCounting: "I agree ({seconds}s)",
  nameStepHint: "Any name or nickname is fine.",
  privacyMore: "Read our full terms at",
  continueButton: "Continue",
  termsPlaceholder: "Please read the notes above…",
  allSet: "You are ready, {name}.",
  replyingTranslated: "I will write to you in {lang}. Results will be translated too. Ask me anything.",
  replyingOriginal: "I will write to you in {lang}. Results stay as this website wrote them. Ask me anything.",
  defaultPlaceholder: "Ask me anything…",
  voiceListening: 'Listening… tap the mic to stop',
  voiceSending: 'Got it — sending…',
  voiceModeStart: 'Hands-free conversation',
  voiceModeExit: 'Leave hands-free',
  voicePhaseListening: 'Listening',
  voicePhaseThinking: 'Thinking',
  micDenied: 'Microphone blocked. Allow mic access for this site, then try again.',
  micInsecure: 'Voice needs a secure (https) connection.',
  micMissing: 'No microphone found.',
  micLangUnsupported: 'This browser cannot transcribe that language yet. Type instead.',
  micNetwork: "Couldn't reach voice. Try again in a moment.",
  voiceUnavailable: 'Voice is unavailable right now. Try again in a moment.',
  voiceLimitReached: "You've used up today's voice time. It resets in a day — chat still works.",
  voiceSiteLimit: 'Voice is out of allowance on this site for now. Chat still works.',
  voiceIdleEnded: 'Voice closed after a quiet minute. Tap the mic to talk again.',
  voiceSessionEnded: 'Voice session ended. Tap the mic to talk again.',
  voicePhotoFailed: "That photo couldn't be added. Try another one.",
  voiceAttachPhoto: 'Attach a photo',
  voicePickerLabel: 'Choose a voice',
  voiceFemale: 'Female',
  voiceMale: 'Male',
  voiceNewChat: 'New voice chat',
  pillVoice: '{n} min voice',
  pillImages: '{n} images',
  pillVideos: '{n} videos',
  pillReplies: '{n} replies',
  micNoSpeech: "Didn't catch anything. Try again, a little closer to the mic.",
  micFailed: "Couldn't hear that. Try again.",
  clearChat: 'Clear chat',
  thinking: 'Thinking',
  thoughtForSeconds: 'Thought for {duration}',
  thoughtProcess: 'Thought process',
  reachingTeam: 'Getting a person',
  passedToTeam: 'Passed to a person',
  withTeam: 'Sent to the team · a person will reply here',
  repliedIn: 'Replied in {duration}',
  backWithKiku: 'Kiku is back with you',
  teamClosed: 'The team closed this conversation',
  teamJoined: 'Another team member joined the conversation',
  leaveHumanWarning: 'A person is replying here.',
  leaveHumanStay: 'Wait',
  leaveHumanKeep: 'Keep for later',
  leaveHumanConfirm: 'End request',
  requestsTitle: 'Your requests',
  requestWaiting: 'Waiting for a person',
  requestHuman: 'With a person',
  requestKiku: 'Answered',
  requestClosed: 'Closed',
  requestNewReply: 'New reply',
  captureAndRemember: 'kiku — capture & remember',
  captureCurrentPage: 'Capture current page',
  captureAll: 'Capture all ({count})',
  whatHaveYouSaved: 'What have you saved?',
  deleteThis: 'Delete this',
  errShopperReplyLimit: "You've reached this site's reply limit. It resets in 24 hours.",
  errAccessRevoked: 'Your access to the assistant has been revoked on this website.',
  errAccountRequired: 'Please create an account to continue using the chat assistant.',
  errStreamInterrupted: 'The reply was interrupted. Please try again.',
  errNetwork: "The assistant couldn't respond just now — please try again in a moment.",
  errGeneric: 'Something went wrong. Please try again.',
  vizWorking: 'Visualizing…',
  vizMarkEdit: 'Mark & edit',
  swatchTarget: 'Your colour',
  markupCancel: 'Cancel',
  markupSketch: 'Sketch',
  markupPin: 'Edit Pin',
  markupPinLabel: 'What should happen here?',
  markupPinLabelHint: 'e.g. move the sofa here',
  markupSketchHint: 'Sketch around an area, then drop a pin saying what to do with it.',
  markupRemovePin: 'Remove pin',
  markupPinHint: 'Drop a pin and say what should happen there. Drag to move it. Up to 4 pins.',
  markupSelect: 'Select outline',
  markupCloseOutline: 'Close outline',
  markupOutlineHint: 'Tap around the item, then close the outline. Undo removes the last point.',
  markupSelectedHint: 'Drag the outline points to refine, then drop a pin saying what to do with it.',
  markupEraser: 'Eraser',
  markupUndo: 'Undo',
  markupClear: 'Clear',
  markupSend: 'Send',
  markupDialogLabel: 'Mark up image',
  markupError: "Couldn't process this image — try a newer visualization.",
  markupLoadError: "This image can't be edited here.",
  markupLoading: 'Loading image…',
  openMemory: 'Open my memory on MiMi',
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
  cardClickQuery: 'Tell me more about the {name}{details} — what are its key details, who is it best suited for, and what should I know?',
  displayCapture: 'capture {name}',
  displayCaptureAll: 'capture all ({count} items)',
  displayViewHistory: 'what have you saved?',
  displayDelete: 'delete this',
  retry: 'Retry',
  edit: 'Edit',
  copy: 'Copy',
  copied: 'Copied',
  msgFailed: 'Failed to send',
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
}

export interface ChatModalProps extends Pick<KikuButtonProps, 'title' | 'logo' | 'placeholder' | 'backdropColor' | 'backdropBlur' | 'onSelectSource' | 'chips' | 'theme' | 'classNames' | 'enableVoice' | 'voiceLang' | 'enableVision' | 'ttsVoice'> {
  theme?: 'light' | 'dark' | AkropolysTheme;
  classNames?: any;
  origin?: ModalOrigin | null;
  onClose: () => void;
}

// A photo in the composer shows at once from its file; data fills in when the sending copy is ready.
export type ComposerAttachment = ChatAttachment & { thumb?: string };
