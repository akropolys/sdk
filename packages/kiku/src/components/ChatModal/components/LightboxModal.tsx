import React from 'react';
import { CloseIcon } from '../icons';

export interface LightboxModalProps {
  src: string | null;
  onClose: () => void;
}

export function LightboxModal({ src, onClose }: LightboxModalProps) {
  if (!src) return null;
  return (
    <div className="hsk-lightbox" onClick={onClose}>
      <button className="hsk-lightbox-close" onClick={onClose} aria-label="Close image">
        <CloseIcon />
      </button>
      <img src={src} alt="" className="hsk-lightbox-img" onClick={e => e.stopPropagation()} />
    </div>
  );
}
