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

  // Capsule width based on enabled tools (refined, compact proportions)
  let btnCount = 2; // Pin + Copy
  if (canRetry && onRetry) btnCount++;
  if (isUser && canEdit && onEdit) btnCount++;
  const estimatedWidth = btnCount === 2 ? 120 : btnCount === 3 ? 172 : 228;
  const capsuleWidth = measuredWidth || estimatedWidth;
  const capsuleHeight = 35;

  // Decide layout mode:
  // For user response: bubbles come from the left side of the user bubble!
  // If space permits on the left, place capsule to the left of the bubble.
  const isHorizontalUser = isUser && (bLeft - 10 >= capsuleWidth || bLeft >= 180);

  let capsuleLeft: number;
  let capsuleTop: number;
  let tailOffset = 0;
  let placeAbove = true;

  if (isHorizontalUser) {
    // Position to the LEFT of the user message bubble:
    // Right edge of capsule sits 10px to the left of user bubble
    capsuleLeft = Math.max(8, bLeft - capsuleWidth - 10);
    // Vertically center capsule with user bubble
    const bubbleCenterY = bTop + bHeight / 2;
    capsuleTop = Math.max(8, Math.min(bubbleCenterY - capsuleHeight / 2, (containerRect?.height ?? 800) - capsuleHeight - 8));
  } else {
    // Model message (or fallback if user message has no space to the left):
    // "for model response, top is ok"
    placeAbove = bTop >= 50;
    capsuleTop = placeAbove
      ? Math.max(8, bTop - capsuleHeight - 10)
      : Math.min(bTop + bHeight + 10, (containerRect?.height ?? 800) - capsuleHeight - 8);

    const targetX = isUser ? Math.max(20, bLeft + 20) : Math.min(cWidth - 20, bLeft + 20);
    capsuleLeft = Math.max(10, Math.min(targetX - 20, cWidth - capsuleWidth - 10));
    tailOffset = Math.max(16, Math.min(targetX - capsuleLeft, capsuleWidth - 16));
  }

  let toolIdx = 0;

  return (
    <div className="hsk-tapback-overlay" onClick={onClose}>
      <div
        ref={menuRef}
        className={cn(
          "hsk-tapback-group",
          isHorizontalUser ? "is-side-left" : (placeAbove ? "is-above" : "is-below"),
          isUser ? "is-user" : "is-ai"
        )}
        style={{
          top: `${capsuleTop}px`,
          left: `${capsuleLeft}px`,
          '--tail-x': `${tailOffset}px`,
        } as React.CSSProperties}
        onClick={e => e.stopPropagation()}
      >
        {/* Floating Refined Capsule with tools */}
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

        {/* Fused connector speech bubble: side tail for user message, vertical tail for model response */}
        {isHorizontalUser ? (
          <div className="hsk-tapback-tail hsk-tapback-tail--side">
            <span className="hsk-tapback-dot hsk-tapback-dot--medium" />
            <span className="hsk-tapback-dot hsk-tapback-dot--small" />
          </div>
        ) : (
          <div
            className={cn("hsk-tapback-tail hsk-tapback-tail--vertical", placeAbove ? "is-above" : "is-below")}
            style={{ left: `${tailOffset}px` }}
          >
            <span className="hsk-tapback-dot hsk-tapback-dot--medium" />
            <span className="hsk-tapback-dot hsk-tapback-dot--small" />
          </div>
        )}
      </div>
    </div>
  );
}
