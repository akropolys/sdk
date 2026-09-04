import React from 'react';
import type { ChatMessage, ChatSource, ChatAction } from '@akropolys/sdk';
import { cn } from '../../../utils/cn';
import { renderMarkdown } from '../../../utils/markdown';
import { LiveTable } from '../../LiveTable';
import { ThinkingBlock, parseThinking } from './ThinkingBlock';
import { SourcesCarousel } from './SourcesCarousel';
import { SmartContextPills } from './SmartContextPills';
import {
  MicIcon,
  ExternalIcon,
  RetryIcon,
  EditIcon,
  CopyIcon,
  CheckIcon,
} from '../icons';
import type { UIStringKey } from '../types';

const MarkdownBlock = React.memo(
  ({ content, streaming }: { content: string; streaming: boolean }) => <>{renderMarkdown(content, streaming)}</>,
  (a, b) => a.content === b.content && a.streaming === b.streaming
);
MarkdownBlock.displayName = 'MarkdownBlock';

export interface MessageItemProps {
  msg: ChatMessage;
  idx: number;
  isLast: boolean;
  isLastUser: boolean;
  isRunEnd: boolean;
  runMid: boolean;
  runCont: boolean;
  isNarrow: boolean;
  loading: boolean;
  streaming: boolean;
  stopped: boolean;
  interrupted: boolean;
  sources: ChatSource[];
  referencedIds: string[];
  discussedSources: ChatSource[];
  lastIntent: string | null;
  lastAction: ChatAction | null;
  defaultCurrency: string;
  vizState: Record<string, 'ok' | 'err'>;
  setVizState: React.Dispatch<React.SetStateAction<Record<string, 'ok' | 'err'>>>;
  setLightboxSrc: (src: string | null) => void;
  setMarkupSrc: (src: string | null) => void;
  handleSend: (text?: string) => Promise<void>;
  handleSourceClick: (src: ChatSource) => void;
  onRetry?: (msg: ChatMessage) => void;
  onEdit?: (msg: ChatMessage) => void;
  onLongPress?: (msg: ChatMessage, rect: { top: number; left: number; width: number; height: number }, isUser: boolean) => void;
  hasError?: boolean;
  retrying?: boolean;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
  messageRef: (el: HTMLDivElement | null) => void;
}

