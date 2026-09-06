import React from 'react';

export interface InkBloomSkeletonProps {
  lines?: number;
  className?: string;
}

export function InkBloomSkeleton({ lines = 3, className = '' }: InkBloomSkeletonProps) {
  return (
    <div className={`hsk-cb-ink-skeleton ${className}`} aria-hidden="true" role="status">
      <div className="hsk-cb-ink-line hsk-cb-ink-line--title" />
      {lines >= 2 && <div className="hsk-cb-ink-line hsk-cb-ink-line--lead1" />}
      {lines >= 2 && <div className="hsk-cb-ink-line hsk-cb-ink-line--lead2" />}
      {lines >= 3 && <div className="hsk-cb-ink-line hsk-cb-ink-line--ask" />}
    </div>
  );
}
