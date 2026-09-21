import React from 'react';
import { cn } from '../../../utils/cn';
import type { Translate } from '../types';

interface Props {
  images: number;
  videos: number;
  replies: number;
  voiceSeconds: number;
  side: 'left' | 'right';
  t: Translate;
}

export function AllowancePills({ images, videos, replies, voiceSeconds, side, t }: Props) {
  const pills: { key: string; label: string; spent: boolean; icon: React.ReactNode }[] = [];

  if (voiceSeconds >= 0) {
    const mins = Math.max(0, Math.floor(voiceSeconds / 60));
    pills.push({
      key: 'voice',
      label: t('pillVoice', { n: String(mins) }),
      spent: mins === 0,
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
        </svg>
      ),
    });
  }
  // -1 means the site set no cap, so there is no number to show.
  if (images >= 0) {
    pills.push({
      key: 'images',
      label: t('pillImages', { n: String(images) }),
      spent: images === 0,
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <circle cx="9" cy="9" r="2"/>
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
        </svg>
      ),
    });
  }
  if (videos >= 0) {
    pills.push({
      key: 'videos',
      label: t('pillVideos', { n: String(videos) }),
      spent: videos === 0,
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m22 8-6 4 6 4V8Z"/>
          <rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
        </svg>
      ),
    });
  }
  if (replies >= 0) {
    pills.push({
      key: 'replies',
      label: t('pillReplies', { n: String(replies) }),
      spent: replies === 0,
      icon: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    });
  }
  if (!pills.length) return null;

  // Shortest on top, so the stack keeps a clean edge against the composer.
  pills.sort((a, b) => a.label.length - b.label.length);

  return (
    <div className={cn('hsk-cb-allowance', `hsk-cb-allowance--${side}`)} aria-live="polite">
      {pills.map(p => (
        <span key={p.key} className={cn('hsk-cb-allowance-pill', p.spent && 'is-spent')}>
          <span className="hsk-cb-allowance-pill-icon" aria-hidden="true">{p.icon}</span>
          <span className="hsk-cb-allowance-pill-label">{p.label}</span>
        </span>
      ))}
    </div>
  );
}
