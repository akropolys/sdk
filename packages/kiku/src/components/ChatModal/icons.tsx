import React from 'react';
import { cn } from '../../utils/cn';

export const KikuIcon = ({ className, size = 18, tight = false }: { className?: string; size?: number; tight?: boolean }) => (
  <svg
    className={cn("hsk-brand-mark", className)}
    width={size}
    height={size}
    viewBox={tight ? "10.2 17.4 79.5 79.5" : "0 0 100 100"}
    xmlns="http://www.w3.org/2000/svg"
    aria-label="kiku"
  >
    <g transform="translate(22.7 19) scale(0.62)" fill="currentColor" fillRule="evenodd">
      <path d="M39.4 10.4 Q44 0 48.6 10.4 L86.1 95.8 Q88 100 83.4 100 L4.6 100 Q0 100 1.9 95.8 Z M24 100 L24 65 Q24 60 27.4 56.3 Q44 38 60.6 56.3 Q64 60 64 65 L64 100 Z" />
      <circle cx="55" cy="82" r="3.4" />
    </g>
  </svg>
);

export const SparkleIcon = KikuIcon;

export const StopIcon = () => (
  <svg className="hsk-stop-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle
      className="hsk-stop-ring"
      cx="12" cy="12" r="9.5"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    />
    <rect className="hsk-stop-core" x="8.5" y="8.5" width="7" height="7" rx="1.8" fill="currentColor" />
  </svg>
);

export const SpeakerIcon = ({ active }: { active?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={active ? 'currentColor' : 'none'} />
    {active ? (
      <>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </>
    ) : (
      <line x1="23" y1="9" x2="17" y2="15" />
    )}
  </svg>
);

export const ExternalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export const ContinueIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

export const ChevronLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);

export const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

export const HistoryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M12 7v5l4 2"/>
  </svg>
);

export const BookmarkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
);

export const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

export const SecureShieldIcon = ({ className, size = 18 }: { className?: string; size?: number }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    <path d="M12 11v4" />
  </svg>
);

export const PlusIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);

export const PaperclipIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>
);

export const CopyIcon = ({ size = 13 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect className="hsk-copy-sheet" x="9" y="9" width="13" height="13" rx="2"/>
    <path className="hsk-copy-back" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

export const CheckIcon = ({ size = 13 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline className="hsk-check-mark" points="20 6 9 17 4 12"/>
  </svg>
);

export const MicIcon = ({ className, size = 18 }: { className?: string; size?: number } = {}) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path className="hsk-mic-cap" d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

export const MicOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22"/>
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
    <path d="M5 10v2a7 7 0 0 0 12 5"/>
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>
);

export const WaveformIcon = ({ active }: { active?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path className="hsk-wave-bar hsk-wave-bar--tip" style={{ '--hsk-bar': 0, '--hsk-amp': 1.9, '--hsk-period': '1.24s' } as React.CSSProperties} d="M2 12h2" />
    <path className="hsk-wave-bar" style={{ '--hsk-bar': 1, '--hsk-amp': 1.78, '--hsk-period': '0.94s' } as React.CSSProperties} d="M6 8v8" />
    <path className="hsk-wave-bar" style={{ '--hsk-bar': 2, '--hsk-amp': 1.26, '--hsk-period': '1.42s' } as React.CSSProperties} d="M10 4v16" />
    <path className="hsk-wave-bar" style={{ '--hsk-bar': 3, '--hsk-amp': 1.62, '--hsk-period': '1.08s' } as React.CSSProperties} d="M14 7v10" />
    <path className="hsk-wave-bar" style={{ '--hsk-bar': 4, '--hsk-amp': 2.05, '--hsk-period': '0.86s' } as React.CSSProperties} d="M18 9v6" />
    <path className="hsk-wave-bar hsk-wave-bar--tip" style={{ '--hsk-bar': 5, '--hsk-amp': 1.9, '--hsk-period': '1.32s' } as React.CSSProperties} d="M22 12h-2" />
  </svg>
);

export const ArrowUpIcon = () => (
  <svg
    className="hsk-telegram-icon"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* the silhouette is unchanged at rest; splitting it at the fold gives two
        wings that can beat independently */}
    <polygon className="hsk-kite-wing hsk-kite-wing--far" points="22 2 11 13 2 9" />
    <polygon className="hsk-kite-wing hsk-kite-wing--near" points="22 2 15 22 11 13" />
    <line className="hsk-kite-spine" x1="22" y1="2" x2="11" y2="13" />
  </svg>
);

export const SunIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle className="hsk-sun-core" cx="12" cy="12" r="5"/>
    <g className="hsk-sun-rays">
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </g>
  </svg>
);

export const MoonIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path className="hsk-moon-body" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

export const WoodIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path className="hsk-wood-layer" style={{ '--hsk-layer': 0 } as React.CSSProperties} d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path className="hsk-wood-layer" style={{ '--hsk-layer': 2 } as React.CSSProperties} d="M2 17l10 5 10-5"/>
    <path className="hsk-wood-layer" style={{ '--hsk-layer': 1 } as React.CSSProperties} d="M2 12l10 5 10-5"/>
  </svg>
);

export const HeartIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path className="hsk-heart-body" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);

export const CoffeeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 8h1a4 4 0 1 1 0 8h-1"/>
    <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/>
    <line className="hsk-steam" style={{ '--hsk-steam': 0 } as React.CSSProperties} x1="6" y1="1" x2="6" y2="4"/>
    <line className="hsk-steam" style={{ '--hsk-steam': 1 } as React.CSSProperties} x1="10" y1="1" x2="10" y2="4"/>
    <line className="hsk-steam" style={{ '--hsk-steam': 2 } as React.CSSProperties} x1="14" y1="1" x2="14" y2="4"/>
  </svg>
);

export const StarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6.5 6.5 0 0 0 9 9 9 9 0 1 1-9-9z"/>
    <path className="hsk-star-spark" d="M18.5 2.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>
  </svg>
);

export const ShieldIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
);

export const KeyOutlineIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21 2-2 2m-1.5 1.5L14 9a5.5 5.5 0 1 0 2 2l3.5-3.5"/>
    <circle cx="7.5" cy="15.5" r="2.5"/>
  </svg>
);

export const VaultIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="3"/>
    <circle cx="12" cy="12" r="3"/>
    <path d="m14.5 9.5-5 5"/>
  </svg>
);

export const GlobeIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" x2="22" y1="12" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

export const XIcon = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);


