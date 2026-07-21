'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useKiku, ChatMessage, ChatSource } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { renderMarkdown } from '../utils/markdown';
import { AkropolysTheme, ChatAttachment, CaptureTarget } from '@akropolys/sdk';
import { cn } from '../utils/cn';
import { resolveTheme } from '../utils/theme';
import { ComparisonMatrix } from './ComparisonMatrix';
import { MarkupEditor } from './MarkupEditor';
import { ArrowUpIcon } from '../utils/icons';


export interface KikuButtonProps {
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
  /** Enable 🎙️ voice input via browser Web Speech API (free) */
  enableVoice?: boolean;
  /** BCP-47 tag for voice transcription (e.g. 'sw-KE', 'fr-FR'). Defaults to
      the page's <html lang>, then the browser language. */
  voiceLang?: string;
  /** Enable 📷 visual style-match search via Gemini (requires backend GEMINI_API_KEY) */
  enableVision?: boolean;
  /** Optional category hint for visual search (e.g. 'dress', 'curtains') */
  visionCategoryHint?: string;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

// kiku brand mark — glyph extracted from public/brand/akropolys-icon.svg, fill
// only (no background rect) so it drops into the existing colored circles/badges.
const KikuIcon = ({ className, size = 18 }: { className?: string; size?: number }) => (
  <svg
    className={cn("hsk-brand-mark", className)}
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="kiku"
  >
    <g transform="translate(22.7 19) scale(0.62)" fill="currentColor" fillRule="evenodd">
      <path d="M39.4 10.4 Q44 0 48.6 10.4 L86.1 95.8 Q88 100 83.4 100 L4.6 100 Q0 100 1.9 95.8 Z M24 100 L24 65 Q24 60 27.4 56.3 Q44 38 60.6 56.3 Q64 60 64 65 L64 100 Z" />
      <circle cx="55" cy="82" r="3.4" />
    </g>
  </svg>
);

const SparkleIcon = KikuIcon;

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2"/>
  </svg>
);

const ExternalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const ContinueIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
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

const BookmarkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
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

const PaperclipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>
);

const MicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

const MicOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22"/>
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
    <path d="M5 10v2a7 7 0 0 0 12 5"/>
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────

// Blank canvas by default — the empty state is just the logo + a welcome line,
// like other chat assistants. Integrators can still pass their own `chips`.
const DEFAULT_CHIPS: string[] = [];

