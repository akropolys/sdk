import React from 'react';
import type { ChatSource } from '@akropolys/sdk';
import { useT } from '../types';

export interface SmartContextPillsProps {
  intent: string | null;
  sources: ChatSource[];
  onSend: (text: string) => void;
  loading: boolean;
  defaultCurrency?: string;
}

export function SmartContextPills({
  intent,
  sources,
  onSend,
  loading,
  defaultCurrency = '',
}: SmartContextPillsProps) {
  const tr = useT();
  if (!intent) return null;

  const pills: { label: string; query: string; emoji: string }[] = [];

  const cheapest =
    sources.length > 0
      ? sources.reduce((min, s) => {
          const p = parseFloat(String(s.price ?? '').replace(/[^0-9.]/g, ''));
          const m = parseFloat(String(min.price ?? '').replace(/[^0-9.]/g, ''));
          return !isNaN(p) && (isNaN(m) || p < m) ? s : min;
        }, sources[0])
      : null;

  const firstName = sources[0]?.name ?? '';
  const firstTwo = sources.slice(0, 2).map(s => s.name);

  const priceCeiling = (): string | null => {
    const nums = sources
      .map(s => parseFloat(String(s.price ?? '').replace(/[^0-9.]/g, '')))
      .filter(n => !isNaN(n) && n > 0);
    if (nums.length === 0) return null;
    const max = Math.max(...nums);
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const rounded = Math.ceil(max / mag) * mag;
    const raw = String(sources.find(s => s.price)?.price ?? '');
    const symbol = raw.replace(/[0-9.,\s]/g, '') || defaultCurrency;
    return `${symbol} ${rounded.toLocaleString()}`.trim();
  };

  if (intent === 'search' && sources.length > 0) {
    if (firstTwo.length >= 2) {
      pills.push({
        emoji: '⚖️',
        label: tr('pillCompareTop2'),
        query: tr('pillCompareTop2Query', { a: firstTwo[0], b: firstTwo[1] }),
      });
    }
    if (cheapest?.name) {
      const short = cheapest.name.split(' ').slice(0, 3).join(' ');
      pills.push({
        emoji: '💡',
        label: tr('pillMoreOn', { name: short }),
        query: tr('pillMoreOnQuery', { name: cheapest.name }),
      });
    }
    const ceiling = priceCeiling();
    if (ceiling) {
      pills.push({
        emoji: '💰',
        label: tr('pillUnder', { amount: ceiling }),
        query: tr('pillUnderQuery', { amount: ceiling }),
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