export function MessageItem({
  msg,
  idx,
  isLast,
  isLastUser,
  isRunEnd,
  runMid,
  runCont,
  isNarrow,
  loading,
  streaming,
  stopped,
  interrupted,
  sources,
  referencedIds,
  discussedSources,
  lastIntent,
  lastAction,
  defaultCurrency,
  vizState,
  setVizState,
  setLightboxSrc,
  setMarkupSrc,
  handleSend,
  handleSourceClick,
  onRetry,
  onEdit,
  onLongPress,
  hasError,
  retrying,
  t,
  messageRef,
}: MessageItemProps) {
  const isUser = msg.role === 'user';
  const displayContent = msg.content;
  const [copied, setCopied] = React.useState(false);

  const touchStartPos = React.useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = React.useCallback((targetEl: HTMLElement) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      if (onLongPress) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(25); } catch {}
        }
        const r = targetEl.getBoundingClientRect();
        onLongPress(msg, { top: r.top, left: r.left, width: r.width, height: r.height }, isUser);
      }
      longPressTimer.current = null;
    }, 420);
  }, [msg, isUser, onLongPress]);

  const handleTouchStart = React.useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    startLongPress(e.currentTarget);
  }, [startLongPress]);

  const handleTouchMove = React.useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const touch = e.touches[0];
    const dist = Math.hypot(touch.clientX - touchStartPos.current.x, touch.clientY - touchStartPos.current.y);
    if (dist > 8) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = React.useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  }, []);

  const handleContextMenu = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!onLongPress) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    onLongPress(msg, { top: r.top, left: r.left, width: r.width, height: r.height }, isUser);
  }, [msg, isUser, onLongPress]);

  React.useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  const handleCopy = React.useCallback((text: string) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, []);

  const parsed = React.useMemo(() => parseThinking(displayContent), [displayContent]);
  const thinking = msg.thinking || parsed.thinking;
  const CALC_DISCLAIMER_REGEX = /(?:^|\n+)(?:[>*_~`\s]*)(?:This is a calculation from live figures,?\s*not a guarantee\s*[—–-]\s*the market can move against it\.?)(?:[>*_~`\s]*)/gi;
  const hasCalcDisclaimer = CALC_DISCLAIMER_REGEX.test(parsed.content);
  const cleanContent = hasCalcDisclaimer ? parsed.content.replace(CALC_DISCLAIMER_REGEX, '').trimEnd() : parsed.content;

  return (
    <div
      className={cn(
        'hsk-cb-msg-group',
        runMid && 'hsk-cb-msg-group--run-mid',
        runCont && 'hsk-cb-msg-group--run-cont',
      )}
      ref={messageRef}
    >
      {isUser ? (
        <div className={`hsk-cb-user-msg${isLastUser ? ' hsk-sent' : ''}`}>
          {msg.images && msg.images.length > 0 && (
            <div className="hsk-cb-user-imgs" data-count={Math.min(msg.images.length, 4)}>
              {msg.images.slice(0, 4).map((img, i) => (
                <button
                  key={i}
                  type="button"
                  className="hsk-cb-user-img-cell"
                  onClick={() => setLightboxSrc(img)}
                >
                  <img src={img} alt={`attachment ${i + 1}`} className="hsk-cb-user-img-thumb" />
                  {i === 3 && msg.images!.length > 4 && (
                    <span className="hsk-cb-user-img-more">+{msg.images!.length - 3}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {msg.content && (
            <div
              className={cn(
                'hsk-cb-user-bubble',
                isRunEnd && 'hsk-cb-user-bubble--tail',
                msg.spoken && 'hsk-cb-user-bubble--spoken',
                hasError && 'hsk-cb-user-bubble--error',
              )}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onContextMenu={handleContextMenu}
            >
              {msg.spoken && <MicIcon className="hsk-cb-spoken-mark" size={10} />}
              {/^@kiku\b/i.test(msg.content) ? (
                <>
                  <span className="hsk-kiku-badge">@kiku</span>
                  {msg.content.replace(/^@kiku\s*/i, '')}
                </>
              ) : msg.content}
            </div>
          )}
          <div className="hsk-cb-user-footer">
            <div className={cn('hsk-cb-msg-actions', hasError && 'hsk-cb-msg-actions--failed')}>
              {onRetry && (hasError || isLastUser) && (
                <button
                  type="button"
                  className="hsk-cb-msg-action hsk-cb-msg-action--retry"
                  onClick={() => onRetry(msg)}
                  aria-label={t('retry')}
                >
                  <RetryIcon className={retrying ? 'hsk-retry-icon--spinning' : ''} size={11} />
                  <span className="hsk-cb-msg-action-label">{t('retry')}</span>
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  className="hsk-cb-msg-action hsk-cb-msg-action--edit"
                  onClick={() => onEdit(msg)}
                  aria-label={t('edit')}
                >
                  <EditIcon size={11} />
                  <span className="hsk-cb-msg-action-label">{t('edit')}</span>
                </button>
              )}
              <button
                type="button"
                className={cn('hsk-cb-msg-action hsk-cb-msg-action--copy', copied && 'hsk-cb-msg-action--copied')}
                onClick={() => handleCopy(msg.content)}
                aria-label={copied ? t('copied') : t('copy')}
              >
                {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                <span className="hsk-cb-msg-action-label">{copied ? t('copied') : t('copy')}</span>
              </button>
            </div>
            {isLastUser && !hasError && (
              <span className="hsk-cb-sent-status">
                {stopped || interrupted ? t('statusStopped') : t('statusSent')}
              </span>
            )}
            {hasError && (
              <span className="hsk-cb-failed-notice">
                <span className="hsk-cb-failed-dot" />
                {t('msgFailed')}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className={cn('hsk-cb-ai-msg', isNarrow && 'hsk-cb-ai-msg--inline')}>
          <div
            className="hsk-cb-ai-body"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onContextMenu={handleContextMenu}
          >
            {(() => {
              const isComplete = msg.thoughtForSeconds != null || cleanContent.length > 0 || !(isLast && (streaming || loading));
              return (
                <>
                  {!msg.spoken && (thinking || msg.thoughtForSeconds != null || (isLast && (streaming || loading))) && (
                    <ThinkingBlock text={thinking} isComplete={isComplete} seconds={msg.thoughtForSeconds} />
                  )}
                  {cleanContent && (
                    <div className="hsk-cb-ai-content">
                      <MarkdownBlock content={cleanContent} streaming={isLast && streaming} />
                    </div>
                  )}
                  {hasCalcDisclaimer && (
                    <div className="hsk-cb-calc-disclaimer">
                      {t('calcDisclaimer')}
                    </div>
                  )}
                </>
              );
            })()}

            {msg.visualizing && (
              <div className="hsk-cb-viz hsk-cb-viz--loading">
                <span className="hsk-cb-viz-spinner" />
                <span>{msg.visualizingText || t('vizWorking')}</span>
              </div>
            )}
            {msg.visualization && (
              <div className="hsk-cb-viz">
                <div className="hsk-cb-viz-imgwrap">
                  {msg.visualizationType === 'video' || msg.visualization.includes('/videos/') ? (
                    <video
                      src={msg.visualization}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="hsk-markdown-video"
                      style={{ display: 'block', maxHeight: '400px', objectFit: 'contain', width: '100%' }}
                    />
                  ) : (
                    <img
                      src={msg.visualization}
                      alt="Product visualized in your photo"
                      className="hsk-markdown-img"
                      style={vizState[msg.visualization] === 'err' ? { display: 'none' } : undefined}
                      onLoad={() => setVizState(p => ({ ...p, [msg.visualization!]: 'ok' }))}
                      onError={() => setVizState(p => ({ ...p, [msg.visualization!]: 'err' }))}
                    />
                  )}
                  {vizState[msg.visualization] === 'err' && (
                    <div className="hsk-cb-viz-broken">{t('vizUnavailable')}</div>
                  )}
                  {isLast && !streaming && vizState[msg.visualization] === 'ok' && (msg.visualizationType !== 'video' && !msg.visualization.includes('/videos/')) && (
                    <button className="hsk-cb-viz-mark" onClick={() => setMarkupSrc(msg.visualization!)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      {t('vizMarkEdit')}
                    </button>
                  )}
                </div>
                <div className="hsk-cb-viz-disclaimer">
                  {msg.visualizationType === 'video' || msg.visualization.includes('/videos/')
                    ? t('vizDisclaimerVideo')
                    : t('vizDisclaimerImage')}
                </div>
              </div>
            )}

            {!isUser && (msg.knowledgeImages?.length ?? 0) > 0 && (
              <div className="hsk-cb-kimgs">
                {msg.knowledgeImages!.map((ref) => (
                  <div key={ref.entryId} className="hsk-cb-kimg-group">
                    <div className="hsk-cb-kimg-grid">
                      {ref.images.map((img, i) => (
                        <img
                          key={i}
                          src={img.url}
                          alt={img.note || ref.title || 'Reference image'}
                          className="hsk-cb-kimg"
                          loading="lazy"
                          onClick={() => setLightboxSrc(img.url)}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ))}
                    </div>
                    {(ref.title || ref.images[0]?.note) && (
                      <div className="hsk-cb-kimg-caption">{ref.title || ref.images[0]?.note}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isUser && <LiveTable keys={msg.liveKeys} />}

            {!isUser && (msg.staleNotices?.length ?? 0) > 0 && (
              <div className="hsk-cb-stale" role="status">
                <div className="hsk-cb-stale-title">{t('staleTitle')}</div>
                {msg.staleNotices!.map((n, i) => (
                  <div key={i} className="hsk-cb-stale-item">
                    {n.state === 'removed'
                      ? t('staleRemoved', { title: n.title })
                      : t('staleUnavailable', { title: n.title })}
                    {n.reason && <span className="hsk-cb-stale-reason"> {n.reason}</span>}
                  </div>
                ))}
              </div>
            )}

            {(() => {
              const msgReferencedIds = isLast ? referencedIds : (msg.referencedIds ?? []);
              const msgSources = isLast ? sources : (msg.sources ?? []);
              const msgIntent = isLast ? lastIntent : msg.intent;
              const hiddenIntent = msgIntent === 'compare' || msgIntent === 'capture' ||
                msgIntent === 'capture_all' || msgIntent === 'delete' || msgIntent === 'view_history';
              const showCarousel = msgReferencedIds.length > 0 && !hiddenIntent &&
                (!isLast || lastAction?.type !== 'request_kiku_key');
              return showCarousel && (
                <SourcesCarousel
                  sources={msgSources}
                  defaultCurrency={defaultCurrency}
                  onSelectSource={handleSourceClick}
                  onImageClick={setLightboxSrc}
                  referencedIds={msgReferencedIds}
                  compact={!!msg.visualization}
                />
              );
            })()}

            {isLast && !loading && !streaming && lastAction?.type === 'open_memory' && lastAction.url && (
              <a
                className="hsk-cb-memory-pill"
                href={String(lastAction.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('openMemory')}
                <ExternalIcon />
              </a>
            )}

            {isLast && !loading && lastAction?.url && lastAction.type !== 'open_memory' && (
              <div className="hsk-action-pills">
                <a className="hsk-action-pill" href={lastAction.url}>
                  {String(lastAction.type || 'continue').replace(/_/g, ' ')} →
                </a>
              </div>
            )}

            {isLast && !loading && (
              <SmartContextPills
                intent={lastIntent}
                sources={discussedSources}
                onSend={handleSend}
                loading={loading}
                defaultCurrency={defaultCurrency}
              />
            )}

            {!isUser && !streaming && cleanContent && (
              <div className="hsk-cb-ai-footer">
                <div className={cn('hsk-cb-msg-actions', (hasError || cleanContent.includes("We're experiencing high demand right now")) && 'hsk-cb-msg-actions--failed')}>
                  <button
                    type="button"
                    className={cn('hsk-cb-msg-action hsk-cb-msg-action--copy', copied && 'hsk-cb-msg-action--copied')}
                    onClick={() => handleCopy(cleanContent)}
                    aria-label={copied ? t('copied') : t('copy')}
                  >
                    {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                    <span className="hsk-cb-msg-action-label">{copied ? t('copied') : t('copy')}</span>
                  </button>
                  {isLast && (hasError || cleanContent.includes("We're experiencing high demand right now")) && onRetry && (
                    <button
                      type="button"
                      className="hsk-cb-msg-action hsk-cb-msg-action--retry"
                      onClick={() => onRetry(msg)}
                      aria-label={t('retry')}
                    >
                      <RetryIcon className={retrying ? 'hsk-retry-icon--spinning' : ''} size={11} />
                      <span className="hsk-cb-msg-action-label">{t('retry')}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
