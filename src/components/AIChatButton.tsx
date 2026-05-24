'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChat, ChatMessage, ChatSource } from '../hooks/useChat';
import { renderMarkdown } from '../utils/markdown';
import { HuskelTheme } from '../types';
import { cn } from '../utils/cn';


export interface AIChatButtonProps {
  label?: string;
  title?: string;
  placeholder?: string;
  backdropColor?: string;
  backdropBlur?: string | number;
  className?: string;
  onSelectSource?: (source: ChatSource) => void;
  defaultCurrency?: string;
  chips?: string[];
  theme?: HuskelTheme;
  classNames?: {
    button?: string;
    overlay?: string;
    panel?: string;
    input?: string;
    sendButton?: string;
  };
}

const SparkleIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);

const ArrowUpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12 7-7 7 7"/>
    <path d="M12 19V5"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

const DEFAULT_CHIPS = [
  'Cheapest smartphone',
  'Smart TV under KSh 20,000',
  'Noise-cancelling headphones',
  'Best laptop for students',
];

interface SourcesCarouselProps {
  sources: ChatSource[];
  defaultCurrency: string;
  onSelectSource?: (src: ChatSource) => void;
}

function SourcesCarousel({ sources, defaultCurrency, onSelectSource }: SourcesCarouselProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [showNext, setShowNext] = useState(false);

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    setShowNext(el.scrollWidth > el.clientWidth + 4 && !atEnd);
  }, []);

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure); };
  }, [measure, sources]);

  const scrollNext = () => {
    railRef.current?.scrollBy({ left: 170, behavior: 'smooth' });
  };

  return (
    <div className="hsk-cb-sources-wrap">
      <div className="hsk-cb-sources" ref={railRef}>
        {sources.map((src, si) => (
          <div
            key={si}
            className="hsk-cb-source"
            style={{ animationDelay: `${si * 50}ms` }}
            onClick={() => onSelectSource?.(src)}
          >
            {src.image ? (
              <div className="hsk-cb-src-imgwrap">
                <img src={src.image} alt={src.name} loading="lazy" />
              </div>
            ) : (
              <div className="hsk-cb-src-imgwrap-empty">
                <SparkleIcon />
              </div>
            )}
            <div className="hsk-cb-src-info">
              <div className="hsk-cb-src-name">{src.name}</div>
              {src.price && (
                <div className="hsk-cb-src-price">
                  {src.currency ?? defaultCurrency}{' '}
                  {parseFloat(src.price.replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {showNext && (
        <>
          <div
            className="hsk-cb-sources-fade"
            style={{ background: 'linear-gradient(to right, transparent, var(--hsk-fade-bg, #0e0e0f))' }}
          />
          <button className="hsk-cb-sources-next" onClick={scrollNext} aria-label="See more">
            <ChevronRightIcon />
          </button>
        </>
      )}
    </div>
  );
}

interface ChatModalProps extends Pick<AIChatButtonProps, 'title' | 'placeholder' | 'backdropColor' | 'backdropBlur' | 'onSelectSource' | 'defaultCurrency' | 'chips' | 'theme' | 'classNames'> {
  onClose: () => void;
}

const getFriendlyError = (err: any) => {
  let str = '';
  if (typeof err === 'string') str = err;
  else if (err && typeof err === 'object' && err.message) str = err.message;
  else try { str = JSON.stringify(err); } catch { str = String(err); }

  if (str.toLowerCase().includes('token limit')) {
    return "You've reached your usage limit. Please update your billing limits in your dashboard to continue.";
  }

  try {
    const parsed = JSON.parse(str);
    return parsed.error || parsed.message || str;
  } catch {
    return str;
  }
};

function ChatModal({
  title = 'Shopping Assistant',
  placeholder = 'Ask me anything — gifts, budget, use case…',
  backdropColor,
  backdropBlur,
  onClose,
  onSelectSource,
  defaultCurrency = 'KES',
  chips = DEFAULT_CHIPS,
  theme,
  classNames = {},
}: ChatModalProps) {
  const { messages, sources, loading, error, send, reset } = useChat();
  const [input, setInput] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ChatSource | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading, selectedProduct]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const handleSourceClick = (src: ChatSource) => {
    setSelectedProduct(src);
    onSelectSource?.(src);
    const q = `Tell me more about the ${src.name}${src.price ? ` (${src.currency ?? defaultCurrency} ${src.price})` : ''} — what are its key specs, who is it best for, and is it worth buying?`;
    send(q);
  };

  const handleSend = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setSelectedProduct(null);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await send(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const t = e.target;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  };

  const blurVal = typeof backdropBlur === 'number' ? `${backdropBlur}px` : (backdropBlur ?? '20px');

  const customStyles = {
    ...(theme?.primaryColor && { '--hsk-primary': theme.primaryColor }),
    ...(theme?.backgroundColor && { '--hsk-bg': theme.backgroundColor }),
    ...(theme?.textColor && { '--hsk-text': theme.textColor }),
    ...(theme?.fontFamily && { '--hsk-font': theme.fontFamily }),
    ...(theme?.borderRadius && { '--hsk-border-radius': theme.borderRadius }),
  } as React.CSSProperties;

  return (
    <div
      className={cn("hsk-cb-overlay", classNames.overlay)}
      onClick={onClose}
      style={{
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`,
        ...(backdropColor ? { background: backdropColor } : {}),
        ...customStyles,
      }}
    >
      <div className={cn("hsk-cb-panel", classNames.panel)} onClick={e => e.stopPropagation()}>

        {/* Top bar */}
        <div className="hsk-cb-topbar">
          <div className="hsk-cb-topbar-left">
            <span className="hsk-cb-topbar-icon" style={{ display: 'flex', alignItems: 'center' }}>
              <SparkleIcon />
            </span>
            <div>
              <div className="hsk-cb-topbar-title">{title}</div>
            </div>
          </div>
          <div className="hsk-cb-topbar-actions">
            {messages.length > 0 && (
              <button className="hsk-cb-topbar-btn" onClick={reset}>Clear chat</button>
            )}
            <button className="hsk-cb-close" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="hsk-cb-msgs">
          {messages.length === 0 ? (
            <div className="hsk-cb-empty">
              <div className="hsk-cb-empty-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <SparkleIcon />
              </div>
              <div className="hsk-cb-empty-title">Find exactly what you need</div>
              <div className="hsk-cb-chips">
                {chips.map(chip => (
                  <button
                    key={chip}
                    className="hsk-cb-chip"
                    onClick={() => handleSend(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg: ChatMessage, idx: number) => {
              const isLast = idx === messages.length - 1;
              const isUser = msg.role === 'user';
              return (
                <div key={idx} className="hsk-cb-msg-group">
                  {isUser ? (
                    <div className="hsk-cb-user-msg">
                      <div className="hsk-cb-user-bubble">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="hsk-cb-ai-msg">
                      <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                        <SparkleIcon />
                      </div>
                      <div className="hsk-cb-ai-body">
                        <div className="hsk-cb-ai-text">{renderMarkdown(msg.content)}</div>

                        {/* Sources as horizontal carousel — only after latest assistant reply */}
                        {isLast && sources.length > 0 && (
                          <SourcesCarousel
                            sources={sources}
                            defaultCurrency={defaultCurrency}
                            onSelectSource={handleSourceClick}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Selected product pinned card — shows while LLM fetches details */}
          {selectedProduct && loading && (
            <div
              className="hsk-cb-selected-product"
              onClick={() => selectedProduct.url && window.open(selectedProduct.url, '_blank')}
            >
              {selectedProduct.image && (
                <img className="hsk-cb-selected-img" src={selectedProduct.image} alt={selectedProduct.name} />
              )}
              <div className="hsk-cb-selected-info">
                <div className="hsk-cb-selected-name">{selectedProduct.name}</div>
                {selectedProduct.price && (
                  <div className="hsk-cb-selected-price">
                    {selectedProduct.currency ?? defaultCurrency} {parseFloat((selectedProduct.price ?? '').replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Typing dots */}
          {loading && (
            <div className="hsk-cb-typing-row">
              <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <SparkleIcon />
              </div>
              <div className="hsk-cb-typing">
                <div className="hsk-cb-dot" />
                <div className="hsk-cb-dot" />
                <div className="hsk-cb-dot" />
              </div>
            </div>
          )}

          {error && <div className="hsk-cb-error">{error}</div>}
          <div ref={bottomRef} style={{ height: 1 }} />
        </div>

        {/* Input */}
        <div className="hsk-cb-input-wrap">
          <div className="hsk-cb-input-box">
            <textarea
              ref={textareaRef}
              className={cn("hsk-cb-textarea", classNames.input)}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={loading}
              autoFocus
            />
            <button
              className={cn("hsk-cb-send", classNames.sendButton)}
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              <ArrowUpIcon />
            </button>
          </div>
          <div className="hsk-cb-hint">Huskel AI · searches the whole catalogue in real time</div>
        </div>

      </div>
    </div>
  );
}

export function AIChatButton({
  label,
  title,
  placeholder,
  backdropColor,
  backdropBlur,
  className,
  onSelectSource,
  defaultCurrency,
  chips,
  theme,
  classNames = {},
}: AIChatButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const customStyles = {
    ...(theme?.primaryColor && { '--hsk-primary': theme.primaryColor }),
    ...(theme?.backgroundColor && { '--hsk-bg': theme.backgroundColor }),
    ...(theme?.textColor && { '--hsk-text': theme.textColor }),
    ...(theme?.fontFamily && { '--hsk-font': theme.fontFamily }),
    ...(theme?.borderRadius && { '--hsk-border-radius': theme.borderRadius }),
  } as React.CSSProperties;

  return (
    <>
      <button
        className={cn("hsk-cb-btn", classNames.button, className)}
        onClick={() => setOpen(true)}
        style={customStyles}
        aria-label="Open AI chat"
      >
        <span className="hsk-cb-btn-icon" style={{ display: 'flex', alignItems: 'center' }}>
          <SparkleIcon />
        </span>
        {label !== undefined ? label : null}
      </button>
      {open && mounted && createPortal(
        <ChatModal
          title={title}
          placeholder={placeholder}
          backdropColor={backdropColor}
          backdropBlur={backdropBlur}
          onClose={() => setOpen(false)}
          onSelectSource={onSelectSource}
          defaultCurrency={defaultCurrency}
          chips={chips}
          theme={theme}
          classNames={classNames}
        />,
        document.body
      )}
    </>
  );
}
