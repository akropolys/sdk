import { EntityGallery } from './EntityGallery';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatSource, EntityImage } from '@akropolys/sdk';
import { normalizeEntityImages, useCardFields } from '@akropolys/sdk';
import { detailsOf } from '../../../utils/cardDetails';
import { cn } from '../../../utils/cn';
import { SparkleIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons';

export interface SourcesCarouselProps {
  sources: ChatSource[];
  onSelectSource?: (src: ChatSource) => void;
  onImageClick?: (src: string, gallery?: import('./LightboxModal').LightboxGalleryData) => void;
  referencedIds?: string[];
  compact?: boolean;
  targetLabel?: string;
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

export function SourcesCarousel({ sources, onSelectSource, onImageClick, referencedIds = [], compact = false, targetLabel = 'Your colour' }: SourcesCarouselProps) {
  const cardFields = useCardFields();
  const railRef = useRef<HTMLDivElement>(null);
  const [showPrev, setShowPrev] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const referenced = sources.filter(s => s.id && referencedIds.includes(s.id));
  const swatches = referenced.filter(s => s.swatch);
  const entities = referenced.filter(s => !s.swatch);

  const isSingleEntity = entities.length === 1;

  const display = isSingleEntity
    ? entities.flatMap<{ source: ChatSource; image: EntityImage | undefined; photoIndex: number; totalPhotos: number }>(source => {
        const images = normalizeEntityImages(source.images ?? source.fields?.images, source.image, source.url);
        return images.length
          ? images.map((image, idx) => ({
              source,
              image,
              photoIndex: idx,
              totalPhotos: images.length,
            }))
          : [{ source, image: undefined, photoIndex: 0, totalPhotos: 0 }];
      })
    : entities.map(source => {
        const images = normalizeEntityImages(source.images ?? source.fields?.images, source.image, source.url);
        return {
          source,
          image: images[0],
          photoIndex: 0,
          totalPhotos: images.length,
        };
      });

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

  if (display.length === 0 && swatches.length === 0) return null;

  const swatchGrid = swatches.length > 0 && (
    <div className="hsk-cb-swatch-grid">
      {swatches.map((src, si) => (
        <button
          key={src.id ?? src.url ?? si}
          type="button"
          className={cn("hsk-cb-swatch", src.target && "hsk-cb-swatch--target")}
          style={{ animationDelay: `${si * 40}ms` }}
          onClick={src.target ? undefined : () => onSelectSource?.(src)}
        >
          <span className="hsk-cb-swatch-chip" style={{ background: src.swatch }} />
          <span className="hsk-cb-swatch-name">{src.target ? targetLabel : src.name}</span>
          <span className="hsk-cb-swatch-code">{src.swatch}</span>
        </button>
      ))}
    </div>
  );
  if (display.length === 0) return swatchGrid || null;

  return (
    <>
    {swatchGrid}
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
        {display.map(({ source: src, image, photoIndex, totalPhotos }, si) => {
          const isReferenced = !!(src.id && referencedIds.includes(src.id));
          return (
            <div
              key={`${src.id ?? src.url ?? si}:${image?.url ?? photoIndex}`}
              className={cn("hsk-cb-source", isReferenced && "hsk-cb-source--referenced")}
              style={{ animationDelay: `${si * 50}ms` }}
              onClick={() => onSelectSource?.(src)}
            >
              <EntityGallery
                source={
                  isSingleEntity
                    ? (image ? { ...src, image: image.url, images: [image] } : src)
                    : src
                }
                onImageClick={onImageClick}
              />
              <div className="hsk-cb-src-info">
                <div className="hsk-cb-src-name">{src.name}</div>
                {isSingleEntity && image?.caption ? (
                  <div className="hsk-cb-src-detail">{image.caption}</div>
                ) : isSingleEntity && totalPhotos > 1 ? (
                  <div className="hsk-cb-src-detail">{`Photo ${photoIndex + 1} of ${totalPhotos}`}</div>
                ) : null}
                {detailsOf(src, cardFields).slice(0, 2).map(d => (
                  <div key={d.label} className="hsk-cb-src-detail">{d.value}</div>
                ))}
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
    </>
  );
}
