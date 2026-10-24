import React from 'react';
import type { ChatSource } from '@akropolys/sdk';
import { useT } from '../types';

export interface SmartContextPillsProps {
  intent: string | null;
  sources: ChatSource[];
  onSend: (text: string) => void;
  loading: boolean;
}

export function SmartContextPills({
  intent,
  sources,
  onSend,
  loading,
}: SmartContextPillsProps) {
  const tr = useT();
  if (!intent) return null;

  const pills: { label: string; query: string; emoji: string }[] = [];

  const firstName = sources[0]?.name ?? '';
  const firstTwo = sources.slice(0, 2).map(s => s.name);

  if (intent === 'search' && sources.length > 0) {
    if (firstTwo.length >= 2) {
      pills.push({
        emoji: '⚖️',
        label: tr('pillCompareTop2'),
        query: tr('pillCompareTop2Query', { a: firstTwo[0], b: firstTwo[1] }),
      });
    }
    if (firstName) {
      const short = firstName.split(' ').slice(0, 3).join(' ');
      pills.push({
        emoji: '💡',
        label: tr('pillMoreOn', { name: short }),
        query: tr('pillMoreOnQuery', { name: firstName }),
      });
    }
  } else if (intent === 'compare' && sources.length > 0) {
    if (firstName) {
      pills.push({
        emoji: '🔍',
        label: tr('pillSimilarOptions'),
        query: tr('pillSimilarOptionsQuery', { name: firstName }),
      });
    }
    pills.push({ emoji: '💡', label: tr('pillWhichBest'), query: tr('pillWhichBestQuery') });
  } else if (intent === 'specs' && sources.length > 0) {
    if (firstName) {
      pills.push({
        emoji: '🔄',
        label: tr('pillFindAlternatives'),
        query: tr('pillFindAlternativesQuery', { name: firstName }),
      });
    }
  } else if (intent === 'general') {
    pills.push({ emoji: '🔍', label: tr('pillShowPopular'), query: tr('pillShowPopularQuery') });
    pills.push({ emoji: '💡', label: tr('pillRecommend'), query: tr('pillRecommendQuery') });
  }

  if (pills.length === 0) return null;

  return (
    <div className="hsk-action-pills">
      {pills.map(pill => (
        <button
          key={pill.query}
          className="hsk-action-pill"
          onClick={() => onSend(pill.query)}
          disabled={loading}
        >
          <span className="hsk-pill-emoji">{pill.emoji}</span>
          {pill.label}
        </button>
      ))}
    </div>
  );
}
