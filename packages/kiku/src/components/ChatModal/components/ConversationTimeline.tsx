import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '../../../utils/cn';
import { useT } from '../types';

export interface TimelineExchangeItem {
  idx: number;
  text: string;
  audioUrl?: string;
  assistantAudioUrl?: string;
  assistantIdx?: number;
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
}

const WAVE_X = 14;
const WAVE_SWAY = 6;

// Sinusoidal curve connecting each exchange along the vertical axis
function buildWave(items: (HTMLButtonElement | null)[], anchor: number, isPlaying: boolean) {
  const nodes = items.filter(Boolean) as HTMLButtonElement[];
  if (nodes.length < 2) return null;
  const centre = (n: HTMLButtonElement) => n.offsetTop + n.offsetHeight / 2;
  const height = centre(nodes[nodes.length - 1]) + 10;
  const sway = (i: number) => {
    const base = (i === anchor ? WAVE_SWAY * 1.3 : WAVE_SWAY * 0.6) * (i % 2 ? 1 : -1);
    return isPlaying && i === anchor ? base * 1.5 : base;
  };

  let d = `M ${WAVE_X} 0`;
  let prevY = 0;
  nodes.forEach((n, i) => {
    const y = centre(n);
    const mid = prevY + (y - prevY) / 2;
    d += ` C ${WAVE_X + sway(i)} ${mid}, ${WAVE_X + sway(i)} ${mid}, ${WAVE_X} ${y}`;
    prevY = y;
  });
  return { d: d + ` L ${WAVE_X} ${height}`, height };
}

