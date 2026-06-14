'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChat, ChatMessage, ChatSource } from '../hooks/useChat';
import { usePaymentPolling } from '../hooks/usePaymentPolling';
import { useAkropolysContext } from './AkropolysProvider';
import { renderMarkdown } from '../utils/markdown';
import { AkropolysTheme, CartPayload, CartItem } from '../types';
import { cn } from '../utils/cn';
import { ComparisonMatrix } from './ComparisonMatrix';
import { resolveDisplayFields } from '../client';


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
  theme?: 'light' | 'dark' | AkropolysTheme;
  classNames?: {
    button?: string;
    overlay?: string;
    panel?: string;
    input?: string;
    sendButton?: string;
  };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

/**
 * Akropolys brand mark — an ancient serif capital Alpha (Α)
 * with an animated smooth breathing mark (spiritus lenis ʻ) at top-left.
 * The mark pulses gently, like a breath.
 */
const AkropolysAIcon = ({ className, size = 18 }: { className?: string; size?: number }) => (
  <svg
    className={cn("hsk-brand-a", className)}
    width={size}
    height={size}
    viewBox="0 0 28 30"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Akropolys"
  >
    {/* Left leg: elegant thin stroke */}
    <path
      d="M14.5 4.5 L6.5 25"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    {/* Right leg: bold ancient serif thick stroke */}
    <path
      d="M14.5 4.5 L22.5 25"
      stroke="currentColor"
      strokeWidth="4.2"
      strokeLinecap="round"
    />
    {/* Crossbar */}
    <path
      d="M9.5 17 H19.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* Left base serif */}
    <path
      d="M3 25 H10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* Right base serif */}
    <path
      d="M19 25 H26"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Smooth breathing mark (spiritus lenis) at top-left — animated */}
    <path
      d="M8.5 2.5 C10 2.5, 11 3.5, 11 5 C11 7, 8.5 8.5, 7.5 9.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
      className="hsk-akr-breath"
    />
  </svg>
);

/** Keep a tiny sparkle alias for places that still want the star (sources, etc.) */
const SparkleIcon = AkropolysAIcon;

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

const HistoryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M12 7v5l4 2"/>
  </svg>
);

const NewChatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

const ShoppingBagIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
);

const SecureShieldIcon = ({ className, size = 18 }: { className?: string; size?: number }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    <path d="M12 11v4" />
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CHIPS = [
  'Cheapest smartphone',
  'Smart TV under KSh 20,000',
  'Noise-cancelling headphones',
  'Best laptop for students',
];

const SESSIONS_KEY = 'akropolys_chat_sessions';
const MAX_SESSIONS = 20;

// ─── Session types ─────────────────────────────────────────────────────────────

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  ts: number;
}

function loadSessions(): ChatSession[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: ChatSession[]) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {}
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Cart Context Card ─────────────────────────────────────────────────────────

interface CartContextCardProps {
  cart: CartPayload;
  defaultCurrency: string;
}

