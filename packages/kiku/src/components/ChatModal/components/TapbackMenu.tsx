import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '@akropolys/sdk';
import { cn } from '../../../utils/cn';
import {
  PinIcon,
  RetryIcon,
  EditIcon,
  CopyIcon,
  CheckIcon,
} from '../icons';
import type { UIStringKey } from '../types';

export interface TapbackMenuProps {
  msg: ChatMessage;
  rect: { top: number; left: number; width: number; height: number };
  containerRect?: { top: number; left: number; width: number; height: number };
  isUser: boolean;
  canRetry?: boolean;
  canEdit?: boolean;
  onPin: (msg: ChatMessage) => void;
  onRetry?: (msg: ChatMessage) => void;
  onEdit?: (msg: ChatMessage) => void;
  onCopy: (text: string) => void;
  onClose: () => void;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
}

export function TapbackMenu({
  msg,
  rect,
  containerRect,
  isUser,
  canRetry,
  canEdit,
  onPin,
  onRetry,
  onEdit,
  onCopy,
  onClose,
  t,
}: TapbackMenuProps) {
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopyAction = useCallback(() => {
    onCopy(msg.content || '');
    setCopied(true);
    setTimeout(() => {
      onClose();
    }, 450);
  }, [msg.content, onCopy, onClose]);

  const handlePinAction = useCallback(() => {
    onPin(msg);
    onClose();
  }, [msg, onPin, onClose]);

  const handleRetryAction = useCallback(() => {
    if (onRetry) onRetry(msg);
    onClose();
  }, [msg, onRetry, onClose]);

  const handleEditAction = useCallback(() => {
    if (onEdit) onEdit(msg);
    onClose();
  }, [msg, onEdit, onClose]);

  const [measuredWidth, setMeasuredWidth] = useState(0);

  useEffect(() => {
    if (menuRef.current) {
      const w = menuRef.current.offsetWidth;
      if (w && Math.abs(w - measuredWidth) > 2) {
        setMeasuredWidth(w);
      }
    }
  }, [measuredWidth]);

  const cTop = containerRect?.top ?? 0;
  const cLeft = containerRect?.left ?? 0;
  const cWidth = containerRect?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 390);

  const bTop = rect.top - cTop;
  const bLeft = rect.left - cLeft;
  const bWidth = rect.width;
  const bHeight = rect.height;

  // Capsule width based on enabled tools
  let btnCount = 2; // Pin + Copy
  if (canRetry && onRetry) btnCount++;
  if (isUser && canEdit && onEdit) btnCount++;
  const estimatedWidth = btnCount === 2 ? 140 : btnCount === 3 ? 195 : 252;
  const capsuleWidth = measuredWidth || estimatedWidth;
  const capsuleHeight = 38;

  // Always position above if space permits (bTop >= 58), else below
  const placeAbove = bTop >= 58;
  const capsuleTop = placeAbove
    ? Math.max(8, bTop - capsuleHeight - 16)
    : Math.min(bTop + bHeight + 16, (containerRect?.height ?? 800) - capsuleHeight - 8);

  // Target X where the anchor bubble touches the message bubble corner:
  // For user: top-right corner (18px from its right edge)
  // For model: top-left corner (20px from its left edge)
  const targetX = isUser
    ? Math.max(28, bLeft + bWidth - 18)
    : Math.min(cWidth - 28, bLeft + 20);

  // Position capsule so the upward bubble column (at 18px from capsule edge) aligns directly with targetX:
  let capsuleLeft = isUser
    ? targetX - capsuleWidth + 18
    : targetX - 18;

  // Clamp capsule within container bounds
  capsuleLeft = Math.max(10, Math.min(capsuleLeft, cWidth - capsuleWidth - 10));

  // Compute exact tail offset inside capsule so it aligns with targetX
  const tailOffset = Math.max(18, Math.min(targetX - capsuleLeft, capsuleWidth - 18));

  // Anchor droplet in the message bubble's exact color to seem like an organic extension!
  const anchorColor = isUser
    ? 'var(--hsk-user-bubble-bg, var(--hsk-primary, #007aff))'
    : 'var(--hsk-chat-source-bg, var(--hsk-bubble-bg, rgba(255, 255, 255, 0.12)))';

  let toolIdx = 0;

  return (
    <div className="hsk-tapback-overlay" onClick={onClose}>
      <div
        ref={menuRef}
        className={cn(
          "hsk-tapback-group",
          placeAbove ? "is-above" : "is-below",
          isUser ? "is-user" : "is-ai"
        )}
        style={{
          top: `${capsuleTop}px`,
          left: `${capsuleLeft}px`,
          '--tail-x': `${tailOffset}px`,
          '--hsk-anchor-color': anchorColor,
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

          {isUser && canEdit && onEdit && (
            <button
              type="button"
              className="hsk-tapback-tool-btn hsk-tapback-tool-btn--edit"
              onClick={handleEditAction}
              aria-label={t('edit')}
              style={{ '--tool-idx': toolIdx++ } as React.CSSProperties}
            >
              <EditIcon size={14} />
              <span>{t('edit')}</span>
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

        {/* Upward-flowing connector bubbles:
            - Dot 3 (top): 20px, melted into capsule
            - Dot 2 (middle): 11px, frosted glass
            - Dot 1 (bottom): 6px, in the exact message bubble color, touching the bubble! */}
        <div
          className={cn("hsk-tapback-tail", placeAbove ? "is-above" : "is-below")}
          style={{ left: `${tailOffset}px` }}
        >
          <span className="hsk-tapback-dot hsk-tapback-dot--top">
            <span className="hsk-tapback-dot-bridge" />
          </span>
          <span className="hsk-tapback-dot hsk-tapback-dot--mid" />
          <span className="hsk-tapback-dot hsk-tapback-dot--anchor" />
        </div>
      </div>
    </div>
  );
}
