import React, { useState } from 'react';
import { normalizeEntityImages, type ChatSource } from '@akropolys/sdk';
import { SparkleIcon } from '../icons';
import type { LightboxGalleryData } from './LightboxModal';

export function EntityGallery({
  source,
  onImageClick,
}: {
  source: ChatSource;
  onImageClick?: (url: string, gallery?: LightboxGalleryData) => void;
}) {
  const images = normalizeEntityImages(source.images ?? source.fields?.images, source.image, source.url);
  const [failed, setFailed] = useState(false);
  const cover = source.image || images[0]?.url;

  if (!cover) return <div className="hsk-cb-src-imgwrap-empty"><SparkleIcon /></div>;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onImageClick) return;
    const initialIndex = Math.max(0, images.findIndex(i => i.url === cover));
    if (images.length > 1) {
      onImageClick(cover, {
        images: images.map(img => ({ url: img.url, caption: img.caption, alt: img.alt })),
        index: initialIndex,
        title: source.name,
      });
    } else {
      onImageClick(cover);
    }
  };

  return (
    <button
      type="button"
      className="hsk-cb-src-imgwrap hsk-gallery-cover"
      aria-label={images.length > 1 ? `View ${images.length} images of ${source.name}` : `View image of ${source.name}`}
      onClick={handleClick}
    >
      {failed ? (
        <SparkleIcon />
      ) : (
        <img
          src={cover}
          alt={images.find(i => i.url === cover)?.alt || source.name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      {images.length > 1 && (
        <span className="hsk-gallery-count">
          {Math.max(0, images.findIndex(i => i.url === cover)) + 1} / {images.length}
        </span>
      )}
    </button>
  );
}
