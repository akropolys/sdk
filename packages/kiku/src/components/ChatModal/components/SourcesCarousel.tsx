import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatSource } from '@akropolys/sdk';
import { useAkropolysContext } from '@akropolys/sdk';
import { cn } from '../../../utils/cn';
import { SparkleIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons';

export interface SourcesCarouselProps {
  sources: ChatSource[];
  defaultCurrency: string;
  onSelectSource?: (src: ChatSource) => void;
  onImageClick?: (src: string) => void;
  referencedIds?: string[];
  compact?: boolean;
}

export function SourceImg({ src, alt, onImageClick }: { src: string; alt?: string; onImageClick?: (src: string) => void }) {
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

export function SourcesCarousel({ sources, defaultCurrency, onSelectSource, onImageClick, referencedIds = [], compact = false }: SourcesCarouselProps) {
  const client = useAkropolysContext();
  const isProperty = client?.vertical === 'property';
  const railRef = useRef<HTMLDivElement>(null);
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const display = sources.filter(s => s.id && referencedIds.includes(s.id));

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el || display.length === 0) return;
    const travelled = Math.abs(el.scrollLeft);
    const maxScroll = el.scrollWidth - el.clientWidth;
    setShowPrev(travelled > 10);
    setShowNext(maxScroll > 4 && travelled < maxScroll - 12);

    const cardWidth = 190;
    const idx = Math.round(travelled / cardWidth);
    setActiveIndex(Math.min(Math.max(0, idx), display.length - 1));
  }, [display.length]);

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure); };
  }, [measure, sources]);

  const railStep = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: 190 * dir * (rtl ? -1 : 1), behavior: 'smooth' });
  };

  const scrollNext = () => railStep(1);
  const scrollPrev = () => railStep(-1);

  if (display.length === 0) return null;

  return (
    <div className={cn("hsk-cb-sources-wrap", compact && "hsk-cb-sources-wrap--compact")}>
      {showPrev && (
        <>
          <div className="hsk-cb-sources-fade-left" />
          <button className="hsk-cb-sources-prev" onClick={scrollPrev} aria-label="Previous">
            <ChevronLeftIcon />
          </button>
        </>
      )}

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
                      color: '#fbbf24',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      <SparkleIcon size={12} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="hsk-cb-src-imgwrap-empty" style={{ position: 'relative' }}>
                  <SparkleIcon />
                </div>
              )}
              <div className="hsk-cb-src-info">
                <div className="hsk-cb-src-name">{src.name}</div>
                {src.price && (
                  <div className="hsk-cb-src-price">
                    {(src.currency || defaultCurrency) ? `${src.currency || defaultCurrency} ` : '$'}
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
          <div className="hsk-cb-sources-fade-right" />
          <button className="hsk-cb-sources-next" onClick={scrollNext} aria-label="See more">
            <ChevronRightIcon />
          </button>
        </>
      )}

      {display.length > 1 && (
        <div className="hsk-cb-carousel-dots">
          {display.map((_, i) => (
            <div
              key={i}
              className={cn("hsk-cb-dot-item", i === activeIndex && "hsk-cb-dot-item--active")}
              onClick={() => {
                const el = railRef.current;
                if (el) {
                  const rtl = getComputedStyle(el).direction === 'rtl';
                  el.scrollTo({ left: i * 190 * (rtl ? -1 : 1), behavior: 'smooth' });
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
