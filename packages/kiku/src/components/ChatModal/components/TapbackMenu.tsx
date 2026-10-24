import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  scrollEl?: HTMLElement | null;
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
  scrollEl,
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
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const [docked] = useState(() => {
    const view = scrollEl?.getBoundingClientRect();
    return !!view && (rect.top < view.top + 64 || rect.top + rect.height > view.bottom - 8);
  });

  useLayoutEffect(() => {
    const group = anchorEl?.closest<HTMLElement>('.hsk-cb-msg-group');
    if (!group) return;
    const wasInert = group.inert;
    group.setAttribute('data-hsk-tapback-focus', '');
    group.inert = true;
    return () => {
      group.removeAttribute('data-hsk-tapback-focus');
      group.inert = wasInert;
    };
  }, [anchorEl]);

  useLayoutEffect(() => {
    if (!scrollEl) return;
    const previous = scrollEl.getAttribute('data-hsk-tapback-active');
    scrollEl.setAttribute('data-hsk-tapback-active', '');
    return () => {
      if (previous === null) scrollEl.removeAttribute('data-hsk-tapback-active');
      else scrollEl.setAttribute('data-hsk-tapback-active', previous);
    };
  }, [scrollEl]);

  const { closing, requestClose } = useDelayedClose(TAPBACK_EXIT_MS, onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const buttons = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    menuRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); requestClose(); }
      if (e.key !== 'Tab') return;
      const items = buttons();
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.shiftKey ? index <= 0 : index === items.length - 1 || index < 0) {
        e.preventDefault();
        items[e.shiftKey ? items.length - 1 : 0].focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      clearTimeout(copyTimer.current);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [requestClose]);

  const handleCopyAction = useCallback(async () => {
    const ok = await onCopy(msg.content || '');
    if (!ok) return;
    setCopied(true);
    copyTimer.current = setTimeout(requestClose, 450);
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

  const [geometry, setGeometry] = useState(() => ({
    box: rect,
    attachment: rect,
    thought: undefined as typeof rect | undefined,
    container: containerRect,
    viewport: scrollEl?.getBoundingClientRect() as typeof rect | undefined,
    width: 0,
    height: 36,
    scrollTop: scrollEl?.scrollTop ?? 0,
  }));

  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const box = anchorEl?.getBoundingClientRect() ?? rect;
      const attachment = (!isUser ? anchorEl?.querySelector('.hsk-cb-ai-text') : null)?.getBoundingClientRect() ?? box;
      const thought = !isUser ? anchorEl?.querySelector('.hsk-cb-think-head')?.getBoundingClientRect() : undefined;
      const container = containerEl?.getBoundingClientRect() ?? containerRect;
      const viewport = scrollEl?.getBoundingClientRect() ?? container;
      const width = menuRef.current?.offsetWidth ?? 0;
      const height = menuRef.current?.offsetHeight ?? 36;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      setGeometry(previous => {
        const same = (a: typeof container, b: typeof container) => a === b || !!a && !!b
          && ['top', 'left', 'width', 'height'].every(key => Math.abs(a[key as keyof typeof a] - b[key as keyof typeof b]) < 0.5);
        return same(previous.box, box) && same(previous.attachment, attachment) && same(previous.thought, thought) && same(previous.container, container) && same(previous.viewport, viewport)
          && previous.width === width && previous.height === height && previous.scrollTop === scrollTop
          ? previous : { box, attachment, thought, container, viewport, width, height, scrollTop };
      });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    for (const el of [anchorEl, containerEl, scrollEl, menuRef.current]) if (el) observer?.observe(el);
    scrollEl?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      scrollEl?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [anchorEl, containerEl, scrollEl, rect, containerRect, isUser]);

  const [bubbleColor, setBubbleColor] = useState('');
  useEffect(() => {
    if (!anchorEl) return;
    const bg = getComputedStyle(anchorEl).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') setBubbleColor(bg);
  }, [anchorEl]);

  const { box, attachment, thought, container, viewport } = geometry;

  const cTop = container?.top ?? 0;
  const cLeft = container?.left ?? 0;
  const cWidth = container?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 390);

  const bTop = box.top - cTop;
  const bLeft = attachment.left - cLeft;
  const bWidth = attachment.width;
  const bHeight = box.height;

  let btnCount = 2;
  if (canRetry && onRetry) btnCount++;
  const estimatedWidth = btnCount === 2 ? 122 : 170;
  const capsuleWidth = geometry.width || estimatedWidth;
  const capsuleHeight = geometry.height;
  const visualTop = window.visualViewport?.offsetTop ?? 0;
  const visualBottom = visualTop + (window.visualViewport?.height ?? window.innerHeight);
  const viewTop = Math.max(0, Math.max(viewport?.top ?? cTop, visualTop) - cTop);
  const viewBottom = Math.min(container?.height ?? window.innerHeight, Math.min(viewport ? viewport.top + viewport.height : visualBottom, visualBottom) - cTop);
  const minTop = viewTop + 8;
  const maxTop = Math.max(minTop, viewBottom - capsuleHeight - 8);

  const overlayThought = !!thought;
  const placeAbove = overlayThought || docked || bTop - capsuleHeight - 9 >= minTop;
  const idealTop = placeAbove ? bTop - capsuleHeight - 9 : bTop + bHeight + 9;
  const capsuleTop = thought
    ? Math.max(minTop, Math.min(thought.top - cTop + (thought.height - capsuleHeight) / 2, maxTop))
    : docked ? minTop : Math.max(minTop, Math.min(idealTop, maxTop));
  const messageTop = Math.round(box.top - (viewport?.top ?? cTop) + geometry.scrollTop);
  const inset = Math.min(24, bHeight / 2);
  const blurSpan = Math.ceil(Math.max(240, viewport?.height ?? container?.height ?? window.innerHeight) + 64);
  const frost = (
    <>
      <div className={cn("hsk-tapback-frost", "is-upper", closing && "is-closing")} aria-hidden="true" style={{
        top: (scrollEl ? messageTop : bTop) - blurSpan,
        height: blurSpan + inset,
      }} />
      <div className={cn("hsk-tapback-frost", "is-lower", closing && "is-closing")} aria-hidden="true" style={{
        top: (scrollEl ? messageTop : bTop) + bHeight - inset,
        height: blurSpan + inset,
      }} />
    </>
  );

  const wideAI = !isUser && !!anchorEl?.closest('[data-hsk-layout="wide"]');
  const anchorRight = isRTL;
  const targetX = anchorRight
    ? Math.min(cWidth - 18, bLeft + bWidth - 7)
    : Math.max(18, bLeft + 7);

  let capsuleLeft = anchorRight
    ? targetX - capsuleWidth + 18
    : targetX - 18;

  capsuleLeft = Math.max(10, Math.min(capsuleLeft, cWidth - capsuleWidth - 10));

  const tailOffset = Math.max(18, Math.min(targetX - capsuleLeft, capsuleWidth - 18));

  const anchorColor = bubbleColor
    || (isUser
      ? 'var(--hsk-user-bubble-bg, var(--hsk-primary, #007aff))'
      : 'var(--hsk-bubble-bg, #eeeef0)');

  let toolIdx = 0;

  return (
    <div className={cn("hsk-tapback-overlay", closing && "is-closing")} onClick={requestClose}>
      {scrollEl ? createPortal(frost, scrollEl) : frost}
      <div
        ref={menuRef}
        className={cn(
          "hsk-tapback-group",
          wideAI && "is-wide",
          (docked || overlayThought) && "is-docked",
          closing && "is-closing",
          placeAbove ? "is-above" : "is-below",
          isUser ? "is-user" : "is-ai"
        )}
        style={{
          top: `${capsuleTop}px`,
          left: `${capsuleLeft}px`,
          maxWidth: `${Math.max(0, cWidth - 20)}px`,
          '--tail-x': `${tailOffset}px`,
          '--tail-dir': anchorRight ? 1 : -1,
          '--tail-step': isUser ? '9px' : '8px',
          '--hsk-anchor-color': anchorColor,
          '--hsk-skin': 'var(--hsk-bubble-bg, var(--hsk-chat-ai-bg, #eeeef0))',
        } as React.CSSProperties}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Message actions"
        onClick={e => e.stopPropagation()}
      >
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
