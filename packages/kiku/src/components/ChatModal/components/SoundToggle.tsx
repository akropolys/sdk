import React, { useState } from 'react';
import { cn } from '../../../utils/cn';
import { chime, chimeState, soundsEnabled, setSoundsEnabled } from '../../../utils/chime';

export function SoundToggle({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const [on, setOn] = useState(() => soundsEnabled());
  const [state, setState] = useState('');

  const toggle = () => {
    const next = !on;
    setSoundsEnabled(next);
    setOn(next);
    // Both directions answer, or the control gives no sign it did anything.
    chime(next ? 'reply' : 'interrupt', true);
    setState(chimeState());
  };

  return (
    <button
      type="button"
      className={cn('hsk-cb-sound-pill', compact && 'is-compact', on && 'is-on', state && state !== 'running' && state !== 'off' && 'is-blocked', className)}
      onClick={toggle}
      role="switch"
      aria-checked={on}
      aria-label={on ? 'Mute notification sounds' : 'Unmute notification sounds'}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {on ? (
          <>
            <path className="hsk-snd-wave" style={{ '--hsk-wave': 0 } as React.CSSProperties} d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path className="hsk-snd-wave" style={{ '--hsk-wave': 1 } as React.CSSProperties} d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        ) : (
          <>
            <line className="hsk-snd-x" x1="16" y1="9" x2="21" y2="15" />
            <line className="hsk-snd-x" x1="21" y1="9" x2="16" y2="15" />
          </>
        )}
      </svg>
      {!compact && <span>{on ? 'Sounds' : 'Muted'}</span>}
    </button>
  );
}
