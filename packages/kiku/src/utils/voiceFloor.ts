import type { VoicePhase } from './voiceSession';

/**
 * Who holds the conversational floor.
 *
 * One owner, one writer. Every other part of the voice loop — recognition, the
 * watchdog, the chat stream, TTS, the error handler — dispatches an event and
 * accepts the answer. None of them set the state directly, which is what
 * previously made the floor a race: five independent writers, last one wins,
 * and the loser's intent silently discarded.
 *
 * `preparing` is the state that did not exist before and had to. Between the
 * reply finishing and audio actually playing there is a network round trip to
 * /speech plus a decode — hundreds of milliseconds during which the loop was
 * nominally 'thinking' and a 400ms watchdog could hand the floor back and
 * reopen the microphone into audio that was about to start. Naming the gap
 * turns "what happens if they speak now" from a race into a transition.
 */
export type FloorState =
  | 'idle'
  | 'listening'
  | 'committing'
  | 'thinking'
  | 'preparing'
  | 'speaking';

export type VoiceMode = 'off' | 'dictate' | 'converse';

export type FloorEvent =
  /** Shopper opened voice mode. */
  | { type: 'START'; mode: Exclude<VoiceMode, 'off'> }
  /** Shopper closed it, or it was closed for them. */
  | { type: 'STOP' }
  /** Endpointing fired: an utterance is being sent. */
  | { type: 'UTTERANCE' }
  /** The reply finished. `willSpeak` false means nothing is going to be read. */
  | { type: 'REPLY_DONE'; willSpeak: boolean }
  /** Audio is actually playing, not merely requested. */
  | { type: 'AUDIO_PLAYING' }
  /** Playback ended, failed, or was refused. */
  | { type: 'AUDIO_ENDED' }
  /** Confirmed interruption — the shopper is talking over the answer. */
  | { type: 'BARGE_IN' }
  /** A refusal no amount of retrying will clear. */
  | { type: 'TERMINAL' }
  /** Nothing settled in time; recover rather than hang with the mic shut. */
  | { type: 'WATCHDOG' };

export interface Floor {
  state: FloorState;
  mode: VoiceMode;
  /**
   * Increments every time the floor changes hands. Async work captures the
   * value it started under and drops its result if the turn has moved on —
   * the same guard `tts.ts` already applies to playback, generalised so a
   * stale CHAT callback cannot land on a live turn either.
   */
  turn: number;
}

export const initialFloor: Floor = { state: 'idle', mode: 'off', turn: 0 };

/** Where the floor returns to when the assistant is done holding it. */
const handBack = (mode: VoiceMode): FloorState =>
  mode === 'converse' ? 'listening' : 'idle';

export function floorReducer(f: Floor, e: FloorEvent): Floor {
  switch (e.type) {
    case 'START':
      return { state: 'listening', mode: e.mode, turn: f.turn + 1 };

    case 'STOP':
      return { state: 'idle', mode: 'off', turn: f.turn + 1 };

    // A terminal refusal ends the session outright. Handing back to
    // 'listening' is what let an unsigned shopper keep talking into a wall.
    case 'TERMINAL':
      return { state: 'idle', mode: 'off', turn: f.turn + 1 };

    case 'UTTERANCE':
      // Only from 'listening'. A late utterance from a torn-down recogniser
      // must not drag the floor back out of speaking.
      if (f.state !== 'listening') return f;
      return { state: 'committing', mode: f.mode, turn: f.turn + 1 };

    case 'REPLY_DONE':
      if (f.state !== 'committing' && f.state !== 'thinking') return f;
      if (!e.willSpeak) return { ...f, state: handBack(f.mode) };
      return { ...f, state: 'preparing' };

    case 'AUDIO_PLAYING':
      // Late audio for a turn that has already been interrupted or ended must
      // not silently reclaim the floor.
      if (f.state !== 'preparing') return f;
      return { ...f, state: 'speaking' };

    case 'AUDIO_ENDED':
      if (f.state !== 'speaking' && f.state !== 'preparing') return f;
      return { ...f, state: handBack(f.mode) };

    case 'BARGE_IN':
      // Valid the moment audio is committed to, not just once it is audible:
      // the shopper can cut in during the /speech round trip.
      if (f.state !== 'speaking' && f.state !== 'preparing') return f;
      return { state: 'listening', mode: f.mode, turn: f.turn + 1 };

    case 'WATCHDOG':
      // Last resort. Only rescues the states that wait on something external;
      // 'listening' and 'idle' are waiting on a person and never time out.
      if (f.state === 'committing' || f.state === 'thinking' || f.state === 'preparing') {
        return { ...f, state: handBack(f.mode), turn: f.turn + 1 };
      }
      return f;

    default:
      return f;
  }
}

/**
 * The four names the interface has always rendered. The extra states are an
 * internal distinction — the shopper cannot tell "composing a request for
 * audio" from "waiting for an answer", and both should read as thinking.
 */
export function uiPhase(s: FloorState): VoicePhase {
  switch (s) {
    case 'committing':
    case 'thinking':
    case 'preparing':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'listening':
      return 'listening';
    default:
      return 'idle';
  }
}

/**
 * Whether the microphone must be held shut. Everything from the moment an
 * utterance is committed through the end of playback: recognition left running
 * across that span transcribes the assistant's own answer back as the next
 * question.
 */
export function micPaused(s: FloorState): boolean {
  return s === 'committing' || s === 'thinking' || s === 'preparing' || s === 'speaking';
}
