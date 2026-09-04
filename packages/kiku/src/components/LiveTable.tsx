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

function LiveQuoteCard({ record, now }: { record: LiveValue; now: number }) {
  const stale = isStale(record, now);

  const fields = record.fields;
  const rawTitle = fields.event || fields.question || fields.title || record.key;
  const shortTitle = rawTitle.length > 38 ? rawTitle.slice(0, 36) + '…' : rawTitle;

  const hasYesPrice = !!fields.yes_price || !!fields.yesPrice;
  const hasNoPrice = !!fields.no_price || !!fields.noPrice;

  const quotePills: { label: string; value: string; rawKey: string }[] = [];

  if (hasYesPrice) {
    quotePills.push({ label: 'Yes', value: formatLiveValue('yes_price', fields.yes_price || fields.yesPrice), rawKey: 'yes_price' });
  } else if (fields.yes_pct || fields.yesPct) {
    quotePills.push({ label: 'Yes', value: formatLiveValue('yes_pct', fields.yes_pct || fields.yesPct), rawKey: 'yes_pct' });
  }

  if (hasNoPrice) {
    quotePills.push({ label: 'No', value: formatLiveValue('no_price', fields.no_price || fields.noPrice), rawKey: 'no_price' });
  } else if (fields.no_pct || fields.noPct) {
    quotePills.push({ label: 'No', value: formatLiveValue('no_pct', fields.no_pct || fields.noPct), rawKey: 'no_pct' });
  }

  if (fields.bid) quotePills.push({ label: 'Bid', value: formatLiveValue('bid', fields.bid), rawKey: 'bid' });
  if (fields.ask) quotePills.push({ label: 'Ask', value: formatLiveValue('ask', fields.ask), rawKey: 'ask' });
  if (fields.spread) quotePills.push({ label: 'Spread', value: formatLiveValue('spread', fields.spread), rawKey: 'spread' });
  if (!hasYesPrice && !hasNoPrice && !fields.bid && fields.price) {
    quotePills.push({ label: 'Price', value: formatLiveValue('price', fields.price), rawKey: 'price' });
  }

  if (fields.home_spread || fields.spread_line) quotePills.push({ label: 'Spread', value: formatLiveValue('spread', fields.home_spread || fields.spread_line), rawKey: 'spread' });
  if (fields.moneyline || fields.ml) quotePills.push({ label: 'ML', value: formatLiveValue('ml', fields.moneyline || fields.ml), rawKey: 'moneyline' });
  if (fields.over_under || fields.total) quotePills.push({ label: 'O/U', value: formatLiveValue('total', fields.over_under || fields.total), rawKey: 'over_under' });

  if (fields['1_home'] || fields.home_odd || fields['1']) {
    quotePills.push({ label: '1', value: formatLiveValue('odds', fields['1_home'] || fields.home_odd || fields['1']), rawKey: '1_home' });
  }
  if (fields['X_draw'] || fields.neutral_odd || fields.draw_odd || fields['X']) {
    quotePills.push({ label: 'X', value: formatLiveValue('odds', fields['X_draw'] || fields.neutral_odd || fields.draw_odd || fields['X']), rawKey: 'X_draw' });
  }
  if (fields['2_away'] || fields.away_odd || fields['2']) {
    quotePills.push({ label: '2', value: formatLiveValue('odds', fields['2_away'] || fields.away_odd || fields['2']), rawKey: '2_away' });
  }

  const volVal = fields.volume || fields.vol || fields['24h_volume'] || fields.turnover;
  if (volVal) {
    quotePills.push({ label: 'Vol', value: formatLiveValue('volume', volVal), rawKey: 'volume' });
  }

  const closeDate = fields.close_date || fields.expiry || fields.expires_at || fields.settle_date;
  const formattedClose = closeDate ? formatLiveValue('close_date', closeDate) : null;

  return (
    <div className={`hsk-live-card${stale ? ' is-stale' : ''}`} role="region" aria-label="Live quote">
      <div className="hsk-live-card__top">
        <div className="hsk-live-card__badge">
          <span className={`hsk-live-dot${stale ? ' is-stale' : ''}`} aria-hidden="true" />
          <span className="hsk-live-card__age">
            {stale ? `Paused · ${describeAge(now - record.at)}` : `Live · ${describeAge(now - record.at)}`}
          </span>
        </div>
        {formattedClose && <span className="hsk-live-card__close">Closes {formattedClose}</span>}
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
    <div className="hsk-live-wrap" role="group" aria-label="Live market data">
      <div className="hsk-live-carousel">
        {shown.map(r => (
          <LiveQuoteCard key={r.key} record={r} now={now} />
        ))}
      </div>
    </div>
  );
}
