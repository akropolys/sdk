import React, { useEffect, useRef } from 'react';
import { useT } from '../types';
import { rememberLayoutHintSeen } from '../../../utils/layoutDiscovery';

export function LayoutDiscoveryNote({ onOpenDock }: { onOpenDock: () => void }) {
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = ref.current;
    if (!button) return;
    if (typeof IntersectionObserver === 'undefined') {
      rememberLayoutHintSeen();
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
        rememberLayoutHintSeen();
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(button);
    return () => observer.disconnect();
  }, []);
  return (
    <button ref={ref} type="button" className="hsk-cb-layout-discovery-note" onClick={onOpenDock}>
      <svg viewBox="0 0 44 48" fill="none" aria-hidden="true">
        <path pathLength="1" d="M36 43C14 46 8 27 20 23C32 18 36 31 24 31C11 31 9 15 18 6M10 10L18 5L23 14" />
      </svg>
      <span>{t('layoutFirstReplyNote', { button: 'Wide' })}</span>
    </button>
  );
}
