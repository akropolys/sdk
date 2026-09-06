import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '@akropolys/sdk';
import { cn } from '../../../utils/cn';
import { chime } from '../../../utils/chime';
import { useDelayedClose } from '../hooks/useDelayedClose';
import {
  PinIcon,
  RetryIcon,
  CopyIcon,
  CheckIcon,
} from '../icons';
import type { UIStringKey } from '../types';

const TAPBACK_EXIT_MS = 190;

export interface TapbackMenuProps {
  msg: ChatMessage;
  rect: { top: number; left: number; width: number; height: number };
  containerRect?: { top: number; left: number; width: number; height: number };
  anchorEl?: HTMLElement | null;
  containerEl?: HTMLElement | null;
  isUser: boolean;
  isRTL?: boolean;
  canRetry?: boolean;
  onPin: (msg: ChatMessage) => void;
  onRetry?: (msg: ChatMessage) => void;
  onCopy: (text: string) => boolean | Promise<boolean>;
  onClose: () => void;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
}

export function TapbackMenu({
  msg,
  rect,
  containerRect,
  anchorEl,
  containerEl,
  isUser,
  isRTL = false,
  canRetry,
  onPin,
  onRetry,
  onCopy,
  onClose,
  t,
}: TapbackMenuProps) {
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { closing, requestClose } = useDelayedClose(TAPBACK_EXIT_MS, onClose);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestClose]);

  const handleCopyAction = useCallback(async () => {
    const ok = await onCopy(msg.content || '');
    if (!ok) return;
    setCopied(true);
    setTimeout(requestClose, 450);
  }, [msg.content, onCopy, requestClose]);

  const handlePinAction = useCallback(() => {
    chime('pin');
    onPin(msg);
    requestClose();
  }, [msg, onPin, requestClose]);

  const handleRetryAction = useCallback(() => {
    if (onRetry) onRetry(msg);
    requestClose();
  }, [msg, onRetry, requestClose]);

  const [measuredWidth, setMeasuredWidth] = useState(0);

  useEffect(() => {
    if (menuRef.current) {
      const w = menuRef.current.offsetWidth;
      if (w && Math.abs(w - measuredWidth) > 2) {
        setMeasuredWidth(w);
      }
    }
  }, [measuredWidth]);

  const [live, setLive] = useState(rect);
  const [liveContainer, setLiveContainer] = useState(containerRect);

  useEffect(() => {
    if (!anchorEl) return;
    let raf = 0;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
    const tick = () => {
      const r = anchorEl.getBoundingClientRect();
      setLive((p) =>
        near(p.top, r.top) && near(p.left, r.left) && near(p.width, r.width) && near(p.height, r.height)
          ? p
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
      if (containerEl) {
        const c = containerEl.getBoundingClientRect();
        setLiveContainer((p) =>
          p && near(p.top, c.top) && near(p.left, c.left) && near(p.width, c.width)
            ? p
            : { top: c.top, left: c.left, width: c.width, height: c.height },
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anchorEl, containerEl]);

  const [bubbleColor, setBubbleColor] = useState('');
  useEffect(() => {
    if (!anchorEl) return;
    const bg = getComputedStyle(anchorEl).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') setBubbleColor(bg);
  }, [anchorEl]);

  const box = live;
  const container = liveContainer ?? containerRect;

  const cTop = container?.top ?? 0;
  const cLeft = container?.left ?? 0;
  const cWidth = container?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 390);

  const bTop = box.top - cTop;
  const bLeft = box.left - cLeft;
  const bWidth = box.width;
  const bHeight = box.height;

  // Capsule width based on enabled tools
  let btnCount = 2; // Pin + Copy
  if (canRetry && onRetry) btnCount++;
  const estimatedWidth = btnCount === 2 ? 122 : 170;
  const capsuleWidth = measuredWidth || estimatedWidth;
  const capsuleHeight = 36;

  const thinkAbove = !!anchorEl?.closest('.hsk-cb-think')
    || !!anchorEl?.parentElement?.querySelector('.hsk-cb-think-head');
  const placeAbove = bTop >= 58 && !thinkAbove;
  const capsuleTop = placeAbove
    ? Math.max(8, bTop - capsuleHeight - 9)
    : Math.min(bTop + bHeight + 9, (container?.height ?? 800) - capsuleHeight - 8);

  const anchorRight = isUser ? isRTL : !isRTL;
  const targetX = anchorRight
    ? Math.min(cWidth - 18, bLeft + bWidth - 7)
    : Math.max(18, bLeft + 7);

  let capsuleLeft = anchorRight
    ? targetX - capsuleWidth + 18
    : targetX - 18;

  // Clamp capsule within container bounds
  capsuleLeft = Math.max(10, Math.min(capsuleLeft, cWidth - capsuleWidth - 10));

  // Compute exact tail offset inside capsule so it aligns with targetX
  const tailOffset = Math.max(18, Math.min(targetX - capsuleLeft, capsuleWidth - 18));

  const anchorColor = bubbleColor
    || (isUser
      ? 'var(--hsk-user-bubble-bg, var(--hsk-primary, #007aff))'
      : 'var(--hsk-bubble-bg, #eeeef0)');

  let toolIdx = 0;

  return (
    <div className="hsk-tapback-overlay" onClick={requestClose}>
      <div
        ref={menuRef}
        className={cn(
          "hsk-tapback-group",
          closing && "is-closing",
          placeAbove ? "is-above" : "is-below",
          isUser ? "is-user" : "is-ai"
        )}
        style={{
          top: `${capsuleTop}px`,
          left: `${capsuleLeft}px`,
          '--tail-x': `${tailOffset}px`,
          '--tail-dir': anchorRight ? 1 : -1,
          '--tail-step': isUser ? '9px' : '8px',
          '--hsk-anchor-color': anchorColor,
          '--hsk-skin': 'var(--hsk-bubble-bg, var(--hsk-chat-ai-bg, #eeeef0))',
        } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        {/* Floating Tool Capsule */}
        <div className="hsk-tapback-capsule">
          <button
            type="button"
            className="hsk-tapback-tool-btn hsk-tapback-tool-btn--pin"
            onClick={handlePinAction}
            aria-label="Pin to Kiku Memory"
            style={{ '--tool-idx': toolIdx++ } as React.CSSProperties}
          >
            <PinIcon size={14} />
            <span>Pin</span>
          </button>

          {canRetry && onRetry && (
            <button
              type="button"
              className="hsk-tapback-tool-btn hsk-tapback-tool-btn--retry"
              onClick={handleRetryAction}
              aria-label={t('retry')}
              style={{ '--tool-idx': toolIdx++ } as React.CSSProperties}
            >
              <RetryIcon size={14} />
              <span>{t('retry')}</span>
            </button>
          )}

          <button
            type="button"
            className={cn("hsk-tapback-tool-btn hsk-tapback-tool-btn--copy", copied && "is-copied")}
            onClick={handleCopyAction}
            aria-label={copied ? t('copied') : t('copy')}
            style={{ '--tool-idx': toolIdx++ } as React.CSSProperties}
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            <span>{copied ? t('copied') : t('copy')}</span>
          </button>
        </div>

        <div
          className={cn("hsk-tapback-tail", placeAbove ? "is-above" : "is-below")}
          style={{ left: `${tailOffset}px` }}
        >
          <span className="hsk-tapback-dot hsk-tapback-dot--mid" />
          <span className="hsk-tapback-dot hsk-tapback-dot--anchor" />
        </div>
      </div>
    </div>
  );
}