function CartContextCard({ cart, defaultCurrency }: CartContextCardProps) {
  if (!cart.items || cart.items.length === 0) return null;

  const currency = cart.currency || defaultCurrency;
  const total = cart.total ?? cart.items.reduce((s, i) => s + i.price_numeric * i.quantity, 0);

  return (
    <div className="hsk-cart-card">
      <div className="hsk-cart-card-header">
        <ShoppingBagIcon />
        <span>Your cart · {cart.item_count ?? cart.items.length} item{(cart.item_count ?? cart.items.length) !== 1 ? 's' : ''}</span>
      </div>
      <div className="hsk-cart-items">
        {cart.items.map((item) => (
          <div key={item.id} className="hsk-cart-item">
            <div className="hsk-cart-item-img-wrap">
              {item.image ? (
                <img className="hsk-cart-item-img" src={item.image} alt={item.name} loading="lazy" />
              ) : (
                <div className="hsk-cart-item-img-placeholder">
                  <ShoppingBagIcon />
                </div>
              )}
              {item.quantity > 1 && (
                <span className="hsk-cart-item-qty">{item.quantity}</span>
              )}
            </div>
            <div className="hsk-cart-item-info">
              <div className="hsk-cart-item-name">{item.name}</div>
              <div className="hsk-cart-item-price">
                {item.quantity > 1 && <span className="hsk-cart-item-qty-label">{item.quantity}× </span>}
                {currency} {(item.price_numeric * item.quantity).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hsk-cart-total">
        <span>Total</span>
        <span className="hsk-cart-total-amount">{currency} {total.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Action Pills ──────────────────────────────────────────────────────────────

interface ActionPillsProps {
  cart: CartPayload;
  actionType?: string;
  onSend: (text: string) => void;
  loading: boolean;
}

function ActionPills({ cart, actionType, onSend, loading }: ActionPillsProps) {
  const hasItems = cart.items && cart.items.length > 0;
  const lastItem = hasItems ? cart.items[cart.items.length - 1] : null;

  const pills: { label: string; query: string; emoji: string }[] = [];

  if (hasItems && lastItem) {
    if (actionType === 'add_to_cart') {
      pills.push({ emoji: '➕', label: 'Add 1 more', query: `Add one more ${lastItem.name} to my cart` });
      pills.push({ emoji: '🗑️', label: `Remove ${lastItem.name.split(' ')[0]}`, query: `Remove the ${lastItem.name} from my cart` });
    }
    if (cart.items.length > 1) {
      pills.push({ emoji: '🛒', label: 'View cart', query: 'Show me my cart' });
    }
    pills.push({ emoji: '💳', label: 'Checkout', query: 'Proceed to checkout' });
    pills.push({ emoji: '🛍️', label: 'Keep shopping', query: 'What else do you recommend?' });
  } else if (actionType === 'clear_cart' || actionType === 'remove_from_cart') {
    pills.push({ emoji: '🛍️', label: 'Continue shopping', query: 'Show me popular products' });
    pills.push({ emoji: '🔍', label: 'Search again', query: 'Help me find something' });
  } else if (actionType === 'view_cart') {
    if (hasItems) {
      pills.push({ emoji: '💳', label: 'Checkout', query: 'Proceed to checkout' });
      pills.push({ emoji: '🗑️', label: 'Clear cart', query: 'Clear my cart' });
    }
  }

  if (pills.length === 0) return null;

  return (
    <div className="hsk-action-pills">
      {pills.map((pill) => (
        <button
          key={pill.query}
          className="hsk-action-pill"
          onClick={() => onSend(pill.query)}
          disabled={loading}
        >
          <span className="hsk-pill-emoji">{pill.emoji}</span>
          {pill.label}
        </button>
      ))}
    </div>
  );
}

// ─── Sources Carousel ──────────────────────────────────────────────────────────

interface SourcesCarouselProps {
  sources: ChatSource[];
  defaultCurrency: string;
  onSelectSource?: (src: ChatSource) => void;
}

function SourcesCarousel({ sources, defaultCurrency, onSelectSource }: SourcesCarouselProps) {
  const client = useAkropolysContext();
  const isProperty = client?.vertical === 'property';
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
        {sources.map((src, si) => {
          const { title, image, price } = resolveDisplayFields(src.fields || src, client?.display);
          return (
            <div
              key={si}
              className="hsk-cb-source"
              style={{ animationDelay: `${si * 50}ms` }}
              onClick={() => onSelectSource?.(src)}
            >
              {image ? (
                <div className="hsk-cb-src-imgwrap" style={{ position: 'relative' }}>
                  <img src={image} alt={title} loading="lazy" />
                  {isProperty && (
                    <div style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(14, 14, 15, 0.75)',
                      backdropFilter: 'blur(4px)',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fbbf24', // Gold sparkle badge
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      <SparkleIcon size={12} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="hsk-cb-src-imgwrap-empty">
                  <SparkleIcon />
                </div>
              )}
              <div className="hsk-cb-src-info">
                <div className="hsk-cb-src-name">{title}</div>
                {price && (
                  <div className="hsk-cb-src-price">
                    {src.fields?.currency ?? src.currency ?? defaultCurrency}{' '}
                    {parseFloat(String(price).replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
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

// ─── Strip markdown tables (used for compare view to avoid duplicate) ──────────

function stripMarkdownTables(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (line.trim().startsWith('|')) continue;   // table row or separator
    out.push(line);
  }
  // Collapse runs of 3+ blank lines down to 2
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Smart context pills ──────────────────────────────────────────────────────
// Shown after every assistant response (when there's no cart action).
// Pills are generated from the current intent + sources so they're always relevant.

function SmartContextPills({
  intent,
  sources,
  onSend,
  loading,
}: {
  intent: string | null;
  sources: ChatSource[];
  onSend: (text: string) => void;
  loading: boolean;
}) {
  const client = useAkropolysContext();
  const isProperty = client?.vertical === 'property';
  if (!intent) return null;

  const pills: { label: string; query: string; emoji: string }[] = [];

  // Find the cheapest product in the sources list
  const cheapest =
    sources.length > 0
      ? sources.reduce((min, s) => {
          const sFields = resolveDisplayFields(s.fields || s, client?.display);
          const minFields = resolveDisplayFields(min.fields || min, client?.display);
          const p = parseFloat(String(sFields.price ?? '').replace(/[^0-9.]/g, ''));
          const m = parseFloat(String(minFields.price ?? '').replace(/[^0-9.]/g, ''));
          return !isNaN(p) && (isNaN(m) || p < m) ? s : min;
        }, sources[0])
      : null;

  const cheapestFields = cheapest ? resolveDisplayFields(cheapest.fields || cheapest, client?.display) : null;
  const firstFields = sources[0] ? resolveDisplayFields(sources[0].fields || sources[0], client?.display) : null;
  const firstName = firstFields?.title ?? '';

  const firstTwoFields = sources.slice(0, 2).map(s => resolveDisplayFields(s.fields || s, client?.display));
  const firstTwo = firstTwoFields.map(f => f.title);

  if (intent === 'search' && sources.length > 0) {
    if (firstTwo.length >= 2) {
      pills.push({
        emoji: '⚖️',
        label: 'Compare top 2',
        query: `Compare the ${firstTwo[0]} and ${firstTwo[1]}`,
      });
    }
    if (cheapest && cheapestFields && !isProperty) {
      const short = cheapestFields.title.split(' ').slice(0, 3).join(' ');
      pills.push({
        emoji: '🛒',
        label: `Add ${short}`,
        query: `Add the ${cheapestFields.title} to my cart`,
      });
    }
    if (isProperty) {
      pills.push({ emoji: '💰', label: 'Under KSh 5M', query: 'Show me options under KSh 5,000,000' });
    } else {
      pills.push({ emoji: '💰', label: 'Under KSh 20K', query: 'Show me options under KSh 20,000' });
    }
  } else if (intent === 'compare' && sources.length > 0) {
    if (cheapest && cheapestFields && !isProperty) {
      const short = cheapestFields.title.split(' ').slice(0, 3).join(' ');
      pills.push({
        emoji: '🛒',
        label: `Add ${short}`,
        query: `Add the ${cheapestFields.title} to my cart`,
      });
    }
    if (firstName) {
      pills.push({
        emoji: '🔍',
        label: 'Similar options',
        query: isProperty
          ? `Show me more properties similar to the ${firstName}`
          : `Show me more products similar to the ${firstName}`,
      });
    }
    pills.push({ emoji: '💡', label: 'Which is best?', query: 'Which one would you recommend and why?' });
  } else if (intent === 'specs' && sources.length > 0) {
    if (firstName) {
      if (!isProperty) {
        pills.push({ emoji: '🛒', label: 'Add to cart', query: `Add the ${firstName} to my cart` });
      }
      pills.push({
        emoji: '🔄',
        label: 'Find alternatives',
        query: `What are good alternatives to the ${firstName}?`,
      });
    }
  } else if (intent === 'general') {
    if (isProperty) {
      pills.push({ emoji: '🔍', label: 'Show popular listings', query: 'What are your most popular properties?' });
    } else {
      pills.push({ emoji: '🔍', label: 'Show popular items', query: 'What are your most popular products?' });
    }
    pills.push({ emoji: '💡', label: 'Recommend something', query: 'What do you recommend for me?' });
  }

  if (pills.length === 0) return null;

  return (
    <div className="hsk-action-pills">
      {pills.map(pill => (
        <button
          key={pill.query}
          className="hsk-action-pill"
          onClick={() => onSend(pill.query)}
          disabled={loading}
        >
          <span className="hsk-pill-emoji">{pill.emoji}</span>
          {pill.label}
        </button>
      ))}
    </div>
  );
}

// ─── Error helper ──────────────────────────────────────────────────────────────

const getFriendlyError = (err: any) => {
  let str = '';
  if (typeof err === 'string') str = err;
  else if (err && typeof err === 'object' && err.message) str = err.message;
  else try { str = JSON.stringify(err); } catch { str = String(err); }

  const lower = str.toLowerCase();
  if (
    lower.includes('429') ||
    lower.includes('too many requests') ||
    lower.includes('requests per minute limit exceeded') ||
    lower.includes('too_many_requests_error') ||
    lower.includes('request_quota_exceeded') ||
    lower.includes('quota')
  ) {
    return 'The assistant is currently receiving too many requests. Please try again in a few moments.';
  }

  if (lower.includes('token limit')) {
    return "You've reached your usage limit. Please update your billing limits in your dashboard to continue.";
  }

  try {
    const parsed = JSON.parse(str);
    return parsed.error || parsed.message || str;
  } catch {
    return str;
  }
};

// ─── ChatModal Props ───────────────────────────────────────────────────────────

interface ChatModalProps extends Pick<AIChatButtonProps, 'title' | 'placeholder' | 'backdropColor' | 'backdropBlur' | 'onSelectSource' | 'defaultCurrency' | 'chips' | 'theme' | 'classNames'> {
  theme?: 'light' | 'dark' | AkropolysTheme;
  classNames?: any;
  onClose: () => void;
}

// ─── ChatModal ─────────────────────────────────────────────────────────────────

function parseThinking(text: string): { thinking: string; content: string; isComplete: boolean } {
  const openMatch = text.match(/<\s*thinking\s*>/i);
  if (!openMatch) {
    return { thinking: '', content: text, isComplete: true };
  }

  const openIdx = openMatch.index ?? 0;
  const openTagLength = openMatch[0].length;
  const start = openIdx + openTagLength;
  
  const contentBefore = text.slice(0, openIdx);
  const textAfterOpen = text.slice(start);
  
  const closeMatch = textAfterOpen.match(/<\/\s*thinking\s*>/i);
  if (!closeMatch) {
    return { 
      thinking: textAfterOpen, 
      content: contentBefore, 
      isComplete: false 
    };
  }

  const closeIdx = closeMatch.index ?? 0;
  const closeTagLength = closeMatch[0].length;
  
  return {
    thinking: textAfterOpen.slice(0, closeIdx),
    content: contentBefore + textAfterOpen.slice(closeIdx + closeTagLength),
    isComplete: true
  };
}

function ThinkingBlock({ text, isComplete }: { text: string; isComplete: boolean }) {
  const [isOpen, setIsOpen] = useState(true);

  // Auto-expand when streaming thinking content
  useEffect(() => {
    if (!isComplete) {
      setIsOpen(true);
    }
  }, [isComplete]);

  return (
    <div style={{
      marginBottom: '12px',
      borderLeft: '2px solid #e4e4e7',
      paddingLeft: '10px',
      fontSize: '0.825rem',
      backgroundColor: 'rgba(244, 244, 245, 0.4)',
      padding: '8px 10px',
      borderRadius: '0 6px 6px 0'
    }}>
      <div 
        onClick={() => setIsOpen(!isOpen)} 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#71717a',
          cursor: 'pointer',
          fontWeight: 500,
          userSelect: 'none'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: !isComplete ? 'spin 3s linear infinite' : 'none' }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          Thinking Process
        </span>
        {!isComplete && (
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            display: 'inline-block',
            animation: 'hsk-pulse 1.2s infinite ease-in-out'
          }} />
        )}
        <span style={{ 
          fontSize: '0.7rem', 
          marginLeft: 'auto',
          transform: isOpen ? 'rotate(90deg)' : 'none', 
          transition: 'transform 0.1s' 
        }}>▶</span>
      </div>
      {isOpen && (
        <div style={{
          marginTop: '6px',
          color: '#52525b',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.4',
          fontStyle: 'italic'
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

const PROPERTY_CHIPS = [
  '3 bedroom apartments',
  'Houses under KSh 5,000,000',
  'Properties in Palm Beach',
  'Studio apartments with pool',
];

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
  const client = useAkropolysContext();
  const { messages, sources, loading, streaming, error, lastAction, lastIntent, send, reset } = useChat();
  const [input, setInput] = useState('');
  const isProperty = client.vertical === 'property';
  const activeChips = chips === DEFAULT_CHIPS && isProperty ? PROPERTY_CHIPS : chips;
  const activeTitle = title === 'Shopping Assistant' && isProperty ? 'Property Assistant' : title;
  const activePlaceholder = placeholder === 'Ask me anything — gifts, budget, use case…' && isProperty
    ? 'Ask me anything — location, budget, bedrooms…'
    : placeholder;
  const [selectedProduct, setSelectedProduct] = useState<ChatSource | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [phoneInput, setPhoneInput] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('akropolys_user_phone') || '';
    }
    return '';
  });
  const [merchantRef, setMerchantRef] = useState<string | null>(null);
  const [paymentPhase, setPaymentPhase] = useState<'idle' | 'prompt_phone' | 'awaiting' | 'done' | 'failed'>('idle');

  // ── History sidebar ──────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [replayMessages, setReplayMessages] = useState<ChatMessage[] | null>(null); // null = live session

  // ── Payment polling ──────────────────────────────────────────────────────────
  const { status: pollStatus } = usePaymentPolling({
    client: client.api,
    merchantReference: merchantRef,
    onSuccess: () => {
      setPaymentPhase('done');
      setMerchantRef(null);
    },
    onFailure: () => {
      setPaymentPhase('failed');
      setMerchantRef(null);
    },
  });

  // React to lastAction from chat
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.type === 'request_phone') {
      setPaymentPhase('prompt_phone');
    } else if (lastAction.type === 'awaiting_payment') {
      setMerchantRef(lastAction.merchantReference ?? null);
      setPaymentPhase('awaiting');
    }
  }, [lastAction]);

  const isStringTheme = typeof theme === 'string';
  const hskThemeAttr = isStringTheme ? theme : undefined;

  const customStyles = (!isStringTheme && theme) ? {
    ...(theme?.primaryColor && { '--hsk-primary': theme.primaryColor }),
    ...(theme?.backgroundColor && { '--hsk-bg': theme.backgroundColor }),
    ...(theme?.textColor && { '--hsk-text': theme.textColor }),
    ...(theme?.fontFamily && { '--hsk-font': theme.fontFamily }),
    ...(theme?.borderRadius && { '--hsk-border-radius': theme.borderRadius }),
  } as React.CSSProperties : undefined;

  const handlePhoneSubmit = async () => {
    if (!phoneInput.trim()) return;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('akropolys_user_phone', phoneInput.trim());
      }

      const isHistoryIntent = lastIntent === 'capture' || lastIntent === 'delete' || lastIntent === 'view_history';
      if (isHistoryIntent) {
        setPaymentPhase('idle');
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
          await send(lastUserMsg.content);
        }
        return;
      }

      const res = await client.api.initiatePayment(phoneInput.trim());
      setMerchantRef(res.merchantReference);
      setPaymentPhase('awaiting');
    } catch (e: any) {
      console.error('[Akropolys] initiatePayment error', e);
      setPaymentPhase('failed');
    }
  };

  // Auto-scroll: only when the user is already pinned near the bottom (within 120px).
  // This lets them freely scroll up to re-read earlier messages while streaming continues.
  const msgsContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = msgsContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, selectedProduct]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // ── Save session on reset or close ───────────────────────────────────────────
  const saveCurrentSession = useCallback(() => {
    if (messages.length < 2) return; // Nothing worth saving
    const firstUser = messages.find(m => m.role === 'user');
    const session: ChatSession = {
      id: `session_${Date.now()}`,
      title: firstUser ? firstUser.content.slice(0, 60) : 'Chat session',
      messages: messages,
      ts: Date.now(),
    };
    const updated = [session, ...sessions].slice(0, MAX_SESSIONS);
    setSessions(updated);
    saveSessions(updated);
  }, [messages, sessions]);

  const handleReset = useCallback(() => {
    saveCurrentSession();
    reset();
    setReplayMessages(null);
    setPaymentPhase('idle');
    setMerchantRef(null);
  }, [reset, saveCurrentSession]);

  const handleSourceClick = (src: ChatSource) => {
    setSelectedProduct(src);
    onSelectSource?.(src);
    const { title, price } = resolveDisplayFields(src.fields || src, client?.display);
    const q = `Tell me more about the ${title}${price ? ` (${src.fields?.currency ?? src.currency ?? defaultCurrency} ${price})` : ''} — what are its key specs, who is it best for, and is it worth buying?`;
    send(q);
  };

  const handleSend = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    // If we're in replay mode, exit replay and continue live
    setReplayMessages(null);
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

  // The messages to display: replay or live
  const displayMessages = replayMessages ?? messages;

  // ── Load a historical session ─────────────────────────────────────────────────
  const loadSession = (session: ChatSession) => {
    setReplayMessages(session.messages);
    setSidebarOpen(false);
  };

  // ── Delete a session ──────────────────────────────────────────────────────────
  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    saveSessions(updated);
  };

  return (
    <div
      className={cn("hsk-cb-overlay", classNames.overlay)}
      onClick={onClose}
      data-hsk-theme={hskThemeAttr}
      style={{
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`,
        ...(backdropColor ? { background: backdropColor } : {}),
        ...customStyles,
      }}
    >
      <div className={cn("hsk-cb-panel hsk-cb-panel--with-sidebar", classNames.panel)} onClick={e => e.stopPropagation()}>

        {/* ── History Sidebar ── */}
        <div className={cn("hsk-cb-sidebar", sidebarOpen && "hsk-cb-sidebar--open")}>
          <div className="hsk-cb-sidebar-header">
            <span className="hsk-cb-sidebar-title">History</span>
            <button
              className="hsk-cb-sidebar-new"
              onClick={handleReset}
              title="New chat"
            >
              <NewChatIcon />
              <span>New chat</span>
            </button>
          </div>
          <div className="hsk-cb-sidebar-list">
            {sessions.length === 0 ? (
              <div className="hsk-cb-sidebar-empty">
                <HistoryIcon />
                <span>No history yet</span>
              </div>
            ) : (
              sessions.map(session => (
                <div
                  key={session.id}
                  className={cn(
                    "hsk-cb-sidebar-session",
                    replayMessages === session.messages && "hsk-cb-sidebar-session--active"
                  )}
                  onClick={() => loadSession(session)}
                >
                  <div className="hsk-cb-sidebar-session-title">{session.title}</div>
                  <div className="hsk-cb-sidebar-session-meta">{relativeTime(session.ts)}</div>
                  <button
                    className="hsk-cb-sidebar-session-del"
                    onClick={(e) => deleteSession(session.id, e)}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Main Chat Area ── */}
        <div className="hsk-cb-main">

          {/* Top bar */}
          <div className="hsk-cb-topbar">
            <div className="hsk-cb-topbar-left">
              {/* Sidebar toggle (always visible) */}
              <button
                className={cn("hsk-cb-sidebar-toggle", sidebarOpen && "hsk-cb-sidebar-toggle--active")}
                onClick={(e) => { e.stopPropagation(); setSidebarOpen(v => !v); }}
                aria-label="Toggle history"
              >
                <HistoryIcon />
              </button>
              <span className="hsk-cb-topbar-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <SparkleIcon />
              </span>
              <div>
                <div className="hsk-cb-topbar-title">{activeTitle}</div>
              </div>
            </div>
            <div className="hsk-cb-topbar-actions">
              {replayMessages ? (
                <button className="hsk-cb-topbar-btn" onClick={() => { setReplayMessages(null); }}>← Live chat</button>
              ) : (
                messages.length > 0 && (
                  <button className="hsk-cb-topbar-btn" onClick={handleReset}>Clear chat</button>
                )
              )}
              <button className="hsk-cb-close" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Replay banner */}
          {replayMessages && (
            <div className="hsk-cb-replay-banner">
              <HistoryIcon />
              <span>You're viewing a past conversation.</span>
              <button onClick={() => setReplayMessages(null)}>Back to chat →</button>
            </div>
          )}

          {/* Messages */}
          <div className="hsk-cb-msgs" ref={msgsContainerRef}>
            {displayMessages.length === 0 ? (
              <div className="hsk-cb-empty">
                <div className="hsk-cb-empty-icon" style={{ display: 'flex', alignItems: 'center' }}>
                  <SparkleIcon />
                </div>
                <div className="hsk-cb-empty-title">Find exactly what you need</div>
                <div className="hsk-cb-chips">
                  {activeChips.map(chip => (
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
              displayMessages.map((msg: ChatMessage, idx: number) => {
                const isLast = idx === displayMessages.length - 1 && !replayMessages;
                const isUser = msg.role === 'user';
                // Strip the LLM's markdown table for compare so ComparisonMatrix isn't duplicated
                const displayContent =
                  !isUser && isLast && lastIntent === 'compare' && sources.length >= 2 && !replayMessages
                    ? stripMarkdownTables(msg.content)
                    : msg.content;
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
                          {(() => {
                            const { thinking, content, isComplete } = parseThinking(displayContent);
                            return (
                              <>
                                {thinking && (
                                  <ThinkingBlock text={thinking} isComplete={isComplete} />
                                )}
                                {content && (
                                  <div className="hsk-cb-ai-text">{renderMarkdown(content)}</div>
                                )}
                              </>
                            );
                          })()}

                          {/* Comparison matrix — replaces the markdown table when comparing products */}
                          {isLast && lastIntent === 'compare' && sources.length >= 2 && !replayMessages && (
                            <ComparisonMatrix sources={sources} defaultCurrency={defaultCurrency} />
                          )}

                          {/* Sources carousel — only after latest assistant reply, non-cart, non-compare */}
                          {isLast && sources.length > 0 && lastIntent !== 'compare' && lastAction?.type !== 'request_phone' && lastAction?.type !== 'awaiting_payment' && lastAction?.type !== 'checkout' && !msg.cartSnapshot && (
                            <SourcesCarousel
                              sources={sources}
                              defaultCurrency={defaultCurrency}
                              onSelectSource={handleSourceClick}
                            />
                          )}

                          {/* Cart context card — shown when the message has a cart snapshot */}
                          {msg.cartSnapshot && msg.cartSnapshot.items?.length > 0 && (
                            <CartContextCard
                              cart={msg.cartSnapshot}
                              defaultCurrency={defaultCurrency}
                            />
                          )}

                          {/* Action pills — for cart-mutating responses */}
                          {isLast && msg.cartSnapshot && !loading && (
                            <ActionPills
                              cart={msg.cartSnapshot}
                              actionType={msg.actionType}
                              onSend={handleSend}
                              loading={loading}
                            />
                          )}

                          {/* Smart context pills — for all other intents */}
                          {isLast && !loading && !msg.cartSnapshot && !replayMessages && (
                            <SmartContextPills
                              intent={lastIntent}
                              sources={sources}
                              onSend={handleSend}
                              loading={loading}
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
            {selectedProduct && loading && (() => {
              const { title, image, price } = resolveDisplayFields(selectedProduct.fields || selectedProduct, client?.display);
              return (
                <div
                  className="hsk-cb-selected-product"
                  onClick={() => selectedProduct.url && window.open(selectedProduct.url, '_blank')}
                >
                  {image && (
                    <img className="hsk-cb-selected-img" src={image} alt={title} />
                  )}
                  <div className="hsk-cb-selected-info">
                    <div className="hsk-cb-selected-name">{title}</div>
                    {price && (
                      <div className="hsk-cb-selected-price">
                        {selectedProduct.fields?.currency ?? selectedProduct.currency ?? defaultCurrency} {parseFloat(String(price ?? '').replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Typing dots — shown ONLY while waiting for the server (loading).
                Once the response arrives and token streaming begins (!loading && streaming)
                the text animates in directly with no dots visible. */}
            {loading && !streaming && (
              <div className="hsk-cb-typing-row" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
                  <SparkleIcon />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <style>{`
                    @keyframes hsk-pulse {
                      0%, 100% { opacity: 0.6; }
                      50% { opacity: 1; }
                    }
                  `}</style>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', fontStyle: 'italic', animation: 'hsk-pulse 1.5s infinite ease-in-out' }}>
                    {isProperty ? 'Analyzing listings...' : 'Searching catalog...'}
                  </div>
                  <div className="hsk-cb-typing" style={{ margin: 0, alignSelf: 'flex-start' }}>
                    <div className="hsk-cb-dot" />
                    <div className="hsk-cb-dot" />
                    <div className="hsk-cb-dot" />
                  </div>
                </div>
              </div>
            )}

            {error && <div className="hsk-cb-error">{getFriendlyError(error)}</div>}

            {/* Payment phase UIs */}
            {!replayMessages && paymentPhase === 'prompt_phone' && (() => {
              const isHistoryIntent = lastIntent === 'capture' || lastIntent === 'delete' || lastIntent === 'view_history';
              
              if (isHistoryIntent) {
                return (
                  <div className="hsk-cb-history-prompt">
                    <div className="hsk-cb-history-icon-wrap">
                      <SecureShieldIcon size={24} />
                    </div>
                    <p className="hsk-cb-history-label">Link your phone to save captures</p>
                    <p className="hsk-cb-history-sub">Enter your phone number to access your cross-website history and comparison captures.</p>
                    <input
                      type="tel"
                      className="hsk-cb-phone-input"
                      placeholder="e.g. 0712 345 678"
                      value={phoneInput}
                      onChange={e => setPhoneInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()}
                    />
                    <button className="hsk-cb-history-submit" onClick={handlePhoneSubmit}>
                      Link Account & Continue →
                    </button>
                  </div>
                );
              }

              return (
                <div className="hsk-cb-payment-prompt">
                  <div className="hsk-cb-payment-icon">📱</div>
                  <p className="hsk-cb-payment-label">Enter your M-Pesa number to pay</p>
                  <input
                    type="tel"
                    className="hsk-cb-phone-input"
                    placeholder="e.g. 0712 345 678"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()}
                  />
                  <button className="hsk-cb-pay-submit" onClick={handlePhoneSubmit}>
                    Send STK Push →
                  </button>
                </div>
              );
            })()}

            {!replayMessages && paymentPhase === 'awaiting' && (
              <div className="hsk-cb-payment-prompt hsk-cb-payment-prompt--awaiting">
                <div className="hsk-cb-payment-pulse-ring" />
                <div className="hsk-cb-payment-icon-wrap">
                  <span style={{fontSize: '2rem'}}>📱</span>
                </div>
                <p className="hsk-cb-payment-label" style={{fontWeight: 600}}>Check your phone</p>
                <p className="hsk-cb-payment-sub">An M-Pesa STK push has been sent.<br/>Enter your PIN to complete payment.</p>
                <div className="hsk-cb-payment-dots">
                  <div className="hsk-cb-dot hsk-cb-dot--amber" />
                  <div className="hsk-cb-dot hsk-cb-dot--amber" />
                  <div className="hsk-cb-dot hsk-cb-dot--amber" />
                </div>
              </div>
            )}

            {!replayMessages && paymentPhase === 'done' && (
              <div className="hsk-cb-payment-prompt hsk-cb-payment-prompt--success">
                <div className="hsk-cb-payment-success-ring" />
                <div className="hsk-cb-payment-icon-wrap">
                  <span style={{fontSize: '2.5rem'}}>✅</span>
                </div>
                <p className="hsk-cb-payment-label">Payment complete!</p>
                <p className="hsk-cb-payment-sub">Thank you for your order. A confirmation has been sent.</p>
              </div>
            )}

            {!replayMessages && paymentPhase === 'failed' && (
              <div className="hsk-cb-payment-prompt hsk-cb-payment-prompt--failed">
                <div className="hsk-cb-payment-icon-wrap">
                  <span style={{fontSize: '2.5rem'}}>❌</span>
                </div>
                <p className="hsk-cb-payment-label">Payment failed or timed out</p>
                <p className="hsk-cb-payment-sub">Please check your M-Pesa PIN and try again, or contact support.</p>
                <div className="hsk-cb-payment-actions">
                  <button
                    className="hsk-cb-pay-submit"
                    onClick={() => { setPaymentPhase('prompt_phone'); setMerchantRef(null); }}
                  >
                    Try again
                  </button>
                  <button
                    className="hsk-cb-pay-secondary"
                    onClick={() => { setPaymentPhase('idle'); setMerchantRef(null); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div ref={bottomRef} style={{ height: 1 }} />
          </div>

          {/* Input — disabled in replay mode */}
          {!replayMessages && (
            <div className="hsk-cb-input-wrap">
              <div className="hsk-cb-input-box">
                <textarea
                  ref={textareaRef}
                  className={cn("hsk-cb-textarea", classNames.input)}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder={activePlaceholder}
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
              <div className="hsk-cb-hint">Akropolys AI · searches the whole catalogue in real time</div>
            </div>
          )}

        </div>{/* end .hsk-cb-main */}

      </div>
    </div>
  );
}

// ─── AIChatButton (public export) ─────────────────────────────────────────────

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

  useEffect(() => {
    setMounted(true);

    if (typeof window !== 'undefined' && !(window as any).__akropolys_nav_patched) {
      (window as any).__akropolys_nav_patched = true;
      const originalPush = window.history.pushState;
      const originalReplace = window.history.replaceState;

      window.history.pushState = function(...args) {
        originalPush.apply(this, args);
        window.dispatchEvent(new CustomEvent('akropolys:navigation'));
      };

      window.history.replaceState = function(...args) {
        originalReplace.apply(this, args);
        window.dispatchEvent(new CustomEvent('akropolys:navigation'));
      };
    }

    const handleNavigation = () => {
      setOpen(false);
    };

    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('akropolys:navigation', handleNavigation);

    return () => {
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('akropolys:navigation', handleNavigation);
    };
  }, []);

  const isStringTheme = typeof theme === 'string';
  const hskThemeAttr = isStringTheme ? theme : undefined;

  const customStyles = (!isStringTheme && theme) ? {
    ...(theme?.primaryColor && { '--hsk-primary': theme.primaryColor }),
    ...(theme?.backgroundColor && { '--hsk-bg': theme.backgroundColor }),
    ...(theme?.textColor && { '--hsk-text': theme.textColor }),
    ...(theme?.fontFamily && { '--hsk-font': theme.fontFamily }),
    ...(theme?.borderRadius && { '--hsk-border-radius': theme.borderRadius }),
  } as React.CSSProperties : undefined;

  return (
    <>
      <button
        className={cn("hsk-cb-btn", classNames.button, className)}
        onClick={() => setOpen(true)}
        style={customStyles}
        data-hsk-theme={hskThemeAttr}
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
