import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scout } from '@akropolys/sdk';
import cssText from '../../generated/cssText';
import { ScoutCharacter, ScoutMood, speciesNick } from './ScoutCharacter';

export function pinSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

function moodOf(scout: Scout): ScoutMood {
  switch (scout.status) {
    case 'active': return 'watching';
    case 'paused': return 'resting';
    case 'triggered': return 'struck';
    default: return 'gone';
  }
}

// How far a scout has travelled from where it started toward its target.
function progress(scout: Scout): number | null {
  const num = (v?: string) => {
    const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isNaN(n) ? null : n;
  };
  const start = num(scout.initialValue);
  const target = num(scout.targetValue);
  if (start === null || target === null || start === target) return null;
  const now = num(scout.triggerValue) ?? start;
  const pct = ((now - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export interface ScoutPinProps {
  scouts: Scout[];
  themeAttr?: string;
  balance?: number;
  // The widget element the live theme resolves on; its tokens are copied over.
  sourceEl?: HTMLElement | null;
  onClose: () => void;
}

const TOKENS = [
  '--hsk-chat-bg', '--hsk-chat-text', '--hsk-chat-muted', '--hsk-chat-divide',
  '--hsk-chat-border', '--hsk-surface-1', '--hsk-surface-2', '--hsk-primary',
  '--hsk-primary-rgb', '--hsk-on-active', '--hsk-active-bg', '--hsk-font',
];

function paint(win: Window, sourceEl?: HTMLElement | null) {
  const from = sourceEl && sourceEl.isConnected ? getComputedStyle(sourceEl) : null;
  if (!from) return;
  for (const t of TOKENS) {
    const v = from.getPropertyValue(t).trim();
    if (v) win.document.body.style.setProperty(t, v);
  }
}

function furnish(win: Window, themeAttr?: string) {
  if (!win.document.querySelector('style[data-hsk]')) {
    const style = win.document.createElement('style');
    style.setAttribute('data-hsk', '');
    style.textContent = cssText;
    win.document.head.appendChild(style);
  }
  win.document.body.className = 'hsk-cb-pin-body';
  if (themeAttr) win.document.body.setAttribute('data-hsk-theme', themeAttr);
}

// The window outlives a StrictMode remount, so it is held outside the component.
let held: Window | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

export function ScoutPin({ scouts, themeAttr, balance, sourceEl, onClose }: ScoutPinProps) {
  const [pip, setPip] = useState<Window | null>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const themeRef = useRef(themeAttr);
  themeRef.current = themeAttr;
  const sourceRef = useRef(sourceEl);
  sourceRef.current = sourceEl;

  useEffect(() => {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    let stale = false;

    (async () => {
      try {
        const api = (window as any).documentPictureInPicture;
        // Only one pinned window is allowed per tab, so reuse one already open.
        const win: Window = api.window ?? (await api.requestWindow({ width: 268, height: 320 }));
        if (!win) return;

        furnish(win, themeRef.current);
        paint(win, sourceRef.current);
        held = win;
        win.addEventListener('pagehide', () => closeRef.current(), { once: true });

        if (!stale) setPip(win);
      } catch {
        closeRef.current();
      }
    })();

    return () => {
      stale = true;
      closeTimer = setTimeout(() => {
        closeTimer = null;
        try {
          held?.close();
        } catch {
          /* already gone */
        }
        held = null;
      }, 120);
    };
  }, []);

  useEffect(() => {
    if (!pip) return;
    if (themeAttr) pip.document.body.setAttribute('data-hsk-theme', themeAttr);
    paint(pip, sourceEl);
  }, [pip, themeAttr, sourceEl]);

  if (!pip) return null;

  const live = scouts.filter(s => s.status !== 'canceled' && s.status !== 'expired' && s.status !== 'idle');

  return createPortal(
    <div className="hsk-cb-scout-rail-card hsk-cb-pin-card">
      <div className="hsk-cb-scout-card-head">
        <span className="hsk-cb-scout-card-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" />
            <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6Z" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          Scouts
        </span>
        <span className="hsk-cb-pin-count">
          {live.filter(s => s.status === 'active').length} in motion
          {typeof balance === 'number' && <> · {balance}m left</>}
        </span>
      </div>

      {live.length === 0 ? (
        <div className="hsk-cb-scout-pool-line">Nothing out right now.</div>
      ) : (
        live.map(scout => {
          const pct = progress(scout);
          return (
            <div key={scout.id} className="hsk-cb-pin-row">
              <span className={`hsk-cb-scout is-${scout.status}`}>
                <span className="hsk-cb-scout-face">
                  <ScoutCharacter scoutId={scout.id} avatar={scout.avatar} mood={moodOf(scout)} size={38} />
                  {scout.status === 'active' && <span className="hsk-cb-scout-pulse" />}
                </span>
                <span className="hsk-cb-scout-name">{speciesNick(scout.id, scout.avatar)}</span>
              </span>

              <span className="hsk-cb-pin-text">
                <span className="hsk-cb-pin-watch">
                  {scout.instrument} {scout.operator} {scout.targetValue}
                </span>
                {pct !== null && (
                  <span className="hsk-cb-pin-bar">
                    <span className="hsk-cb-pin-fill" style={{ inlineSize: `${pct}%` }} />
                  </span>
                )}
                <span className="hsk-cb-pin-meta">
                  {scout.dedicatedMinutes > 0
                    ? `${scout.dedicatedMinutes}m of its own`
                    : 'on the shared pool'}
                  {scout.status === 'triggered' && <b className="hsk-cb-pin-hit"> · hit</b>}
                </span>
              </span>
            </div>
          );
        })
      )}
    </div>,
    pip.document.body,
  );
}
