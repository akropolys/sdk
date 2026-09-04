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

  const cTop = containerRect?.top ?? 0;
  const cLeft = containerRect?.left ?? 0;
  const cWidth = containerRect?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 390);

  const bTop = rect.top - cTop;
  const bLeft = rect.left - cLeft;
  const bWidth = rect.width;
  const bHeight = rect.height;

  // Approximate capsule width based on enabled tools
  let btnCount = 2; // Pin + Copy
  if (canRetry && onRetry) btnCount++;
  if (isUser && canEdit && onEdit) btnCount++;
  const capsuleWidth = btnCount * 65 + 16;

  // Position above or below bubble
  const placeAbove = bTop >= 56;
  const capsuleTop = placeAbove ? Math.max(8, bTop - 48) : bTop + bHeight + 14;

  let capsuleLeft = isUser ? bLeft + bWidth - capsuleWidth : bLeft;
  capsuleLeft = Math.max(10, Math.min(capsuleLeft, cWidth - capsuleWidth - 10));

  // Dual connector dots anchor
  const tailSide = isUser ? 'right' : 'left';
  const targetX = isUser ? Math.min(bLeft + bWidth - 24, cWidth - 28) : Math.max(bLeft + 24, 28);
  const tailOffset = Math.max(16, Math.min(targetX - capsuleLeft, capsuleWidth - 22));

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
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Floating Capsule with tools */}
        <div className="hsk-tapback-capsule">
          <button
            type="button"
            className="hsk-tapback-tool-btn hsk-tapback-tool-btn--pin"
            onClick={handlePinAction}
            aria-label="Pin to Kiku Memory"
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
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            <span>{copied ? t('copied') : t('copy')}</span>
          </button>
        </div>

        {/* Dual connector speech bubbles */}
        <div
          className={cn("hsk-tapback-tail", `hsk-tapback-tail--${tailSide}`, placeAbove ? "is-above" : "is-below")}
          style={{ left: `${tailOffset}px` }}
        >
          <span className="hsk-tapback-dot hsk-tapback-dot--large" />
          <span className="hsk-tapback-dot hsk-tapback-dot--small" />
        </div>
      </div>
    </div>
  );
}
