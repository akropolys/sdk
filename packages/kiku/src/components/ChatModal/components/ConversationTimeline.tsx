import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { cn } from '../../../utils/cn';

export interface TimelineExchangeItem {
  idx: number;
  text?: string;
  audioUrl?: string;
  assistantAudioUrl?: string;
  assistantIdx?: number;
  duration?: number;
  spoken?: boolean;
}

export interface ConversationTimelineProps {
  items: TimelineExchangeItem[];
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

const CENTER_X = 18;
const SVG_WIDTH = 36;
const BASE_PX_PER_SEC = 14; // pixels per second of speech
const MIN_EXCHANGE_HEIGHT = 44; // minimum height per exchange in px
const MAX_TOTAL_HEIGHT = 480;

// Deterministic pseudo-random generator based on index to keep wave shape consistent
function pseudoNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function ConversationTimeline({
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
}: ConversationTimelineProps) {
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

  // Live real-time growth while interaction is happening
  useEffect(() => {
    if (!isLiveActive) {
      setLiveSecs(0);
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
  }, [isLiveActive, live]);

  // When a new item completes, reset live extra counter
  useEffect(() => {
    setLiveSecs(0);
  }, [items.length]);

  // Calculate layout heights for each exchange along the continuous wave
  const exchangeLayout = useMemo(() => {
    let accumulatedY = 0;
    const segments = items.map((item, i) => {
      const dur = item.duration && item.duration > 0 ? item.duration : 3.5;
      const h = Math.max(MIN_EXCHANGE_HEIGHT, dur * BASE_PX_PER_SEC);
      const startY = accumulatedY;
      accumulatedY += h;
      return { index: i, startY, height: h, endY: accumulatedY, item };
    });

    const liveHeight = isLiveActive ? Math.min(120, Math.max(20, liveSecs * BASE_PX_PER_SEC)) : 0;
    const totalHeight = Math.max(60, accumulatedY + liveHeight);

    return { segments, totalHeight: Math.min(MAX_TOTAL_HEIGHT, totalHeight), rawHeight: totalHeight };
  }, [items, isLiveActive, liveSecs]);

  // Generate the continuous wave SVG paths (Left envelope, Right envelope, Center spine)
  const waveSvg = useMemo(() => {
    const totalH = exchangeLayout.rawHeight;
    const step = 3; // sample every 3px
    const numPoints = Math.ceil(totalH / step) + 1;

    let leftPath = `M ${CENTER_X} 0`;
    let rightPath = `M ${CENTER_X} 0`;
    const ribs: Array<{ y: number; x1: number; x2: number; amp: number }> = [];

    for (let i = 0; i <= numPoints; i++) {
      const y = Math.min(totalH, i * step);
      const isNearEnd = isLiveActive && y > totalH - 30;
      const noise = pseudoNoise(i * 0.45);

      // Amplitude profile: undulating wave with organic vocal rhythms
      const vocalRhythm = (Math.sin(y * 0.08) * 0.5 + 0.5) * (Math.cos(y * 0.03) * 0.4 + 0.6);
      let amp = 3 + vocalRhythm * (5 + noise * 6);

      if (isNearEnd && liveVolume > 0.02) {
        amp += liveVolume * 10;
      }
      amp = Math.min(15, Math.max(2, amp));

      const xLeft = CENTER_X - amp;
      const xRight = CENTER_X + amp;

      leftPath += ` L ${xLeft.toFixed(1)} ${y.toFixed(1)}`;
      rightPath += ` L ${xRight.toFixed(1)} ${y.toFixed(1)}`;

      // Record horizontal waveform ribs every 6px
      if (i % 2 === 0 && y > 2 && y < totalH - 2) {
        ribs.push({ y, x1: xLeft, x2: xRight, amp });
      }
    }

    // Close the continuous ribbon path
    const ribbonPath = `${leftPath} L ${CENTER_X} ${totalH.toFixed(1)} ${rightPath} Z`;

    return { ribbonPath, ribs, height: totalH };
  }, [exchangeLayout.rawHeight, isLiveActive, liveVolume]);

  // Audio play helper
  const playAudioUrl = useCallback((url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const a = audioRef.current;
      a.src = url;
      a.ontimeupdate = () => {
        if (a.duration && a.duration > 0) {
          // Progress within current turn
        }
      };
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
          await new Promise((res) => setTimeout(res, 800));
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
          await new Promise((res) => setTimeout(res, 800));
        }

        if (!isPlayingRef.current) return;
        await playTurn(itemIdx + 1, 'user');
      }
    },
    [items, exchangeLayout, onJump, playAudioUrl, setVoiceMuted]
  );

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      // Pause
      setIsPlaying(false);
      setPlayingItemIdx(null);
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (setVoiceMuted) setVoiceMuted(wasMutedRef.current);
    } else {
      // Start replay: mute microphone
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

  // Click on the wave to scrub / jump directly to that point
  const handleWaveClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const ratio = clickY / rect.height;

      // Find corresponding segment
      const targetY = ratio * exchangeLayout.totalHeight;
      const hit = exchangeLayout.segments.find(
        (s) => targetY >= s.startY && targetY <= s.endY
      ) || exchangeLayout.segments[0];

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

  // Cleanup on unmount
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

  // If there are no items and no active voice recording, don't show
  if (items.length === 0 && !isLiveActive) return null;

  const playCursorY = replayProgress * exchangeLayout.totalHeight;

  return (
    <nav
      ref={containerRef}
      className={cn(
        'hsk-cb-cont-wave-rail',
        side === 'left' ? 'hsk-cb-cont-wave-rail--left' : 'hsk-cb-cont-wave-rail--right',
        isPlaying && 'is-playing'
      )}
      aria-label="Conversation Audio Wave"
    >
      {/* Top Play/Pause Replay Trigger */}
      <button
        type="button"
        className={cn('hsk-cb-cont-wave-btn', isPlaying && 'is-playing')}
        onClick={handleTogglePlay}
        aria-label={isPlaying ? 'Pause conversation replay' : 'Replay conversation'}
        title={isPlaying ? 'Pause replay (microphone is muted)' : 'Replay conversation audio'}
      >
        {isPlaying ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="4" width="4.5" height="16" rx="1.5" />
            <rect x="14.5" y="4" width="4.5" height="16" rx="1.5" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 4.5v15l12-7.5-12-7.5z" />
          </svg>
        )}
      </button>

      {/* The Single Continuous Growing Audio Waveform */}
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
          viewBox={`0 0 ${SVG_WIDTH} ${waveSvg.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            {/* Waveform vertical gradient */}
            <linearGradient id="hsk-wave-fill" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--hsk-primary, #ff6a33)" stopOpacity="0.28" />
              <stop offset="85%" stopColor="var(--hsk-primary, #ff6a33)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="var(--hsk-primary, #ff6a33)" stopOpacity="0.35" />
            </linearGradient>

            <linearGradient id="hsk-wave-played" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--hsk-primary, #ff6a33)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="var(--hsk-primary, #ff6a33)" stopOpacity="0.95" />
            </linearGradient>

            {/* Clipping mask for played progress portion */}
            <clipPath id="hsk-wave-played-clip">
              <rect x="0" y="0" width={SVG_WIDTH} height={playCursorY} />
            </clipPath>
          </defs>

          {/* Continuous Waveform Ribbon Background */}
          <path
            d={waveSvg.ribbonPath}
            fill="url(#hsk-wave-fill)"
            stroke="var(--hsk-chat-divide, rgba(0,0,0,0.12))"
            strokeWidth="1"
          />

          {/* Acoustic Waveform Ribs (horizontal sound frequency bars along the continuous wave) */}
          {waveSvg.ribs.map((rib, i) => (
            <line
              key={i}
              x1={rib.x1}
              y1={rib.y}
              x2={rib.x2}
              y2={rib.y}
              stroke="var(--hsk-chat-muted, #8a8f98)"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity={0.35 + (rib.amp / 15) * 0.45}
            />
          ))}

          {/* Center Sound Spine */}
          <line
            x1={CENTER_X}
            y1="0"
            x2={CENTER_X}
            y2={waveSvg.height}
            stroke="var(--hsk-chat-divide, rgba(0,0,0,0.15))"
            strokeWidth="1"
            strokeDasharray="2 3"
          />

          {/* Active Played Waveform Overlay (grows downwards as replay progresses) */}
          {isPlaying && (
            <g clipPath="url(#hsk-wave-played-clip)">
              <path
                d={waveSvg.ribbonPath}
                fill="url(#hsk-wave-played)"
                stroke="var(--hsk-primary, #ff6a33)"
                strokeWidth="1.5"
              />
              {waveSvg.ribs.map((rib, i) => (
                <line
                  key={`played-${i}`}
                  x1={rib.x1}
                  y1={rib.y}
                  x2={rib.x2}
                  y2={rib.y}
                  stroke="#ffffff"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  opacity={0.7}
                />
              ))}
            </g>
          )}

          {/* Turn divider notch dots along the continuous wave */}
          {exchangeLayout.segments.map((seg, i) => (
            <circle
              key={i}
              cx={CENTER_X}
              cy={seg.startY}
              r={playingItemIdx === i ? 2.5 : 1.5}
              fill={playingItemIdx === i ? 'var(--hsk-primary, #ff6a33)' : 'var(--hsk-chat-muted, #8a8f98)'}
              opacity={0.7}
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

        {/* Live Growing Tip: pulses in real-time as speech happens */}
        {isLiveActive && (
          <div
            className={cn(
              'hsk-cb-cont-wave-live-tip',
              (voicePhase === 'speaking' || voicePhase === 'listening') && 'is-active'
            )}
            style={{
              transform: `translateY(${exchangeLayout.totalHeight - 4}px)`,
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
