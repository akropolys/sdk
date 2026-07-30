import React, { useState, useRef, useCallback, useEffect } from 'react';

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
 * VoiceButton — converts speech to text using the browser's free Web Speech API.
 * No API key, no backend call, no cost.
 *
 * @example
 * <VoiceButton onTranscript={(text) => setQuery(text)} />
 */
export function VoiceButton({
  onTranscript,
  onInterim,
  lang,
  className = '',
  disabled = false,
  onError,
}: VoiceButtonProps) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Resolved after mount, never during render: the server has no window, so
  // deciding at render time makes SSR and hydration disagree about the button.
  const [isSupported, setIsSupported] = useState(false);
  useEffect(() => {
    setIsSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }, []);

  const start = useCallback(() => {
    if (!isSupported || listening) return;

    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    // Never hardcode English: the page declares its language, the browser knows
    // the user's. A fixed 'en-US' transcribed every other language as gibberish.
    recognition.lang =
      lang || document.documentElement.lang || navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = (e: any) => {
      setListening(false);
      if (e?.error && e.error !== 'aborted') onError?.(e.error);
    };

    recognition.onresult = (e: any) => {
      const results = Array.from(e.results as any[]);
      const transcript = results.map((r: any) => r[0].transcript).join('');
      const isFinal = (e.results[e.results.length - 1] as any).isFinal;
      if (isFinal) {
        onTranscript(transcript);
        setListening(false);
      } else {
        onInterim?.(transcript);
      }
    };

    try {
      recognition.start();
    } catch {
      setListening(false);
      onError?.('failed-to-start');
    }
  }, [isSupported, listening, lang, onTranscript, onInterim, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // Silently render nothing if the browser doesn't support Web Speech API
  if (!isSupported) return null;

  return (
    <button
      type="button"
      className={`kiku-voice-btn${listening ? ' kiku-voice-btn--active' : ''} ${className}`}
      onClick={listening ? stop : start}
      disabled={disabled}
      title={listening ? 'Stop listening' : 'Speak your search'}
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
    >
      <MicIcon active={listening} />
      {listening && <span className="kiku-voice-ripple" aria-hidden="true" />}
    </button>
  );
}
