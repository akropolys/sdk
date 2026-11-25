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
}

// The stream flag is up from the moment of sending, so it cannot tell thinking from speaking:
// kiku thinks until the first visible words land, then speaks while they print.
export function avatarStateFor(s: AvatarSignals): KikuState {
  if (s.handoff) return 'handoff';
  if (s.listening) return 'listening';
  if ((s.busy || s.revealing) && s.visibleReply) return 'speaking';
  if (s.busy) return 'thinking';
  if (s.failed) return 'failed';
  return 'idle';
}
