/**
 * Rolling event log for the voice loop.
 *
 * SpeechRecognition is an asynchronous browser object living outside the floor
 * reducer, and Chrome does not guarantee that every start() is answered by an
 * onstart, or every stop() by an onend. When those two drift apart the symptom
 * is silent and indistinguishable from a working session: the reducer says
 * `listening`, the level meter animates off a separate getUserMedia stream, and
 * nothing is transcribed.
 *
 * This exists to prove or disprove that drift rather than reason about it. It
 * records what we ASKED the recogniser to do next to what the browser actually
 * reported back, so the divergence is visible in the order it happened.
 *
 * Cheap enough to leave on: a bounded array of small objects, no formatting
 * until something asks to read it.
 */

export interface VoiceLogEntry {
  t: number;
  /** 'call' = we asked the browser. 'event' = the browser told us. */
  kind: 'call' | 'event' | 'state' | 'warn';
  name: string;
  detail?: string;
}

const MAX = 500;
const buf: VoiceLogEntry[] = [];
let t0 = 0;

export function logVoice(kind: VoiceLogEntry['kind'], name: string, detail?: unknown): void {
  if (!t0) t0 = Date.now();
  buf.push({
    t: Date.now() - t0,
    kind,
    name,
    detail: detail === undefined ? undefined
      : typeof detail === 'string' ? detail
      : (() => { try { return JSON.stringify(detail); } catch { return String(detail); } })(),
  });
  if (buf.length > MAX) buf.shift();
}

export function voiceLogText(): string {
  return buf
    .map(e => {
      const ms = String(e.t).padStart(7, ' ');
      const tag = e.kind === 'call' ? '→' : e.kind === 'event' ? '←' : e.kind === 'warn' ? '!' : ' ';
      return `${ms}ms ${tag} ${e.name}${e.detail ? '  ' + e.detail : ''}`;
    })
    .join('\n');
}

/**
 * Pairs each start()/stop() with the browser event that answered it, so an
 * unanswered call — the exact shape of a dead recogniser — is called out
 * instead of having to be spotted by eye.
 */
export function voiceLogAudit(): string {
  const lines: string[] = [];
  let pendingStart: VoiceLogEntry | null = null;
  let pendingStop: VoiceLogEntry | null = null;
  for (const e of buf) {
    if (e.kind === 'call' && e.name === 'recognition.start') {
      if (pendingStart) lines.push(`${pendingStart.t}ms start() never answered by onstart — RECOGNISER LOST`);
      pendingStart = e;
    }
    if (e.kind === 'event' && e.name === 'onstart') pendingStart = null;
    if (e.kind === 'call' && e.name === 'recognition.stop') pendingStop = e;
    if (e.kind === 'event' && e.name === 'onend') pendingStop = null;
    if (e.kind === 'call' && e.name === 'recognition.start' && pendingStop) {
      lines.push(`${e.t}ms start() issued while a stop() was still unanswered — RACE`);
    }
  }
  if (pendingStart) lines.push(`${pendingStart.t}ms start() never answered by onstart — RECOGNISER LOST (still pending)`);
  return lines.length ? lines.join('\n') : 'no unanswered start()/stop() pairs';
}

export function voiceLogDownload(): void {
  if (typeof document === 'undefined') return;
  const body = `${voiceLogAudit()}\n\n---\n\n${voiceLogText()}`;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `kiku-voice-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function voiceLogClear(): void {
  buf.length = 0;
  t0 = 0;
}

// Reachable from the console without a build flag, because the failure it
// diagnoses shows up on someone else's laptop, not in a test.
if (typeof window !== 'undefined') {
  (window as any).__kikuVoice = {
    log: () => console.log(voiceLogText()),
    audit: () => console.log(voiceLogAudit()),
    text: voiceLogText,
    entries: () => buf.slice(),
    download: voiceLogDownload,
    clear: voiceLogClear,
  };
}