export function ConversationTimeline({
  items,
  activeIdx,
  progress,
  onJump,
  side = 'right',
  voiceMuted = false,
  setVoiceMuted,
}: ConversationTimelineProps) {
  const tr = useT();
  const containerRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [wave, setWave] = useState<{ d: string; height: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingItemIdx, setPlayingItemIdx] = useState<number | null>(null);
  const [playingPart, setPlayingPart] = useState<'user' | 'assistant'>('user');

  const wasMutedRef = useRef(voiceMuted);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  let anchor = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].idx <= activeIdx) anchor = i;
  }

  // Position wave cursor and track centering
  useEffect(() => {
    const node = itemRefs.current[anchor];
    const cursor = cursorRef.current;
    const track = trackRef.current;
    const container = containerRef.current;
    if (!node) return;

    if (cursor) {
      cursor.style.transform = `translateY(${node.offsetTop + node.offsetHeight / 2}px)`;
    }

    setWave(buildWave(itemRefs.current, anchor, isPlaying));

    if (track && container) {
      const containerHeight = container.clientHeight;
      const trackHeight = track.scrollHeight;
      if (trackHeight > containerHeight && containerHeight > 0) {
        const nodeCenter = node.offsetTop + node.offsetHeight / 2;
        const targetY = containerHeight / 2 - nodeCenter;
        track.style.transform = `translateY(${targetY}px)`;
      } else {
        track.style.transform = 'none';
      }
    }
  }, [anchor, items.length, isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (isPlayingRef.current && setVoiceMuted) {
        setVoiceMuted(wasMutedRef.current);
      }
    };
  }, [setVoiceMuted]);

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

  // TTS fallback helper
  const playTtsText = useCallback((text: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
        setTimeout(() => resolve(true), 1200);
        return;
      }
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 1.05;
      utt.onend = () => resolve(true);
      utt.onerror = () => resolve(false);
      window.speechSynthesis.speak(utt);
    });
  }, []);

  // Replay executor
  const playTurn = useCallback(async (itemIdx: number, part: 'user' | 'assistant' = 'user') => {
    if (!isPlayingRef.current || itemIdx >= items.length) {
      // Replay finished or stopped
      setIsPlaying(false);
      setPlayingItemIdx(null);
      if (setVoiceMuted) setVoiceMuted(wasMutedRef.current);
      return;
    }

    const it = items[itemIdx];
    setPlayingItemIdx(itemIdx);
    setPlayingPart(part);

    if (part === 'user') {
      onJump(it.idx);
      if (it.audioUrl) {
        await playAudioUrl(it.audioUrl);
      } else {
        await playTtsText(it.text);
      }
      if (!isPlayingRef.current) return;
      // After user question, proceed to assistant reply in same turn
      if (it.assistantIdx != null || it.assistantAudioUrl) {
        await playTurn(itemIdx, 'assistant');
      } else {
        await playTurn(itemIdx + 1, 'user');
      }
    } else {
      if (it.assistantIdx != null) onJump(it.assistantIdx);
      if (it.assistantAudioUrl) {
        await playAudioUrl(it.assistantAudioUrl);
      } else {
        setTimeout(() => {
          if (isPlayingRef.current) playTurn(itemIdx + 1, 'user');
        }, 800);
        return;
      }
      if (!isPlayingRef.current) return;
      await playTurn(itemIdx + 1, 'user');
    }
  }, [items, onJump, playAudioUrl, playTtsText, setVoiceMuted]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      // Stop / Pause
      setIsPlaying(false);
      setPlayingItemIdx(null);
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (setVoiceMuted) setVoiceMuted(wasMutedRef.current);
    } else {
      // Start replay: mic is muted of course
      if (setVoiceMuted) {
        wasMutedRef.current = voiceMuted;
        setVoiceMuted(true);
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      const startIdx = anchor >= items.length - 1 ? 0 : anchor;
      void playTurn(startIdx, 'user');
    }
  }, [isPlaying, voiceMuted, setVoiceMuted, anchor, items.length, playTurn]);

  const handleItemClick = useCallback((index: number) => {
    const it = items[index];
    onJump(it.idx);

    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      void playTurn(index, 'user');
    } else {
      // Direct jump and start playback
      if (setVoiceMuted) {
        wasMutedRef.current = voiceMuted;
        setVoiceMuted(true);
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      void playTurn(index, 'user');
    }
  }, [items, onJump, isPlaying, setVoiceMuted, voiceMuted, playTurn]);

  if (items.length === 0) return null;

  return (
    <nav
      ref={containerRef}
      className={cn(
        "hsk-cb-timeline",
        side === 'left' ? "hsk-cb-timeline--left" : "hsk-cb-timeline--right",
        isPlaying && "is-replaying"
      )}
      aria-label={tr('timelineLabel')}
    >
      {/* Play/Pause control button atop the vertical wave */}
      <div className="hsk-cb-tl-ctrl-bar">
        <button
          type="button"
          className={cn("hsk-cb-tl-play-btn", isPlaying && "is-playing")}
          onClick={handleTogglePlay}
          aria-label={isPlaying ? 'Pause conversation replay' : 'Replay conversation'}
          title={isPlaying ? 'Pause replay (microphone is muted)' : 'Replay conversation'}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="4" width="4" height="16" rx="1.5" />
              <rect x="15" y="4" width="4" height="16" rx="1.5" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 4.5v15l12-7.5-12-7.5z" />
            </svg>
          )}
        </button>

        {isPlaying && (
          <span className="hsk-cb-tl-mute-badge" title="Microphone is muted while replaying conversation">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <span>muted</span>
          </span>
        )}
      </div>

      <div
        ref={trackRef}
        className="hsk-cb-timeline-track"
        style={{ '--hsk-tl-progress': progress } as React.CSSProperties}
      >
        {wave && (
          <svg
            className={cn("hsk-cb-tl-wave", isPlaying && "hsk-cb-tl-wave--playing")}
            width="28"
            height={wave.height}
            viewBox={`0 0 28 ${wave.height}`}
            aria-hidden="true"
          >
            <path d={wave.d} />
          </svg>
        )}
        <span className="hsk-cb-tl-cursor" ref={cursorRef} aria-hidden="true" />
        {items.map((item, i) => {
          const isItemActive = isPlaying ? playingItemIdx === i : i === anchor;
          return (
            <button
              key={item.idx}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              className={cn(
                'hsk-cb-tl-item',
                isItemActive && 'hsk-cb-tl-item--on',
                isPlaying && playingItemIdx === i && 'hsk-cb-tl-item--playing'
              )}
              style={{ '--hsk-tl-d': Math.min(Math.abs(i - anchor), 4) } as React.CSSProperties}
              onClick={() => handleItemClick(i)}
            >
              {isPlaying && playingItemIdx === i ? (
                <span className="hsk-cb-tl-equalizer" aria-hidden="true">
                  <span className="hsk-cb-eq-bar bar-1" />
                  <span className="hsk-cb-eq-bar bar-2" />
                  <span className="hsk-cb-eq-bar bar-3" />
                </span>
              ) : (
                <span className="hsk-cb-tl-dot" />
              )}
              <span className="hsk-cb-tl-label">
                {item.spoken ? '🎙️ ' : ''}{item.text}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
