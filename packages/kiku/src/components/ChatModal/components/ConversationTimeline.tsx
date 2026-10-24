import React, { useRef, useEffect, useState } from 'react';
import { cn } from '../../../utils/cn';
import { useT } from '../types';

export interface TimelineExchangeItem {
  idx: number;
  text: string;
}

export interface ConversationTimelineProps {
  items: TimelineExchangeItem[];
  activeIdx: number;
  progress: number;
  onJump: (idx: number) => void;
  side?: 'left' | 'right';
}

const WAVE_X = 14;
const WAVE_SWAY = 6;

// Sinusoidal curve connecting each exchange along the vertical axis
function buildWave(items: (HTMLButtonElement | null)[], anchor: number) {
  const nodes = items.filter(Boolean) as HTMLButtonElement[];
  if (nodes.length < 2) return null;
  const centre = (n: HTMLButtonElement) => n.offsetTop + n.offsetHeight / 2;
  const height = centre(nodes[nodes.length - 1]) + 10;
  const sway = (i: number) => (i === anchor ? WAVE_SWAY * 1.3 : WAVE_SWAY * 0.6) * (i % 2 ? 1 : -1);

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
}: ConversationTimelineProps) {
  const tr = useT();
  const containerRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const [wave, setWave] = useState<{ d: string; height: number } | null>(null);

  let anchor = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].idx <= activeIdx) anchor = i;
  }

  useEffect(() => {
    const node = itemRefs.current[anchor];
    const cursor = cursorRef.current;
    const track = trackRef.current;
    const container = containerRef.current;
    if (!node) return;

    if (cursor) {
      cursor.style.transform = `translateY(${node.offsetTop + node.offsetHeight / 2}px)`;
    }

    setWave(buildWave(itemRefs.current, anchor));

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
  }, [anchor, items.length]);

  if (items.length < 2) return null;

  return (
    <nav
      ref={containerRef}
      className={cn("hsk-cb-timeline", side === 'left' ? "hsk-cb-timeline--left" : "hsk-cb-timeline--right")}
      aria-label={tr('timelineLabel')}
    >
      <div
        ref={trackRef}
        className="hsk-cb-timeline-track"
        style={{ '--hsk-tl-progress': progress } as React.CSSProperties}
      >
        {wave && (
          <svg
            className="hsk-cb-tl-wave"
            width="28"
            height={wave.height}
            viewBox={`0 0 28 ${wave.height}`}
            aria-hidden="true"
          >
            <path d={wave.d} />
          </svg>
        )}
        <span className="hsk-cb-tl-cursor" ref={cursorRef} aria-hidden="true" />
        {items.map((item, i) => (
          <button
            key={item.idx}
            ref={(el) => { itemRefs.current[i] = el; }}
            type="button"
            className={cn('hsk-cb-tl-item', i === anchor && 'hsk-cb-tl-item--on')}
            style={{ '--hsk-tl-d': Math.min(Math.abs(i - anchor), 4) } as React.CSSProperties}
            onClick={() => onJump(item.idx)}
            title={item.text}
          >
            <span className="hsk-cb-tl-dot" />
            <span className="hsk-cb-tl-label">{item.text}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
