import React, { useEffect, useState } from 'react';
import {
  describeAge,
  getLiveValue,
  isFresh,
  isStale,
  labelFor,
  formatLiveValue,
  subscribeLiveValues,
  LIVE_FLASH_MS,
  type LiveValue,
} from '@akropolys/sdk';

function useLiveValues(keys: string[]): (LiveValue | undefined)[] {
  const [, bump] = useState(0);
  const joined = JSON.stringify(keys);

  useEffect(() => subscribeLiveValues(k => {
    if (keys.includes(k)) bump(n => n + 1);
  }), [joined]);

  useEffect(() => {
    const id = setInterval(() => bump(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return keys.map(getLiveValue);
}

const TITLE_KEYS = ['title', 'name', 'label', 'headline', 'subject'];
const MAX_PILLS = 8;
const MAX_PILL_CHARS = 40;

function LiveQuoteCard({ record, now }: { record: LiveValue; now: number }) {
  const stale = isStale(record, now);

  const fields = record.fields;
  const titleKey = TITLE_KEYS.find(k => fields[k]);
  const rawTitle = titleKey ? fields[titleKey] : record.key;
  const shortTitle = rawTitle.length > 38 ? rawTitle.slice(0, 36) + '…' : rawTitle;

  // Every field the site publishes, under its own name; ids and long prose do not fit a pill.
  const quotePills = Object.entries(fields)
    .filter(([k, v]) => k !== titleKey && v !== '' && v.length <= MAX_PILL_CHARS && !/^[0-9a-fA-F-]{26,}$/.test(v))
    .slice(0, MAX_PILLS)
    .map(([k, v]) => ({ label: labelFor(k), value: formatLiveValue(v), rawKey: k }));

  return (
    <div className={`hsk-live-card${stale ? ' is-stale' : ''}`} role="region" aria-label="Live values">
      <div className="hsk-live-card__top">
        <div className="hsk-live-card__badge">
          <span className={`hsk-live-dot${stale ? ' is-stale' : ''}`} aria-hidden="true" />
          <span className="hsk-live-card__age">
            {stale ? `Paused · ${describeAge(now - record.at)}` : `Live · ${describeAge(now - record.at)}`}
          </span>
        </div>
      </div>

      <div className="hsk-live-card__body">
        <span className="hsk-live-card__title" title={rawTitle}>{shortTitle}</span>
      </div>

      <div className="hsk-live-card__pills">
        {quotePills.map(p => {
          const flash = isFresh(record, p.rawKey, now);
          return (
            <div
              key={p.rawKey}
              className={`hsk-live-pill${flash ? ' is-changed' : ''}`}
              style={flash ? { animationDuration: `${LIVE_FLASH_MS}ms` } : undefined}
            >
              <span className="hsk-live-pill__label">{p.label}</span>
              <span className="hsk-live-pill__value">{p.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LiveTable({ keys }: { keys?: string[] }) {
  const seen = new Set<string>();
  const ordered = (keys ?? []).filter(k => (seen.has(k) ? false : (seen.add(k), true)));

  const records = useLiveValues(ordered);
  const present = ordered.filter((_, i) => records[i]);
  if (present.length === 0) return null;

  const shown = records.filter((r): r is LiveValue => !!r);
  const now = Date.now();

  return (
    <div className="hsk-live-wrap" role="group" aria-label="Live data">
      <div className="hsk-live-carousel">
        {shown.map(r => (
          <LiveQuoteCard key={r.key} record={r} now={now} />
        ))}
      </div>
    </div>
  );
}
