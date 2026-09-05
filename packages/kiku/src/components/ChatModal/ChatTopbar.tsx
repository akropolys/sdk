import React from 'react';
import { useT } from './types';
import { ChevronLeftIcon, CloseIcon } from './icons';
import { THEMES, type ThemeId } from './themes';
import { KikuAvatar, type KikuState } from '../KikuAvatar';
import { ScoutControlBar } from '../ScoutDock';
import { cn } from '../../utils/cn';

export interface ChatTopbarProps {
  title: string;
  hasMessages: boolean;
  avatarState?: KikuState;
  unread?: boolean;
  awayFromBottom?: boolean;
  themeMenuOpen?: boolean;
  themeMenuClosing?: boolean;
  isNarrow?: boolean;
  currentTheme?: ThemeId;
  activeScoutCount?: number;
  scoutDockOpen?: boolean;
  onToggleScoutDock?: () => void;
  onJumpToLatest?: () => void;
  onReset: () => void;
  onClose: () => void;
  onToggleThemeMenu?: () => void;
  onSelectTheme?: (theme: ThemeId) => void;
}

const RadarIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/>
    <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6Z"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

export function ChatTopbar({
  title,
  hasMessages,
  avatarState = 'idle',
  unread = false,
  awayFromBottom = false,
  themeMenuOpen = false,
  themeMenuClosing = false,
  isNarrow = false,
  currentTheme = 'dark',
  activeScoutCount = 0,
  scoutDockOpen = false,
  onToggleScoutDock,
  onJumpToLatest,
  onReset,
  onClose,
  onToggleThemeMenu,
  onSelectTheme,
}: ChatTopbarProps) {
  const tr = useT();
  const [isImpacting, setIsImpacting] = React.useState(false);
  const [impactColor, setImpactColor] = React.useState<string>('#134e3d');
  const [impactGlow, setImpactGlow] = React.useState<string>('rgba(19, 78, 61, 0.45)');
  const triggerRef = React.useRef<(() => void) | undefined>(undefined);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = React.useRef(false);
  const touchStartTimeRef = React.useRef(0);



  const startPress = React.useCallback(() => {
    isLongPressRef.current = false;
    touchStartTimeRef.current = Date.now();
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(25); } catch {}
      }
      onToggleThemeMenu?.();
    }, 350);
  }, [onToggleThemeMenu]);

  const endPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const cancelPress = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleClick = React.useCallback((e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (awayFromBottom) {
      onJumpToLatest?.();
    } else if (isNarrow) {
      onToggleThemeMenu?.();
    } else {
      triggerRef.current?.();
    }
  }, [awayFromBottom, isNarrow, onJumpToLatest, onToggleThemeMenu]);

  const handleImpact = React.useCallback((splat: number, color: string, glow: string) => {
    if (splat > 0.04) {
      setIsImpacting(true);
      setImpactColor(color);
      setImpactGlow(glow);
    } else {
      setIsImpacting(false);
    }
  }, []);

  return (
    <div className="hsk-cb-topbar">
      {/* Left Column: Back button on mobile, clean spacer on desktop */}
      <div className="hsk-cb-topbar-left" style={{ minWidth: '34px' }}>
        {isNarrow && (
          <button
            type="button"
            className="hsk-cb-back"
            onClick={onClose}
            aria-label={tr('back')}
          >
            <span className="hsk-cb-back-icon"><ChevronLeftIcon /></span>
          </button>
        )}
      </div>

      {/* Center Column: Avatar & Name */}
      <div
        className={cn("hsk-cb-topbar-mark", isNarrow && themeMenuOpen && "is-oozing")}
        data-impacting={isImpacting ? 'true' : 'false'}
        style={{
          '--hsk-contact-color': impactColor,
          '--hsk-contact-glow': impactGlow,
        } as React.CSSProperties}
        data-unread={unread ? 'true' : 'false'}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchMove={cancelPress}
        onTouchCancel={cancelPress}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={awayFromBottom ? tr('jumpToLatest') : 'kiku (tap for scouts and themes)'}
      >
        <KikuAvatar
          state={avatarState}
          size={34}
          theme={currentTheme}
          alert={unread}
          onImpact={handleImpact}
          triggerRef={triggerRef}
        />
        <span className="hsk-cb-topbar-name">{title}</span>
      </div>

      {/* Right Column: Actions (desktop exit button) */}
      <div className="hsk-cb-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {hasMessages && (
          <button className="hsk-cb-topbar-btn" onClick={onReset}>
            {tr('clearChat')}
          </button>
        )}

        {/* Desktop: Exit button */}
        {!isNarrow && (
          <button
            type="button"
            className="hsk-cb-squircle-btn hsk-cb-exit-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close Chat"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Mobile Tray: Ooze menu above 2x2 theme grid */}
      {isNarrow && themeMenuOpen && (
        <div
          className={cn("hsk-cb-topbar-ooze-menu", themeMenuClosing && "is-closing")}
          role="dialog"
          aria-label="Scouts and theme selector"
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ScoutControlBar />
          <div className="hsk-cb-theme-2x2-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {THEMES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={cn("hsk-cb-theme-grid-item", currentTheme === id && "is-active")}
                onClick={(e) => { e.stopPropagation(); onSelectTheme?.(id); }}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
