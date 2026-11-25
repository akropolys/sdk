import type { KikuState } from '../KikuAvatar';

export interface AvatarSignals {
  handoff: boolean;
  listening: boolean;
  // A turn is in flight: from send until the stream ends.
  busy: boolean;
  // Reply text is still on its way to the screen (streaming, or the paced reveal draining).
  revealing: boolean;
  // The reply has text the visitor can see, not only reasoning or tool markup.
  visibleReply: boolean;
  // The turn ended in an error or broke off mid-reply; a visitor's stop is not a failure.
  failed: boolean;
  // An image or video is being generated.
  visualizing?: boolean;
  // A photo is in the message box, not sent yet.
  attaching?: boolean;
  // For a short while after a finished reply: see afterReply.
  after?: 'guiding' | 'curious' | null;
  // Nothing has been said yet.
  empty?: boolean;
}

// The stream flag is up from the moment of sending, so it cannot tell thinking from speaking:
// kiku thinks until the first visible words land, then speaks while they print.
export function avatarStateFor(s: AvatarSignals): KikuState {
  if (s.handoff) return 'handoff';
  if (s.listening) return 'listening';
  if (s.visualizing) return 'visualizing';
  // A short reply can arrive whole before its first words are typed out: still thinking then.
  if (s.busy || s.revealing) return s.visibleReply ? 'speaking' : 'thinking';
  // The visitor moving on with a photo outranks a stale failure.
  if (s.attaching) return 'curious';
  if (s.failed) return 'failed';
  if (s.after) return s.after;
  return s.empty ? 'welcoming' : 'idle';
}

// A finished reply that put products or sources on screen has kiku point the visitor at them;
// one that ends on a question has kiku wait for the answer.
export function afterReply(shown: boolean, text: string): 'guiding' | 'curious' | null {
  return shown ? 'guiding' : /[?？]\s*$/.test(text) ? 'curious' : null;
}

// A short message of thanks or delight, in a few common languages; a long one is a new question.
export const pleased = (text: string) => text.length < 80 && PLEASED.test(text);
const PLEASED = /\b(thanks?|thank you|thx|ty|cheers|perfect|awesome|amazing|love (it|this|that)|merci|gracias|danke|grazie|obrigad[oa])\b|🙏|❤️|😊|😍|🥰|👍/i;
