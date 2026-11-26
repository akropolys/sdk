import React from 'react';
import { cn } from '../../../utils/cn';

// Shown only while this chat is remembered; one tap turns memory off and deletes it.
export function MemoryToggle({ label, onOff, compact = false }: { label: string; onOff: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      className={cn('hsk-cb-sound-pill', 'is-on', compact && 'is-compact')}
      onClick={onOff}
      role="switch"
      aria-checked="true"
      aria-label={label}
      title={label}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    </button>
  );
}
