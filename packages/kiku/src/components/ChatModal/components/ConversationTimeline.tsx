import React, { useRef, useEffect } from 'react';
import { cn } from '../../../utils/cn';
import { useT } from '../types';

export interface ConversationTimelineProps {
  items: { idx: number; text: string }[];
  activeIdx: number;
  progress: number;
  onJump: (idx: number) => void;
  side?: 'left' | 'right';
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
