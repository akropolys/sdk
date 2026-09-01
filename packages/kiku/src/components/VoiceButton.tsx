import React, { useCallback, useEffect, useRef } from 'react';
import { useVoiceSession } from '../utils/voiceSession';

export interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  /** BCP-47 tag. Defaults to the page's <html lang>, then the browser language. */
  lang?: string;
  className?: string;
  disabled?: boolean;
  /** Raw SpeechRecognition error code — 'not-allowed', 'audio-capture', etc. */
  onError?: (code: string) => void;
}

const MicIcon = ({ active }: { active: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="11" rx="3" fill={active ? 'currentColor' : 'none'} />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

/**
 * VoiceButton — speech to text input with pause-based utterance detection.
 */
export function VoiceButton({
  onTranscript,
  onInterim,
  lang,
  className = '',
  disabled = false,
  onError,
}: VoiceButtonProps) {
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  const stopRef = useRef<() => void>(() => {});
  const handleUtterance = useCallback((text: string) => {
    stopRef.current();
    onTranscriptRef.current(text);
  }, []);

  const voice = useVoiceSession({ lang, onUtterance: handleUtterance, onError });
  useEffect(() => { stopRef.current = voice.stop; }, [voice.stop]);

  useEffect(() => {
    if (voice.interim) onInterim?.(voice.interim);
  }, [voice.interim, onInterim]);

  if (!voice.supported) return null;

  return (
    <button
      type="button"
      className={`kiku-voice-btn${voice.active ? ' kiku-voice-btn--active' : ''} ${className}`}
      onClick={() => (voice.active ? voice.stop() : void voice.start())}
      disabled={disabled}
      title={voice.active ? 'Stop listening' : 'Speak your search'}
      aria-label={voice.active ? 'Stop voice input' : 'Start voice input'}
    >
      <MicIcon active={voice.active} />
      {voice.active && <span className="kiku-voice-ripple" aria-hidden="true" />}
    </button>
  );
}
