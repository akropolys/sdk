import React from 'react';
import { useAkropolysContext, type ChatMessage, type ChatSource, type ChatAction } from '@akropolys/sdk';
import { cn } from '../../../utils/cn';
import { stripToolMarkup } from '../../../utils/toolMarkup';
import { renderMarkdown, safeHref } from '../../../utils/markdown';
import { lineDirection } from '../../../utils/textDirection';
import { LiveTable } from '../../LiveTable';
import { WorkingVeil } from '../../KikuDoodles';
import { ThinkingBlock, parseThinking, isTeamNote } from './ThinkingBlock';
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
  ({ content, streaming, hosts }: { content: string; streaming: boolean; hosts: string }) =>
    <>{renderMarkdown(content, streaming, new Set(hosts.split(',')))}</>,
  (a, b) => a.content === b.content && a.streaming === b.streaming && a.hosts === b.hosts
);
MarkdownBlock.displayName = 'MarkdownBlock';

function hostsOf(urls: Array<string | undefined>): string {
  const hosts = new Set<string>();
  for (const u of urls) {
    if (!u) continue;
    try { hosts.add(new URL(u, location.href).host); } catch { }
  }
  return [...hosts].sort().join(',');
}

// A wrapped bubble is as wide as its longest line, not as wide as it was allowed to grow.
function useSnugWidth(ref: React.RefObject<HTMLElement | null>, text: string) {
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.width = '';
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = Array.from(range.getClientRects());
      const box = el.getBoundingClientRect();
      if (!lines.length || !el.offsetWidth || !box.width) return;
      const scale = box.width / el.offsetWidth; // the send animation scales the bubble while it is measured
      const style = getComputedStyle(el);
      const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      const longest = Math.max(...lines.map(r => r.right)) - Math.min(...lines.map(r => r.left));
      const content = Math.ceil(longest / scale) + 1;
      if (content + pad < el.offsetWidth) el.style.width = `${style.boxSizing === 'border-box' ? content + pad : content}px`;
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
    const row = el.closest('.hsk-cb-msg-group');
    if (!row || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [ref, text]);
}

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
  vizState: Record<string, 'ok' | 'err'>;
  setVizState: React.Dispatch<React.SetStateAction<Record<string, 'ok' | 'err'>>>;
  setLightboxSrc: (src: string | null, gallery?: import('./LightboxModal').LightboxGalleryData) => void;
  setMarkupSrc: (src: string | null) => void;
  handleSend: (text?: string) => Promise<void>;
  handleSourceClick: (src: ChatSource) => void;
  onRetry?: (msg: ChatMessage) => void;
  onEdit?: (msg: ChatMessage) => void;
  onLongPress?: (msg: ChatMessage, rect: { top: number; left: number; width: number; height: number }, isUser: boolean, el: HTMLElement) => void;
  hasError?: boolean;
  retrying?: boolean;
  t: (key: UIStringKey, vars?: Record<string, string>) => string;
  messageRef: (el: HTMLDivElement | null) => void;
  photosSending: boolean;
  workingOn?: string;
  doodleTheme?: string;
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
  photosSending,
  workingOn,
  doodleTheme,
}: MessageItemProps) {
  const api = useAkropolysContext()?.api;
  const doodleSeed = api?.siteId ?? '';
  const imageHosts = hostsOf([api?.apiUrl, ...(isLast ? sources : (msg.sources ?? [])).flatMap(s => [s.image, s.url])]);
  const isUser = msg.role === 'user';
  const displayContent = isUser ? msg.content : stripToolMarkup(msg.content);
  const hiddenToolMarkup = !isUser && displayContent !== msg.content;
  const [copied, setCopied] = React.useState(false);

  const bubbleRef = React.useRef<HTMLDivElement | null>(null);
  useSnugWidth(bubbleRef, msg.content);
  const touchStartPos = React.useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = React.useRef(false);

  const anchorFor = React.useCallback((el: HTMLElement): HTMLElement => {
    const sel = isUser ? '.hsk-cb-user-bubble' : '.hsk-cb-ai-body';
    if (el.matches?.(sel)) return el;
    return (el.querySelector(sel) as HTMLElement) || el;
  }, [isUser]);

  const startLongPress = React.useCallback((targetEl: HTMLElement) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      if (onLongPress) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(25); } catch {}
        }
        const anchor = anchorFor(targetEl);
        const r = anchor.getBoundingClientRect();
        onLongPress(isUser ? msg : { ...msg, content: displayContent }, { top: r.top, left: r.left, width: r.width, height: r.height }, isUser, anchor);
        pressFired.current = true;
      }
      longPressTimer.current = null;
    }, 420);
  }, [msg, displayContent, isUser, onLongPress, anchorFor]);

  const handleTouchStart = React.useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    pressFired.current = false;
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

  const handleTouchEnd = React.useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
    if (pressFired.current && e.cancelable) e.preventDefault(); // the lift's synthetic click would land on the new overlay and close it
  }, []);

  const handleContextMenu = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!onLongPress) return;
    e.preventDefault();
    if (pressFired.current) return;
    const el = anchorFor(e.currentTarget);
    const r = el.getBoundingClientRect();
    onLongPress(isUser ? msg : { ...msg, content: displayContent }, { top: r.top, left: r.left, width: r.width, height: r.height }, isUser, el);
  }, [msg, displayContent, isUser, onLongPress, anchorFor]);

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
  const thinking = stripToolMarkup(msg.thinking || parsed.thinking);
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
      data-hsk-role={isUser ? 'user' : 'assistant'}
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
                  <WorkingVeil active={photosSending} seed={doodleSeed} theme={doodleTheme} />
                  {i === 3 && msg.images!.length > 4 && (
                    <span className="hsk-cb-user-img-more">+{msg.images!.length - 3}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {msg.content && (
            <div
              ref={bubbleRef}
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
              dir={lineDirection(msg.content.replace(/^@kiku\s*/i, ''))}
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
          {isRunEnd && (
            <div className="hsk-cb-user-footer">
              <div className="hsk-cb-msg-actions">
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
          )}
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
                  {!msg.spoken && (thinking || msg.thoughtForSeconds != null || msg.repliedSeconds != null || isTeamNote(msg.statusStage) || (isLast && (streaming || loading))) && (
                    <ThinkingBlock text={thinking} isComplete={isComplete} seconds={msg.thoughtForSeconds} stage={msg.statusStage} repliedSeconds={msg.repliedSeconds} />
                  )}
                  {msg.spoken && typeof msg.thoughtForSeconds === 'number' && msg.thoughtForSeconds > 0 && (
                    <div className="hsk-cb-think">
                      <span className="hsk-cb-think-head hsk-cb-think-head--static">
                        <MicIcon size={11} />
                        <span>spoken · {msg.thoughtForSeconds.toFixed(1)}s</span>
                      </span>
                    </div>
                  )}
                  {!cleanContent && hiddenToolMarkup && !(isLast && (streaming || loading)) && <p className="hsk-cb-ai-content">{t('errStreamInterrupted')}</p>}
                  {cleanContent && (
                    <div className="hsk-cb-ai-content">
                      <MarkdownBlock content={cleanContent} streaming={isLast && streaming} hosts={imageHosts} />
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
              <div className="hsk-cb-viz">
                <div className={cn('hsk-cb-viz--working', !workingOn && 'is-blank', msg.visualizationType === 'video' && 'is-video')} role="status" aria-label={msg.visualizingText || t('vizWorking')}>
                  {workingOn && <img src={workingOn} alt="" />}
                  <WorkingVeil active seed={doodleSeed} theme={doodleTheme} />
                </div>
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
              const isLiveStreaming = isLast && (loading || streaming);
              const msgReferencedIds = isLiveStreaming ? referencedIds : (msg.referencedIds ?? []);
              const msgSources = isLiveStreaming ? sources : (msg.sources ?? []);
              const msgIntent = isLast ? lastIntent : msg.intent;
              const hiddenIntent = msgIntent === 'compare' || msgIntent === 'capture' ||
                msgIntent === 'capture_all' || msgIntent === 'delete' || msgIntent === 'view_history';
              const showCarousel = msgReferencedIds.length > 0 && !hiddenIntent &&
                (!isLast || lastAction?.type !== 'request_kiku_key');
              return showCarousel && (
                <SourcesCarousel
                  sources={msgSources}
                  onSelectSource={handleSourceClick}
                  onImageClick={setLightboxSrc}
                  referencedIds={msgReferencedIds}
                  compact={!!msg.visualization}
                  targetLabel={t('swatchTarget')}
                />
              );
            })()}

            {isLast && !loading && !streaming && lastAction?.type === 'open_memory' && safeHref(lastAction.url) && (
              <a
                className="hsk-cb-memory-pill"
                href={safeHref(lastAction.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('openMemory')}
                <ExternalIcon />
              </a>
            )}

            {isLast && !loading && safeHref(lastAction?.url) && lastAction?.type !== 'open_memory' && (
              <div className="hsk-action-pills">
                <a className="hsk-action-pill" href={safeHref(lastAction?.url)}>
                  {String(lastAction?.type || 'continue').replace(/_/g, ' ')} →
                </a>
              </div>
            )}

            {isLast && !loading && (
              <SmartContextPills
                intent={lastIntent}
                sources={discussedSources}
                onSend={handleSend}
                loading={loading}
              />
            )}

            {!isUser && isRunEnd && !streaming && cleanContent && (
              <div className="hsk-cb-ai-footer">
                <div className="hsk-cb-msg-actions">
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
