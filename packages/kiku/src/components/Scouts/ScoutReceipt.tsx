import React, { useState } from 'react';
import { figure, when } from '../../utils/figure';
import { Scout } from '@akropolys/sdk';
import { cn } from '../../utils/cn';
import { ScoutCharacter, speciesNick, humanMinutes } from './ScoutCharacter';
import { useT } from '../ChatModal/types';

export interface ScoutReceiptProps {
  scouts: Scout[];
  isNarrow?: boolean;
  lang?: string;
  onOpen: (scout: Scout) => void;
  onDismiss: (id: string) => void;
}

// What a scout hands over when it comes back: the brief, the number it caught,
// and what the watch cost. The detail lives in the thread — this is the stub
// that says it happened, so a shopper who was reading something else finds out.
export function ScoutReceipt({ scouts, isNarrow, lang, onOpen, onDismiss }: ScoutReceiptProps) {
  const tr = useT();
  const [active, setActive] = useState(0);
  if (!scouts.length) return null;

  const idx = Math.min(active, scouts.length - 1);
  const sc = scouts[idx];
  const who = speciesNick(sc.id, sc.avatar);

  // On a phone there is no side to put a receipt on. The scout hangs off the
  // header instead, under the mark it sprang from, and waits to be tapped.
  if (isNarrow) {
    return (
      <div className="hsk-cb-scout-drop" role="status">
        <button
          type="button"
          className="hsk-cb-scout-drop-face"
          onClick={() => onOpen(sc)}
          aria-label={tr('scoutReceiptOpen', { who })}
        >
          <ScoutCharacter scoutId={sc.id} avatar={sc.avatar} mood="struck" size={34} />
          {scouts.length > 1 && <span className="hsk-cb-scout-drop-count">{scouts.length}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="hsk-cb-scout-receipt" role="status">
      {scouts.length > 1 && (
        <div className="hsk-cb-scout-receipt-tabs" role="tablist">
          {scouts.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === idx}
              className={cn('hsk-cb-scout-receipt-tab', i === idx && 'is-on')}
              onClick={() => setActive(i)}
              aria-label={speciesNick(s.id, s.avatar)}
            >
              <ScoutCharacter scoutId={s.id} avatar={s.avatar} mood="struck" size={22} />
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="hsk-cb-scout-receipt-body"
        onClick={() => onOpen(sc)}
        aria-label={tr('scoutReceiptOpen', { who })}
      >
        <span className="hsk-cb-scout-receipt-head">
          <ScoutCharacter scoutId={sc.id} avatar={sc.avatar} mood="struck" size={30} />
          <span className="hsk-cb-scout-receipt-title">
            <b>{who}</b>
            <u>{tr('scoutReceiptAchieved')}</u>
          </span>
        </span>

        <span className="hsk-cb-scout-receipt-rule" aria-hidden="true" />

        {sc.brief && <span className="hsk-cb-scout-receipt-brief">{sc.brief}</span>}

        {sc.triggerValue && (
          <span className="hsk-cb-scout-receipt-line is-hit">
            <span>{tr('scoutReceiptCaught')}</span>
            <b dir="ltr">{figure(sc.triggerValue, lang)}</b>
          </span>
        )}
        {sc.triggeredAt && (
          <span className="hsk-cb-scout-receipt-line is-met">
            <span>{tr('scoutReceiptMet')}</span>
            <time dateTime={sc.triggeredAt} dir="ltr">{when(sc.triggeredAt, lang)}</time>
          </span>
        )}
        {(sc.minutesUsed ?? 0) > 0 && (
          <span className="hsk-cb-scout-receipt-line">
            <span>{tr('scoutReceiptSpent', { used: humanMinutes(sc.minutesUsed ?? 0, tr) })}</span>
          </span>
        )}

        <span className="hsk-cb-scout-receipt-rule" aria-hidden="true" />
        <span className="hsk-cb-scout-receipt-cta">{tr('scoutReceiptTap')}</span>
      </button>

      <button
        type="button"
        className="hsk-cb-scout-receipt-x"
        onClick={() => onDismiss(sc.id)}
        aria-label={tr('scoutReceiptDismiss')}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
