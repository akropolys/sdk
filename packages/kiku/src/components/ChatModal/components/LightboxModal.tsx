import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons';

export interface LightboxImage {
  url: string;
  caption?: string;
  alt?: string;
}

export interface LightboxGalleryData {
  images: LightboxImage[];
  index?: number;
  title?: string;
}

export interface LightboxModalProps {
  src?: string | null;
  images?: LightboxImage[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
}

export function LightboxModal({ src, images, initialIndex = 0, title, onClose }: LightboxModalProps) {
  const list: LightboxImage[] = images && images.length > 0
    ? images
    : (src ? [{ url: src }] : []);

  const [index, setIndex] = useState(initialIndex);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, list.length - 1)));
  }, [initialIndex, list.length]);

  useEffect(() => {
    if (list.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (list.length > 1) {
        if (e.key === 'ArrowLeft') setIndex(i => (i - 1 + list.length) % list.length);
        if (e.key === 'ArrowRight') setIndex(i => (i + 1) % list.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [list.length, onClose]);

  if (list.length === 0) return null;

  const current = list[index] || list[0];
  const step = (dir: number) => setIndex(i => (i + dir + list.length) % list.length);

  return (
    <div className="hsk-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={title || 'Image preview'}>
      <button className="hsk-lightbox-close" onClick={onClose} aria-label="Close image">
        <CloseIcon />
      </button>

      {title && (
        <div className="hsk-lightbox-top" onClick={e => e.stopPropagation()}>
          <span className="hsk-lightbox-title">{title}</span>
        </div>
      )}

      <div
        className="hsk-lightbox-stage"
        onClick={e => e.stopPropagation()}
        onTouchStart={e => { touchX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={e => {
          const end = e.changedTouches[0]?.clientX;
          if (touchX.current !== null && end !== undefined && Math.abs(end - touchX.current) > 40) {
            step(end < touchX.current ? 1 : -1);
          }
          touchX.current = null;
        }}
      >
        {list.length > 1 && (
          <button
            type="button"
            className="hsk-lightbox-nav hsk-lightbox-nav--prev"
            onClick={() => step(-1)}
            aria-label="Previous image"
          >
            <ChevronLeftIcon />
          </button>
        )}

        <div className="hsk-lightbox-content">
          <img
            key={current.url}
            src={current.url}
            alt={current.alt || title || ''}
            className="hsk-lightbox-img"
          />
          {current.caption && (
            <div className="hsk-lightbox-caption">{current.caption}</div>
          )}
        </div>

        {list.length > 1 && (
          <button
            type="button"
            className="hsk-lightbox-nav hsk-lightbox-nav--next"
            onClick={() => step(1)}
            aria-label="Next image"
          >
            <ChevronRightIcon />
          </button>
        )}
      </div>

      {list.length > 1 && (
        <div className="hsk-lightbox-bottom" onClick={e => e.stopPropagation()}>
          <div className="hsk-lightbox-counter">
            {index + 1} / {list.length}
          </div>
        </div>
      )}
    </div>
  );
}