// Pull a first name out of a first message ("John", "hey, I'm John", "call me
// Jean-Paul"). Returns null when the text reads like a real query instead, so a
// shopper who dives straight into searching is never mistaken for giving a name.
function extractName(raw: string): string | null {
  let s = raw.trim();
  if (!s || s.length > 40 || s.includes('?')) return null;
  s = s.replace(/^(hi|hey|hello|yo)[,!.\s]+/i, '');
  s = s.replace(/^(i['’]?m|im|my name is|call me|it['’]?s|this is|name['’]?s)\s+/i, '');
  s = s.trim().replace(/[.!,]+$/, '');
  const words = s.split(/\s+/);
  if (words.length === 0 || words.length > 3) return null;
  if (!/^[\p{L}][\p{L}\-'’ ]{0,30}$/u.test(s)) return null;
  const q = s.toLowerCase();
  const queryish = ['phone', 'laptop', 'tv', 'cheap', 'best', 'under', 'buy', 'search', 'find', 'show', 'need', 'want', 'price', 'sofa', 'shoe', 'headphone', 'camera', 'gift', 'help'];
  if (queryish.some(w => q.includes(w))) return null;
  const name = words[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── @kiku Mention System ─────────────────────────────────────────────────────

/**
 * Parses the user's input for an @kiku mention prefix.
 * Returns the resolved intent + a cleaned query (product name only, no @kiku prefix)
 * that gets sent as the actual search text. Returns null if not an @kiku command.
 */
function parseAtKiku(raw: string): { intent: string; cleanQuery: string } | null {
  const trimmed = raw.trim();
  if (!/^@kiku\b/i.test(trimmed)) return null;

  const rest = trimmed.slice(5).trim(); // everything after "@kiku"

  if (rest === '' || /^(capture|save)\b/i.test(rest)) {
    return {
      intent: 'capture',
      cleanQuery: rest.replace(/^(capture|save)\s*/i, '').trim() || trimmed,
    };
  }
  if (/^(history|what have you|show my|my items|what did you|saved|captures|recall)\b/i.test(rest)) {
    return { intent: 'view_history', cleanQuery: 'show my saved items' };
  }
  if (/^(delete|forget|remove|unsave)\b/i.test(rest)) {
    return {
      intent: 'delete',
      cleanQuery: rest.replace(/^(delete|forget|remove|unsave)\s*/i, '').trim() || trimmed,
    };
  }
  // Bare "@kiku <text>" defaults to capture
  return { intent: 'capture', cleanQuery: rest || trimmed };
}

// ─── @kiku Picker Menu ────────────────────────────────────────────────────────

interface KikuPickerMenuProps {
  sources: ChatSource[];
  referencedIds: string[];
  defaultCurrency: string;
  onCapture: (product: ChatSource) => void;
  onCaptureAll: (products: ChatSource[]) => void;
  onViewHistory: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

function KikuPickerMenu({
  sources,
  referencedIds,
  defaultCurrency,
  onCapture,
  onCaptureAll,
  onViewHistory,
  onDelete,
  onDismiss,
}: KikuPickerMenuProps) {
  // Show products that were actually referenced in this conversation
  const discussed = sources.filter(s => s.id && referencedIds.includes(s.id));

  return (
    <div
      className="hsk-kiku-picker"
      role="menu"
      aria-label="@kiku commands"
      onMouseDown={e => e.preventDefault()} // keep textarea focused
    >
      {discussed.map((src, i) => (
        <button
          key={src.id ?? i}
          className="hsk-kiku-picker-item"
          role="menuitem"
          onClick={() => { onCapture(src); onDismiss(); }}
        >
          <span className="hsk-kiku-picker-icon">
            {src.image ? <img src={src.image} alt="" /> : <BookmarkIcon />}
          </span>
          <span className="hsk-kiku-picker-item-name">{src.name}</span>
          {src.price && (
            <span className="hsk-kiku-picker-item-price">
              {src.currency ?? defaultCurrency} {parseFloat(String(src.price).replace(/[^0-9.]/g, '') || '0').toLocaleString()}
            </span>
          )}
        </button>
      ))}
      {discussed.length > 1 && (
        <button
          className="hsk-kiku-picker-item"
          role="menuitem"
          onClick={() => { onCaptureAll(discussed); onDismiss(); }}
        >
          <span className="hsk-kiku-picker-icon"><BookmarkIcon /></span>
          <span className="hsk-kiku-picker-item-name">Capture all ({discussed.length})</span>
        </button>
      )}
      {discussed.length === 0 && (
        <button
          className="hsk-kiku-picker-item"
          role="menuitem"
          onClick={() => { onCapture({ name: 'current page', id: undefined }); onDismiss(); }}
        >
          <span className="hsk-kiku-picker-icon"><BookmarkIcon /></span>
          <span className="hsk-kiku-picker-item-name">Capture current page</span>
        </button>
      )}
      <button
        className="hsk-kiku-picker-item"
        role="menuitem"
        onClick={() => { onViewHistory(); onDismiss(); }}
      >
        <span className="hsk-kiku-picker-icon"><HistoryIcon /></span>
        <span className="hsk-kiku-picker-item-name">What have you saved?</span>
      </button>
      <button
        className="hsk-kiku-picker-item"
        role="menuitem"
        onClick={() => { onDelete(); onDismiss(); }}
      >
        <span className="hsk-kiku-picker-icon"><TrashIcon /></span>
        <span className="hsk-kiku-picker-item-name">Delete this</span>
      </button>
    </div>
  );
}

// ─── @ Extension Picker Menu ──────────────────────────────────────────────────

interface AtPickerMenuProps {
  onSelect: (extension: string) => void;
  onDismiss: () => void;
}

function AtPickerMenu({ onSelect, onDismiss }: AtPickerMenuProps) {
  return (
    <div
      className="hsk-kiku-picker"
      role="menu"
      aria-label="Extensions"
      onMouseDown={e => e.preventDefault()} // keep textarea focused
    >
      <button
        className="hsk-kiku-picker-item"
        role="menuitem"
        onClick={() => onSelect('@kiku')}
      >
        <span className="hsk-kiku-picker-icon hsk-kiku-picker-icon--accent"><SparkleIcon /></span>
        <span className="hsk-kiku-picker-item-name">kiku — capture &amp; remember</span>
      </button>
    </div>
  );
}

// ─── Sources Carousel ──────────────────────────────────────────────────────────

interface SourcesCarouselProps {
  sources: ChatSource[];
  defaultCurrency: string;
  onSelectSource?: (src: ChatSource) => void;
  onImageClick?: (src: string) => void;
  referencedIds?: string[];
  compact?: boolean;
}

function SourceImg({ src, alt, onImageClick }: { src: string; alt?: string; onImageClick?: (src: string) => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hsk-chat-source-bg, rgba(0,0,0,.04))', color: 'var(--hsk-chat-muted, #888)' }}>
        <SparkleIcon />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      onError={() => setFailed(true)}
      onClick={onImageClick ? (e) => { e.stopPropagation(); onImageClick(src); } : undefined}
    />
  );
}

function SourcesCarousel({ sources, defaultCurrency, onSelectSource, onImageClick, referencedIds = [], compact = false }: SourcesCarouselProps) {
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

  // Show only the products the answer referenced via <entity_ref>. If it
  // referenced none, show none — never dump raw retrieval candidates, which is
  // what surfaced product cards for questions nobody asked.
  const display = sources.filter(s => s.id && referencedIds.includes(s.id));
  if (display.length === 0) return null;

  return (
    <div className={cn("hsk-cb-sources-wrap", compact && "hsk-cb-sources-wrap--compact")}>
      <div className="hsk-cb-sources" ref={railRef}>
        {display.map((src, si) => {
          const isReferenced = !!(src.id && referencedIds.includes(src.id));
          return (
            <div
              key={src.id ?? si}
              className={cn("hsk-cb-source", isReferenced && "hsk-cb-source--referenced")}
              style={{ animationDelay: `${si * 50}ms` }}
              onClick={() => onSelectSource?.(src)}
            >
              {src.image ? (
                <div className="hsk-cb-src-imgwrap" style={{ position: 'relative' }}>
                  <SourceImg src={src.image} alt={src.name} onImageClick={onImageClick} />
                  {isReferenced && (
                    <div className="hsk-cb-source-ref-badge" title="Featured in response">
                      <SparkleIcon size={10} />
                    </div>
                  )}
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
                <div className="hsk-cb-src-imgwrap-empty" style={{ position: 'relative' }}>
                  <SparkleIcon />
                  {isReferenced && (
                    <div className="hsk-cb-source-ref-badge" title="Featured in response">
                      <SparkleIcon size={10} />
                    </div>
                  )}
                </div>
              )}
              <div className="hsk-cb-src-info">
                <div className="hsk-cb-src-name">{src.name}</div>
                {src.price && (
                  <div className="hsk-cb-src-price">
                    {src.currency ?? defaultCurrency}{' '}
                    {parseFloat(String(src.price).replace(/[^0-9.]/g, '') || '0').toLocaleString()}
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
          const p = parseFloat(String(s.price ?? '').replace(/[^0-9.]/g, ''));
          const m = parseFloat(String(min.price ?? '').replace(/[^0-9.]/g, ''));
          return !isNaN(p) && (isNaN(m) || p < m) ? s : min;
        }, sources[0])
      : null;

  const firstName = sources[0]?.name ?? '';
  const firstTwo = sources.slice(0, 2).map(s => s.name);

  if (intent === 'search' && sources.length > 0) {
    if (firstTwo.length >= 2) {
      pills.push({
        emoji: '⚖️',
        label: 'Compare top 2',
        query: `Compare the ${firstTwo[0]} and ${firstTwo[1]}`,
      });
    }
    if (cheapest && !isProperty && cheapest.name) {
      const short = cheapest.name.split(' ').slice(0, 3).join(' ');
      pills.push({
        emoji: '💡',
        label: `More on ${short}`,
        query: `Tell me more about the ${cheapest.name}`,
      });
    }
    if (isProperty) {
      pills.push({ emoji: '💰', label: 'Under KSh 5M', query: 'Show me options under KSh 5,000,000' });
    } else {
      pills.push({ emoji: '💰', label: 'Under KSh 20K', query: 'Show me options under KSh 20,000' });
    }
  } else if (intent === 'compare' && sources.length > 0) {
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

  // Never let a raw status or network failure reach a shopper.
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('request failed')) {
    return "The assistant couldn't respond just now — please try again in a moment.";
  }

  try {
    const parsed = JSON.parse(str);
    return parsed.error || parsed.message || str;
  } catch {
    return str;
  }
};

// The kiku key is the shopper's portable, anonymous identity (kiku_<hex>) —
// server-minted, shown exactly once. Entering the same key on any site (or
// giving it to an AI agent) opens the same memory. Lost key = lost memory.
const KIKU_KEY_REVEAL_SECONDS = 60;

// ─── ChatModal Props ───────────────────────────────────────────────────────────

interface ChatModalProps extends Pick<KikuButtonProps, 'title' | 'placeholder' | 'backdropColor' | 'backdropBlur' | 'onSelectSource' | 'defaultCurrency' | 'chips' | 'theme' | 'classNames' | 'enableVoice' | 'voiceLang' | 'enableVision' | 'visionCategoryHint'> {
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

function ThinkingBlock({ text, isComplete, seconds: fixedSeconds }: { text: string; isComplete: boolean; seconds?: number }) {
  const startRef = useRef(Date.now());
  const [seconds, setSeconds] = useState<number | null>(() => (isComplete ? null : 0));
  const [isOpen, setIsOpen] = useState(!isComplete);

  // Live-tick while thinking streams; freeze the duration and fold the block
  // away once the answer takes over — the label becomes "Thought for Xs".
  useEffect(() => {
    if (isComplete) {
      if (seconds !== null) {
        setSeconds(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
        setIsOpen(false);
      }
      return;
    }
    setIsOpen(true);
    const t = setInterval(() => {
      setSeconds(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const finalSeconds = fixedSeconds ?? seconds;
  const label = isComplete
    ? (finalSeconds !== null && finalSeconds !== undefined ? `Thought for ${finalSeconds}s` : 'Thought process')
    : `Thinking${seconds ? ` · ${seconds}s` : '…'}`;
  const expandable = !!text;

  return (
    <div className={cn('hsk-cb-think', !isComplete && 'hsk-cb-think--live')}>
      <button
        type="button"
        className={cn('hsk-cb-think-head', !expandable && 'hsk-cb-think-head--static')}
        onClick={expandable ? () => setIsOpen(o => !o) : undefined}
        aria-expanded={expandable ? isOpen : undefined}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={!isComplete ? 'hsk-cb-think-spin' : undefined}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>{label}</span>
        {expandable && <span className={cn('hsk-cb-think-chevron', isOpen && 'hsk-cb-think-chevron--open')}>▶</span>}
      </button>
      {expandable && isOpen && <div className="hsk-cb-think-body">{text}</div>}
    </div>
  );
}

function ChatModal({
  title = 'kiku',
  placeholder = 'Ask me anything…',
  backdropColor,
  backdropBlur,
  onClose,
  onSelectSource,
  defaultCurrency = 'KES',
  chips = DEFAULT_CHIPS,
  theme,
  classNames = {},
  enableVoice = false,
  voiceLang,
  enableVision = false,
  visionCategoryHint,
}: ChatModalProps) {
  const client = useAkropolysContext();
  const { messages, sources, loading, streaming, error, lastAction, lastIntent, send, stop, stopped, interrupted, continueGenerating, reset, referencedIds } = useKiku();
  const [input, setInput] = useState('');
  const [shopperName, setShopperNameState] = useState<string>(() => {
    try { return client.getShopperName?.() ?? ''; } catch { return ''; }
  });
  const [nameSkipped, setNameSkipped] = useState(false);
  // First-run onboarding: greet, pitch, and ask the shopper's name before any chat.
  const awaitingName = messages.length === 0 && !shopperName && !nameSkipped;

  // ── Image attachments ────────────────────────────────────────────────────────
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          setAttachments(prev => [...prev, { type: 'image', data: dataUrl }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Voice mode (Web Speech API) ──────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing'>('idle');
  const recognitionRef = useRef<any>(null);
  const pendingVoiceRef = useRef<string | null>(null); // transcript queued for auto-send
  const hasSpeechAPI = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const startVoice = useCallback(() => {
    if (!hasSpeechAPI || voiceState !== 'idle') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    // Transcribe in the site's language, not a dictated one: developer override
    // → page <html lang> → browser language → English as last resort.
    recognition.lang = voiceLang || document.documentElement.lang || navigator.language || 'en-US';
    // Stream partial results so the user SEES words appear as they speak —
    // without this there's no feedback that anything was captured until the end.
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setVoiceState('listening');
    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const seg = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += seg;
        else interimText += seg;
      }
      // Live feedback: show the (final + in-progress) text in the input box.
      const live = (finalText + ' ' + interimText).trim();
      if (live) setInput(live);
      // Only auto-send once we have a finalized transcript.
      if (finalText.trim()) {
        pendingVoiceRef.current = finalText.trim();
        setVoiceState('processing');
      }
    };
    recognition.onerror = (event: any) => {
      // Surface the cause (most often denied mic permission or no speech) so the
      // user isn't left guessing whether it worked.
      const err = event?.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setInput('Microphone access was blocked — enable it in your browser to use voice.');
      } else if (err === 'no-speech') {
        setInput("Didn't catch that — tap the mic and try again.");
      }
      setVoiceState('idle');
    };
    recognition.onend = () => {
      // Only reset if we didn't already move to processing
      setVoiceState(prev => prev === 'listening' ? 'idle' : prev);
    };
    recognition.start();
  }, [hasSpeechAPI, voiceState, voiceLang]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setVoiceState('idle');
  }, []);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  // No vertical pre-determination: chips and placeholder are whatever the
  // integrator passed (blank by default). One widget can't guess what a given
  // site sells, so it never assumes.
  const activeChips = chips;
  const activeTitle = title;
  const activePlaceholder = awaitingName ? 'Type your name…' : placeholder;


  const [selectedProduct, setSelectedProduct] = useState<ChatSource | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [markupSrc, setMarkupSrc] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyPhase, setKeyPhase] = useState<'idle' | 'prompt_key'>('idle');
  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [mintedPub, setMintedPub] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copyValue = (value: string, which: string) => {
    try { navigator.clipboard?.writeText(value); } catch { /* ignore */ }
    setCopied(which);
    setTimeout(() => setCopied(c => (c === which ? null : c)), 1600);
  };
  const [keyCountdown, setKeyCountdown] = useState(KIKU_KEY_REVEAL_SECONDS);
  const [minting, setMinting] = useState(false);
  const [showKikuPicker, setShowKikuPicker] = useState(false);
  const [showAtPicker, setShowAtPicker] = useState(false);

  // React to lastAction from chat
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.type === 'request_kiku_key') {
      setKeyPhase('prompt_key');
    }
  }, [lastAction]);

  // Show-once countdown: the minted key is visible for a fixed window, then
  // gone for good — it stays active on this device, but is never shown again.
  useEffect(() => {
    if (!mintedKey) return;
    setKeyCountdown(KIKU_KEY_REVEAL_SECONDS);
    const t = setInterval(() => {
      setKeyCountdown(s => {
        if (s <= 1) {
          clearInterval(t);
          setMintedKey(null);
          setMintedPub(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [mintedKey]);

  const { themeAttr: hskThemeAttr, vars: customStyles } = resolveTheme(theme);

  // Retry the interrupted request (e.g. the capture) under the new identity.
  // Goes through handleSend so an "@kiku …" prefix is re-parsed back into a
  // forced intent instead of being sent as literal query text.
  const retryLastMessage = async () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) await handleSend(lastUserMsg.content);
  };

  // Returning shopper: paste an existing public id.
  const handleUseExistingKey = async () => {
    const pub = keyInput.trim();
    if (!pub) return;
    client.setKikuPub(pub);
    setKeyInput('');
    setKeyPhase('idle');
    await retryLastMessage();
  };

  // New shopper: mint server-side. The secret is revealed once; the public id
  // is stored for saving across sites.
  const handleCreateKey = async () => {
    if (minting) return;
    setMinting(true);
    try {
      const { secret, publicId } = await client.mintKikuKey();
      setMintedKey(secret);
      setMintedPub(publicId);
      setKeyPhase('idle');
      await retryLastMessage();
    } catch {
      // mint failed — keep the prompt open so the shopper can try again
    } finally {
      setMinting(false);
    }
  };

  // Auto-scroll. A freshly sent user message is pinned to the top of the
  // view (like Claude) so the question and the start of the answer are both
  // visible without scrolling. While a response streams in, we only follow it
  // to the bottom if the user is already pinned there — this lets them freely
  // scroll up to re-read earlier messages.
  const msgsContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const container = msgsContainerRef.current;
    if (!container) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'user') {
      messageRefs.current[messages.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, selectedProduct]);

  // Lock the host page's own scroll while the panel is open, so only the
  // widget's internal message list scrolls — otherwise both scrollbars show.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightboxSrc) { setLightboxSrc(null); return; }
      onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lightboxSrc, onClose]);

  const handleReset = useCallback(() => {
    reset();
    setKeyPhase('idle');
  }, [reset]);

  const handleSourceClick = (src: ChatSource) => {
    setSelectedProduct(src);
    onSelectSource?.(src);
    // If the assistant just asked a question ("Which sofa would you like…?"),
    // clicking a card answers it with that product instead of pivoting to specs.
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant && lastAssistant.content.trim().endsWith('?')) {
      send(`The ${src.name}`);
      return;
    }
    const q = `Tell me more about the ${src.name}${src.price ? ` (${src.currency ?? defaultCurrency} ${src.price})` : ''} — what are its key specs, who is it best for, and is it worth buying?`;
    send(q);
  };

  const handleSend = async (text?: string, extraAttachments?: ChatAttachment[], forcedIntent?: string, captureTargets?: CaptureTarget[]) => {
    const raw = (text ?? input).trim();
    if (!raw || loading) return;

    // Onboarding: the first thing typed is treated as the shopper's name when it
    // reads like one; we store it and greet them, with no backend call. If it
    // reads like a query, we skip the name step and search normally.
    if (awaitingName) {
      const name = extractName(raw);
      if (name) {
        try { client.setShopperName?.(name); } catch { /* ignore */ }
        setShopperNameState(name);
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        return;
      }
      setNameSkipped(true);
    }

    const kiku = parseAtKiku(raw);
    const q = kiku ? kiku.cleanQuery : raw;
    const resolvedForcedIntent = forcedIntent ?? kiku?.intent;

    setSelectedProduct(null);
    setShowKikuPicker(false);
    setShowAtPicker(false);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    const toSend = extraAttachments ?? attachments;
    setAttachments([]);
    await send(q, raw /* displayQuery */, toSend.length > 0 ? toSend : undefined, resolvedForcedIntent, captureTargets);
  };

  const handleSelectExtension = (ext: string) => {
    setInput(ext + ' ');
    setShowAtPicker(false);
    setShowKikuPicker(true);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Convenience wrappers for @kiku picker actions
  const handleKikuCapture = useCallback((product: ChatSource) => {
    const name = product.name || '';
    const display = `@kiku capture${name ? ' ' + name : ''}`;
    const q = name || 'capture current page';
    setInput('');
    setSelectedProduct(null);
    const toSend = attachments;
    setAttachments([]);
    send(q, display, toSend.length > 0 ? toSend : undefined, 'capture');
  }, [attachments, send]);

  const handleKikuCaptureAll = useCallback((products: ChatSource[]) => {
    const targets: CaptureTarget[] = products
      .filter(p => p.id)
      .map(p => ({
        name: p.name || '',
        url: (p as any).url || '',
        image: p.image || '',
        price: p.price ? String(p.price) : '',
        currency: p.currency || defaultCurrency,
      }));
    const names = products.map(p => p.name).filter(Boolean).join(', ');
    const display = `@kiku capture all (${products.length} items)`;
    setInput('');
    setSelectedProduct(null);
    setAttachments([]);
    send(names || 'capture all', display, undefined, 'capture_all', targets);
  }, [defaultCurrency, send]);

  const handleKikuViewHistory = useCallback(() => {
    const display = '@kiku what have you saved?';
    setInput('');
    setSelectedProduct(null);
    setAttachments([]);
    send('show my saved items', display, undefined, 'view_history');
  }, [send]);

  const handleKikuDelete = useCallback(() => {
    const display = '@kiku delete this';
    setInput('');
    setSelectedProduct(null);
    setAttachments([]);
    send('delete this', display, undefined, 'delete');
  }, [send]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && showKikuPicker) { e.preventDefault(); setShowKikuPicker(false); return; }
    if (e.key === 'Escape' && showAtPicker) { e.preventDefault(); setShowAtPicker(false); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const trimmed = val.trim();
    // Show @ picker when input is exactly '@'
    setShowAtPicker(trimmed === '@');
    // Show the @kiku picker only while the mention is bare — once the shopper
    // types a query past it, they've chosen to write instead of pick, so it hides.
    setShowKikuPicker(/^@kiku\s*$/i.test(trimmed));
    const t = e.target;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  };

  // Auto-send voice transcript once processing state is reached
  useEffect(() => {
    if (voiceState !== 'processing') return;
    const transcript = pendingVoiceRef.current;
    if (!transcript) { setVoiceState('idle'); return; }
    pendingVoiceRef.current = null;
    // Brief delay so user sees the transcript fill in before it fires
    const timer = setTimeout(() => {
      setVoiceState('idle');
      handleSend(transcript);
    }, 400);
    return () => clearTimeout(timer);
  }, [voiceState]);


  const blurVal = typeof backdropBlur === 'number' ? `${backdropBlur}px` : (backdropBlur ?? '20px');

  const displayMessages = messages;

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
      <div
        className={cn("hsk-cb-panel", classNames.panel)}
        onClick={e => {
          e.stopPropagation();
          const target = e.target as HTMLElement;
          if (target.tagName === 'IMG' && (target.classList.contains('hsk-markdown-img') || target.classList.contains('hsk-cb-user-img-thumb'))) {
            const src = (target as HTMLImageElement).src;
            if (src) setLightboxSrc(src);
          }
        }}
      >
        {lightboxSrc && (
          <div className="hsk-lightbox" onClick={() => setLightboxSrc(null)}>
            <button className="hsk-lightbox-close" onClick={() => setLightboxSrc(null)} aria-label="Close image">
              <CloseIcon />
            </button>
            <img src={lightboxSrc} alt="" className="hsk-lightbox-img" onClick={e => e.stopPropagation()} />
          </div>
        )}

        {markupSrc && (
          <div className="hsk-markup-overlay">
            <MarkupEditor
              src={markupSrc}
              onCancel={() => setMarkupSrc(null)}
              onSend={(dataUrl, instruction) => {
                setMarkupSrc(null);
                handleSend(
                  instruction || 'Apply the change indicated by the markings on the image.',
                  [{ type: 'image', data: dataUrl, annotated: true }],
                );
              }}
            />
          </div>
        )}

        {/* ── Main Chat Area ── */}
        <div className="hsk-cb-main">

          {/* Top bar */}
          <div className="hsk-cb-topbar">
            <div className="hsk-cb-topbar-left">
              <span className="hsk-cb-topbar-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <SparkleIcon />
              </span>
              <div>
                <div className="hsk-cb-topbar-title">{activeTitle}</div>
              </div>
            </div>
            <div className="hsk-cb-topbar-actions">
              {messages.length > 0 && (
                <button className="hsk-cb-topbar-btn" onClick={handleReset}>Clear chat</button>
              )}
              <button className="hsk-cb-close" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="hsk-cb-msgs" ref={msgsContainerRef}>
            {displayMessages.length === 0 ? (
              <div className="hsk-cb-empty">
                {awaitingName ? (
                  <>
                    <h2 className="hsk-cb-hello">Hi, I'm <b>kiku</b>.</h2>
                    <p className="hsk-cb-hello-lead">I can search, visualize, or capture anything for you — on this site or any other.</p>
                    <p className="hsk-cb-hello-ask">What should I call you?</p>
                    <button className="hsk-cb-hello-skip" onClick={() => setNameSkipped(true)}>Skip for now</button>
                  </>
                ) : shopperName ? (
                  <>
                    <h2 className="hsk-cb-hello">Hi, {shopperName}.</h2>
                    <p className="hsk-cb-hello-lead">What can I find for you today?</p>
                  </>
                ) : (
                  <>
                    <h2 className="hsk-cb-hello">Hi, I'm <b>kiku</b>.</h2>
                    <p className="hsk-cb-hello-lead">Ask me to search, visualize, or capture anything — I look across the whole site in real time.</p>
                  </>
                )}
                {!awaitingName && activeChips.length > 0 && (
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
                )}
              </div>
            ) : (
              displayMessages.map((msg: ChatMessage, idx: number) => {
                const isLast = idx === displayMessages.length - 1;
                const isLastUser = msg.role === 'user' && !displayMessages.slice(idx + 1).some(m => m.role === 'user');
                const isUser = msg.role === 'user';
                // The matrix can only stand in for the LLM's table when BOTH compared
                // products came from this turn's retrieval; a follow-up compare against
                // an item from memory must keep the markdown table.
                const compareSources = sources.filter(s => s.id && referencedIds.includes(s.id));
                const showMatrix = isLast && lastIntent === 'compare' && compareSources.length >= 2;
                const displayContent =
                  !isUser && showMatrix ? stripMarkdownTables(msg.content) : msg.content;
                return (
                  <div key={idx} className="hsk-cb-msg-group" ref={(el) => { messageRefs.current[idx] = el; }}>
                    {isUser ? (
                      <div className={`hsk-cb-user-msg${isLastUser ? ' hsk-sent' : ''}`}>
                        {/* Image thumbnails in user bubble */}
                        {msg.images && msg.images.length > 0 && (
                          <div className="hsk-cb-user-imgs">
                            {msg.images.map((img, i) => (
                              <img key={i} src={img} alt={`attachment ${i + 1}`} className="hsk-cb-user-img-thumb" />
                            ))}
                          </div>
                        )}
                        {msg.content && (
                          <div className="hsk-cb-user-bubble">
                            {/^@kiku\b/i.test(msg.content) ? (
                              <>
                                <span className="hsk-kiku-badge">@kiku</span>
                                {msg.content.replace(/^@kiku\s*/i, '')}
                              </>
                            ) : msg.content}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="hsk-cb-ai-msg">
                        <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                          <SparkleIcon />
                        </div>
                        <div className="hsk-cb-ai-body">
                          {(() => {
                            // Structured thinking (SSE event) is primary; parseThinking stays as a
                            // net for legacy inline tags in restored histories.
                            const parsed = parseThinking(displayContent);
                            const thinking = msg.thinking || parsed.thinking;
                            const content = parsed.content;
                            const isComplete = msg.thoughtForSeconds != null || content.length > 0 || !(isLast && (streaming || loading));
                            return (
                              <>
                                {(thinking || msg.thoughtForSeconds != null || (isLast && (streaming || loading))) && (
                                  <ThinkingBlock text={thinking} isComplete={isComplete} seconds={msg.thoughtForSeconds} />
                                )}
                                {content && (
                                  <div className="hsk-cb-ai-text">
                                    {renderMarkdown(content, isLast && streaming)}
                                    {isLast && streaming && (
                                      <span style={{ display: 'inline-block', width: '0.5em', height: '1.05em', marginLeft: '2px', verticalAlign: 'text-bottom', background: 'currentColor', opacity: 0.55, borderRadius: '1px' }} />
                                    )}
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          {msg.visualizing && (
                            <div className="hsk-cb-viz hsk-cb-viz--loading">
                              <span className="hsk-cb-viz-spinner" />
                              <span>{msg.visualizingText || 'Visualizing…'}</span>
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
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                )}
                                {isLast && !streaming && (msg.visualizationType !== 'video' && !msg.visualization.includes('/videos/')) && (
                                  <button className="hsk-cb-viz-mark" onClick={() => setMarkupSrc(msg.visualization!)}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                    </svg>
                                    Mark &amp; edit
                                  </button>
                                )}
                              </div>
                              <div className="hsk-cb-viz-disclaimer">
                                {msg.visualizationType === 'video' || msg.visualization.includes('/videos/') ?
                                  "AI-generated video makeover — colors, size and movement may differ from the real product." :
                                  "AI-generated preview — colours, size and placement may differ from the real product."
                                }
                              </div>
                            </div>
                          )}

                          {/* Owner-authored reference images (directed knowledge) — structured, never model-pasted */}
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

                          {/* Comparison matrix — replaces the markdown table when comparing products */}
                          {showMatrix && (
                            <ComparisonMatrix sources={compareSources} defaultCurrency={defaultCurrency} />
                          )}

                          {(() => {
                            const msgReferencedIds = isLast ? referencedIds : (msg.referencedIds ?? []);
                            const msgSources = isLast ? sources : (msg.sources ?? []);
                            // Gate on this message's own intent — the live lastAction hid every earlier carousel.
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

                          {/* Registered action link — the site executes; we just route */}
                          {isLast && !loading && lastAction?.url && (
                            <div className="hsk-action-pills">
                              <a className="hsk-action-pill" href={lastAction.url}>
                                {String(lastAction.type || 'continue').replace(/_/g, ' ')} →
                              </a>
                            </div>
                          )}

                          {/* Smart context pills — built only from products the answer referenced */}
                          {isLast && !loading && (
                            <SmartContextPills
                              intent={lastIntent}
                              sources={sources.filter(s => s.id && referencedIds.includes(s.id))}
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
                      {selectedProduct.currency ?? defaultCurrency} {parseFloat(String(selectedProduct.price ?? '').replace(/[^0-9.]/g, '') || '0').toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Shown only while waiting for the server; stops the moment tokens start streaming in. */}
            {loading && !streaming && (
              <div className="hsk-cb-typing-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="hsk-cb-thinking-icon">
                  <svg className="hsk-brand-mark" viewBox="0 0 100 100" aria-hidden="true">
                    <path d="M39.4 10.4 Q44 0 48.6 10.4 L86.1 95.8 Q88 100 83.4 100 L4.6 100 Q0 100 1.9 95.8 Z M24 100 L24 65 Q24 60 27.4 56.3 Q44 38 60.6 56.3 Q64 60 64 65 L64 100 Z" transform="translate(22.7 19) scale(0.62)" fillRule="evenodd" />
                  </svg>
                  <svg className="hsk-brand-mark hsk-brand-mark--sheen" viewBox="0 0 100 100" aria-hidden="true">
                    <path d="M39.4 10.4 Q44 0 48.6 10.4 L86.1 95.8 Q88 100 83.4 100 L4.6 100 Q0 100 1.9 95.8 Z M24 100 L24 65 Q24 60 27.4 56.3 Q44 38 60.6 56.3 Q64 60 64 65 L64 100 Z" transform="translate(22.7 19) scale(0.62)" fillRule="evenodd" />
                  </svg>
                  <span className="hsk-handle-orbit">
                    <span className="hsk-handle-ring">
                      <span className="hsk-handle-ball" />
                      <span className="hsk-handle-ball" />
                      <span className="hsk-handle-ball" />
                      <span className="hsk-handle-ball" />
                      <span className="hsk-handle-ball" />
                    </span>
                  </span>
                  <span className="hsk-handle-rest" />
                </div>
                <span className="hsk-cb-thinking-text">Thinking…</span>
              </div>
            )}

            {/* Memory lives on mimi (reads need the secret). Surface it as a pill
                so the link can't be lost inside a paragraph. */}
            {lastAction?.type === 'open_memory' && lastAction.url && !loading && !streaming && (
              <a
                className="hsk-cb-memory-pill"
                href={String(lastAction.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open my memory on mimi
                <ExternalIcon />
              </a>
            )}

            {/* Resume affordance after a manual stop or a mid-answer interruption.
                A stop before the first token (last message still the user's) resends
                the question; with a partial answer it resumes into the same bubble. */}
            {(stopped || interrupted) && !loading && !streaming && messages.length > 0 && (
              <div className="hsk-cb-stopped">
                <span className="hsk-cb-stopped-label">
                  {stopped ? 'You stopped this response.' : 'This response was interrupted.'}
                </span>
                <button className="hsk-cb-continue" onClick={continueGenerating}>
                  <ContinueIcon />
                  {messages[messages.length - 1]?.role === 'assistant' ? 'Continue generating' : 'Generate response'}
                </button>
              </div>
            )}

            {error && <div className="hsk-cb-error">{getFriendlyError(error)}</div>}

            {/* Carry-your-items prompt: paste an existing kiku key, or mint a
                new one (shown exactly once). No phone, no account. */}
            {keyPhase === 'prompt_key' && (
              <div className="hsk-cb-ai-msg">
                <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                  <SparkleIcon />
                </div>
                <div className="hsk-cb-ai-body">
                  <div className="hsk-cb-ai-text">
                    <div className="hsk-cb-phone-form">
                      <label className="hsk-cb-phone-label">Paste your public id — or create one</label>
                      <input
                        type="text"
                        className="hsk-cb-phone-input"
                        placeholder="your public id…"
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleUseExistingKey()}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="hsk-cb-phone-submit" onClick={handleUseExistingKey} disabled={!keyInput.trim()}>
                          Use my id
                        </button>
                        <button className="hsk-cb-phone-submit" onClick={handleCreateKey} disabled={minting}>
                          {minting ? 'Creating…' : "I'm new — create one"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {mintedKey && (
              <div className="hsk-cb-ai-msg">
                <div className="hsk-cb-ai-icon" style={{ display: 'flex', alignItems: 'center' }}>
                  <SparkleIcon />
                </div>
                <div className="hsk-cb-ai-body">
                  <div className="hsk-cb-ai-text">
                    <div style={{ padding: '12px 14px', border: '1px solid var(--hsk-border, #e5e5e5)', borderRadius: 'var(--hsk-border-radius, 0px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Your secret — shown only once</div>
                        <code style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 6, wordBreak: 'break-all' }}>{mintedKey}</code>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button className="hsk-cb-phone-submit" style={{ padding: '4px 10px' }} onClick={() => copyValue(mintedKey, 'secret')}>
                            {copied === 'secret' ? 'Copied' : 'Copy secret'}
                          </button>
                          <span style={{ fontSize: 11, opacity: 0.7 }}>
                            Keep it private — use it to unlock your memory at mimi.akropolys.cloud. If lost, the memory is lost with it.
                          </span>
                        </div>
                      </div>
                      {mintedPub && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Your public id</div>
                          <code style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, wordBreak: 'break-all', opacity: 0.85 }}>{mintedPub}</code>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button className="hsk-cb-phone-submit" style={{ padding: '4px 10px' }} onClick={() => copyValue(mintedPub, 'pub')}>
                              {copied === 'pub' ? 'Copied' : 'Copy id'}
                            </button>
                            <span style={{ fontSize: 11, opacity: 0.7 }}>
                              Paste this on any site to keep saving to the same memory.
                            </span>
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 11, opacity: 0.6 }}>Hidden in {keyCountdown}s.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} style={{ height: 1 }} />
          </div>

          <div className="hsk-cb-input-wrap">
              {/* @ extension picker — floats above the input area */}
              {showAtPicker && (
                <AtPickerMenu
                  onSelect={handleSelectExtension}
                  onDismiss={() => setShowAtPicker(false)}
                />
              )}
              {/* @kiku command picker — floats above the input area */}
              {showKikuPicker && (
                <KikuPickerMenu
                  sources={sources}
                  referencedIds={referencedIds}
                  defaultCurrency={defaultCurrency}
                  onCapture={handleKikuCapture}
                  onCaptureAll={handleKikuCaptureAll}
                  onViewHistory={handleKikuViewHistory}
                  onDelete={handleKikuDelete}
                  onDismiss={() => setShowKikuPicker(false)}
                />
              )}
              {/* Image attachment strip */}
              {attachments.length > 0 && (
                <div className="hsk-cb-img-strip">
                  {attachments.map((att, i) => (
                    <div key={i} className="hsk-cb-img-thumb-wrap">
                      <img src={att.data} alt={`attachment ${i + 1}`} className="hsk-cb-img-thumb" />
                      <button
                        className="hsk-cb-img-thumb-remove"
                        onClick={() => removeAttachment(i)}
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="hsk-cb-input-box">
                {/* Hidden file input */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => handleImageFiles(e.target.files)}
                />
                {/* Attach button — only shown if vision is enabled */}
                {enableVision && (
                  <button
                    className="hsk-cb-attach-btn"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={loading}
                    aria-label="Attach image"
                    title="Attach image"
                  >
                    <PaperclipIcon />
                  </button>
                )}
                <textarea
                  ref={textareaRef}
                  className={cn("hsk-cb-textarea", classNames.input)}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    voiceState === 'listening' ? '🎙️ Listening… tap the mic to stop'
                    : voiceState === 'processing' ? 'Got it — sending…'
                    : activePlaceholder
                  }
                  rows={1}
                  disabled={loading}
                  autoFocus
                />
                {/* Voice button — only shown if SpeechRecognition is supported and enabled */}
                {hasSpeechAPI && enableVoice && (
                  <button
                    className={cn(
                      "hsk-cb-mic-btn",
                      voiceState === 'listening' && "hsk-cb-mic-btn--listening",
                      voiceState === 'processing' && "hsk-cb-mic-btn--processing"
                    )}
                    onClick={voiceState === 'idle' ? startVoice : stopVoice}
                    disabled={loading}
                    aria-label={voiceState === 'idle' ? 'Start voice input' : 'Stop recording'}
                    title={voiceState === 'idle' ? 'Voice input' : 'Stop'}
                  >
                    {voiceState === 'listening' ? <MicOffIcon /> : <MicIcon />}
                    {voiceState === 'listening' && <span className="hsk-cb-mic-pulse" />}
                  </button>
                )}
                {(loading || streaming) ? (
                  <button
                    className={cn("hsk-cb-send", "hsk-cb-send--stop", classNames.sendButton)}
                    onClick={stop}
                    aria-label="Stop generating"
                    title="Stop generating"
                  >
                    <StopIcon />
                  </button>
                ) : (
                  <button
                    className={cn("hsk-cb-send", classNames.sendButton)}
                    onClick={() => handleSend()}
                    disabled={!input.trim() && attachments.length === 0}
                    aria-label="Send message"
                  >
                    <ArrowUpIcon />
                  </button>
                )}
              </div>
              <div className="hsk-cb-hint">kiku · searches the whole catalogue in real time</div>
            </div>

        </div>{/* end .hsk-cb-main */}

      </div>
    </div>
  );
}

// ─── KikuButton (public export) ─────────────────────────────────────────────

export function KikuButton({
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
  enableVoice = false,
  voiceLang,
  enableVision = false,
  visionCategoryHint,
}: KikuButtonProps) {
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

  const { themeAttr: hskThemeAttr, vars: customStyles } = resolveTheme(theme);

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
          enableVoice={enableVoice}
          voiceLang={voiceLang}
          enableVision={enableVision}
          visionCategoryHint={visionCategoryHint}
        />,
        document.body
      )}
    </>
  );
}
