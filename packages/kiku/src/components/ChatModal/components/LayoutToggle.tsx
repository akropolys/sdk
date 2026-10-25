import React from 'react';

export function LayoutToggle({ wide, onToggle, emphasized = false }: { wide: boolean; onToggle: () => void; emphasized?: boolean }) {
  return <button type="button" className={`hsk-cb-sound-pill hsk-cb-layout-toggle${emphasized ? ' is-discovery' : ''}`} role="switch"
    aria-checked={wide} aria-label="Wide AI responses" onClick={onToggle}>
    <span className="hsk-cb-layout-track" aria-hidden="true"><span className="hsk-cb-layout-thumb">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 4h10M3 8h10M3 12h7" />
      </svg>
    </span></span><span>Wide</span>
  </button>;
}
