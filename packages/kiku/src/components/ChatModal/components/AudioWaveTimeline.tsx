import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { cn } from '../../../utils/cn';

export interface AudioExchangeItem {
  idx: number;
  text?: string;
  audioUrl?: string;
  assistantAudioUrl?: string;
  assistantIdx?: number;
  duration?: number;
  spoken?: boolean;
}

export interface AudioWaveTimelineProps {
  items: AudioExchangeItem[];
  activeIdx: number;
  progress: number;
  onJump: (idx: number) => void;
  side?: 'left' | 'right';
  voiceMuted?: boolean;
  setVoiceMuted?: (muted: boolean) => void;
  voiceMode?: string;
  voicePhase?: string;
  live?: {
    state: string;
    micLevel: () => number;
  };
}

const CENTER_X = 14;
const SVG_WIDTH = 28;
const BAR_SPACING = 4; // px vertical interval between bars
const BASE_PX_PER_SEC = 10; // px per second of dialogue
const MIN_EXCHANGE_HEIGHT = 32; // px minimum height per exchange
const MAX_TOTAL_HEIGHT = 420;

function pseudoNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function AudioWaveTimeline({
  items,
  activeIdx,
  progress,
  onJump,
  side = 'right',
  voiceMuted = false,
  setVoiceMuted,
  voiceMode = 'off',
  voicePhase = 'idle',
  live,
}: AudioWaveTimelineProps) {
  const containerRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playingItemIdx, setPlayingItemIdx] = useState<number | null>(null);
  const [replayProgress, setReplayProgress] = useState(0); // 0.0 to 1.0
  const [liveSecs, setLiveSecs] = useState(0);
  const [liveVolume, setLiveVolume] = useState(0);

  const wasMutedRef = useRef(voiceMuted);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  const isLiveActive = voiceMode !== 'off';
  const isVoiceActive = isLiveActive && (voicePhase === 'speaking' || voicePhase === 'listening');

  // Real-time growth only while active speech/voice interaction is occurring
  useEffect(() => {
    if (!isVoiceActive) {
      setLiveVolume(0);
      return;
    }

    const interval = setInterval(() => {
      setLiveSecs((prev) => prev + 0.1);
      if (live?.micLevel) {
        setLiveVolume(live.micLevel());
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isVoiceActive, live]);

  // When a new conversation exchange arrives, reset live growth accumulator
  useEffect(() => {
    setLiveSecs(0);
  }, [items.length]);

  // Calculate layout heights per exchange along the vertical wave track
  const exchangeLayout = useMemo(() => {
    let accumulatedY = 0;
    const segments = items.map((item, i) => {
      const dur = item.duration && item.duration > 0 ? item.duration : 3.0;
      const h = Math.max(MIN_EXCHANGE_HEIGHT, dur * BASE_PX_PER_SEC);
      const startY = accumulatedY;
      accumulatedY += h;
      return { index: i, startY, height: h, endY: accumulatedY, item };
    });

    const liveHeight = isVoiceActive ? Math.min(80, Math.max(12, liveSecs * BASE_PX_PER_SEC)) : 0;
    const totalHeight = Math.max(40, accumulatedY + liveHeight);

    return {
      segments,
      totalHeight: Math.min(MAX_TOTAL_HEIGHT, totalHeight),
      rawHeight: totalHeight,
    };
  }, [items, isVoiceActive, liveSecs]);

  // Generate discrete, elegant horizontal audio bars along the vertical spine
  const waveBars = useMemo(() => {
    const totalH = exchangeLayout.rawHeight;
    const bars: Array<{ y: number; halfW: number; segmentIdx: number }> = [];
    const numBars = Math.floor(totalH / BAR_SPACING);

    for (let i = 0; i < numBars; i++) {
      const y = (i + 1) * BAR_SPACING;
      const noise = pseudoNoise(i * 1.414);
      const vocalRhythm = (Math.sin(y * 0.11) * 0.5 + 0.5) * (Math.sin(y * 0.035 + 0.7) * 0.35 + 0.65);

      // Width ranges from 4px minimum to 20px maximum (halfW 2px to 10px)
      let halfW = 2.0 + vocalRhythm * (3.5 + noise * 4.5);

      // Live recording responsiveness at the bottom
      const isTip = isVoiceActive && y > totalH - 20;
      if (isTip && liveVolume > 0.02) {
        halfW += liveVolume * 7;
      }
      halfW = Math.min(10.5, Math.max(1.8, halfW));

      const seg = exchangeLayout.segments.find((s) => y >= s.startY && y <= s.endY);
      const segmentIdx = seg ? seg.index : exchangeLayout.segments.length - 1;

      bars.push({ y, halfW, segmentIdx });
    }

    return bars;
  }, [exchangeLayout, isVoiceActive, liveVolume]);

  // Audio play helper
  const playAudioUrl = useCallback((url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const a = audioRef.current;
      a.src = url;
      a.onended = () => resolve(true);
      a.onerror = () => resolve(false);
      a.play().catch(() => resolve(false));
    });
  }, []);

  // Sequential replay through conversation
  const playTurn = useCallback(
    async (itemIdx: number, part: 'user' | 'assistant' = 'user') => {
      if (!isPlayingRef.current || itemIdx >= items.length) {
        setIsPlaying(false);
        setPlayingItemIdx(null);
        setReplayProgress(1);
        if (setVoiceMuted) setVoiceMuted(wasMutedRef.current);
        return;
      }

      setPlayingItemIdx(itemIdx);
      const it = items[itemIdx];
      const seg = exchangeLayout.segments[itemIdx];

      if (part === 'user') {
        onJump(it.idx);
        if (seg) {
          setReplayProgress(seg.startY / exchangeLayout.totalHeight);
        }
        if (it.audioUrl) {
          await playAudioUrl(it.audioUrl);
        } else if (it.text && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          await new Promise((res) => {
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance(it.text || '');
            utt.onend = () => res(true);
            utt.onerror = () => res(false);
            window.speechSynthesis.speak(utt);
          });
        } else {
          await new Promise((res) => setTimeout(res, 600));
        }

        if (!isPlayingRef.current) return;

        if (it.assistantIdx != null || it.assistantAudioUrl) {
          await playTurn(itemIdx, 'assistant');
        } else {
          await playTurn(itemIdx + 1, 'user');
        }
      } else {
        if (it.assistantIdx != null) onJump(it.assistantIdx);
        if (seg) {
          setReplayProgress((seg.startY + seg.height * 0.5) / exchangeLayout.totalHeight);
        }
        if (it.assistantAudioUrl) {
          await playAudioUrl(it.assistantAudioUrl);
        } else {
          await new Promise((res) => setTimeout(res, 600));
        }

        if (!isPlayingRef.current) return;
        await playTurn(itemIdx + 1, 'user');
      }
    },
    [items, exchangeLayout, onJump, playAudioUrl, setVoiceMuted]
  );

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      setPlayingItemIdx(null);
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (setVoiceMuted) setVoiceMuted(wasMutedRef.current);
    } else {
      if (setVoiceMuted) {
        wasMutedRef.current = voiceMuted;
        setVoiceMuted(true);
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      setReplayProgress(0);
      void playTurn(0, 'user');
    }
  }, [isPlaying, voiceMuted, setVoiceMuted, playTurn]);

  // Click on the wave to scrub / jump directly
  const handleWaveClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const ratio = clickY / rect.height;

      const targetY = ratio * exchangeLayout.totalHeight;
      const hit =
        exchangeLayout.segments.find((s) => targetY >= s.startY && targetY <= s.endY) ||
        exchangeLayout.segments[0];

      if (!hit) return;

      onJump(hit.item.idx);

      if (setVoiceMuted) {
        wasMutedRef.current = voiceMuted;
        setVoiceMuted(true);
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      setReplayProgress(ratio);
      void playTurn(hit.index, 'user');
    },
    [exchangeLayout, onJump, setVoiceMuted, voiceMuted, playTurn]
  );

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (isPlayingRef.current && setVoiceMuted) {
        setVoiceMuted(wasMutedRef.current);
      }
    };
  }, [setVoiceMuted]);

  if (items.length === 0 && !isVoiceActive) return null;

  const playCursorY = replayProgress * exchangeLayout.totalHeight;

  return (
    <nav
      ref={containerRef}
      className={cn(
        'hsk-cb-cont-wave-rail',
        side === 'left' ? 'hsk-cb-cont-wave-rail--left' : 'hsk-cb-cont-wave-rail--right',
        isPlaying && 'is-playing'
      )}
      aria-label="Conversation Audio Waveform"
    >
      {/* Sleek Play/Pause Replay Trigger */}
      <button
        type="button"
        className={cn('hsk-cb-cont-wave-btn', isPlaying && 'is-playing')}
        onClick={handleTogglePlay}
        aria-label={isPlaying ? 'Pause conversation replay' : 'Replay conversation audio'}
        title={isPlaying ? 'Pause replay (microphone muted)' : 'Replay conversation audio'}
      >
        {isPlaying ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="4" width="4.5" height="16" rx="1.5" />
            <rect x="14.5" y="4" width="4.5" height="16" rx="1.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 1 }}>
            <path d="M7 4.5v15l12-7.5-12-7.5z" />
          </svg>
        )}
      </button>

      {/* Discrete Audio Bars Waveform Track */}
      <div
        className="hsk-cb-cont-wave-track"
        style={{ height: `${exchangeLayout.totalHeight}px` }}
        onClick={handleWaveClick}
        role="button"
        tabIndex={0}
        aria-label="Audio waveform. Click anywhere to scrub and play."
        title="Continuous conversation wave. Click anywhere to scrub."
      >
        <svg
          className={cn('hsk-cb-cont-wave-svg', isPlaying && 'is-playing')}
          width={SVG_WIDTH}
          height={exchangeLayout.totalHeight}
          viewBox={`0 0 ${SVG_WIDTH} ${exchangeLayout.totalHeight}`}
          aria-hidden="true"
        >
          {/* Subtle Center Hairline Spine */}
          <line
            x1={CENTER_X}
            y1={0}
            x2={CENTER_X}
            y2={exchangeLayout.totalHeight}
            stroke="var(--hsk-chat-divide, rgba(255,255,255,0.08))"
            strokeWidth="1"
            strokeDasharray="2 3"
          />

          {/* Clean Horizontal Audio Wave Bars */}
          {waveBars.map((bar, i) => {
            const isPlayed = isPlaying && bar.y <= playCursorY;
            return (
              <line
                key={i}
                x1={CENTER_X - bar.halfW}
                y1={bar.y}
                x2={CENTER_X + bar.halfW}
                y2={bar.y}
                stroke={isPlayed ? 'var(--hsk-primary, #ff6a33)' : 'var(--hsk-chat-muted, #71717a)'}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={isPlayed ? 0.95 : 0.35}
                className="hsk-wave-bar"
              />
            );
          })}

          {/* Turn divider notch dots */}
          {exchangeLayout.segments.map((seg, i) => (
            <circle
              key={`seg-${i}`}
              cx={CENTER_X}
              cy={seg.startY}
              r={playingItemIdx === i ? 2 : 1.2}
              fill={playingItemIdx === i ? 'var(--hsk-primary, #ff6a33)' : 'var(--hsk-chat-muted, #71717a)'}
              opacity={0.6}
            />
          ))}
        </svg>

        {/* Replay Scrubbing Head */}
        {isPlaying && (
          <div
            className="hsk-cb-cont-wave-cursor"
            style={{ transform: `translateY(${playCursorY}px)` }}
            aria-hidden="true"
          />
        )}

        {/* Live Recording Tip: pulses only during active speech */}
        {isVoiceActive && (
          <div
            className="hsk-cb-cont-wave-live-tip is-active"
            style={{
              transform: `translateY(${exchangeLayout.totalHeight - 3}px)`,
              '--hsk-tip-scale': 1 + liveVolume * 1.5,
            } as React.CSSProperties}
            title="Recording audio in real time"
            aria-hidden="true"
          >
            <span className="hsk-cb-live-tip-dot" />
            <span className="hsk-cb-live-tip-ping" />
          </div>
        )}
      </div>

      {/* Subdued mic muted badge when replaying */}
      {isPlaying && (
        <span className="hsk-cb-cont-wave-muted" title="Microphone is muted while replaying">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </span>
      )}
    </nav>
  );
}
