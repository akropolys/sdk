import React from 'react';
import { useT } from './types';
import { ChevronLeftIcon, CloseIcon } from './icons';
import { THEMES, type ThemeId } from './themes';
import { KikuAvatar, type KikuState } from '../KikuAvatar';
import { ScoutRail } from '../Scouts';
import { SoundToggle } from './components/SoundToggle';
import { cn } from '../../utils/cn';
import { useIslandMorph } from '../../utils/island';

export interface ChatTopbarProps {
  scoutsAllowed?: boolean;
  title: string;
  logo?: string;
  hasMessages: boolean;
  avatarState?: KikuState;
  unread?: boolean;
  awayFromBottom?: boolean;
  themeMenuOpen?: boolean;
  themeMenuClosing?: boolean;
  onThemeMenuClosed?: () => void;
  isNarrow?: boolean;
  currentTheme?: ThemeId;
  onJumpToLatest?: () => void;
  onReset: () => void;
  onClose: () => void;
  onToggleThemeMenu?: () => void;
  onSelectTheme?: (theme: ThemeId) => void;
  themeAttr?: string;
  onScoutNew?: (avatar: string) => void;
  onScoutAsk?: (scout: any) => void;
}

let droppedIn = false;

const RadarIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"/>
    <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6Z"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

export function ChatTopbar({
  scoutsAllowed,
  title,
  logo,
  hasMessages,
  avatarState = 'idle',
  unread = false,
  awayFromBottom = false,
  themeMenuOpen = false,
  themeMenuClosing = false,
  onThemeMenuClosed,
  isNarrow = false,
  currentTheme = 'dark',
  onJumpToLatest,
  onReset,
  onClose,
  onToggleThemeMenu,
  onSelectTheme,
  themeAttr,
  onScoutNew,
  onScoutAsk,
}: ChatTopbarProps) {
  const tr = useT();
  const barRef = React.useRef<HTMLDivElement>(null);
  const trayRef = React.useRef<HTMLDivElement>(null);
  const shadowRef = React.useRef<HTMLDivElement>(null);
  const nameRef = React.useRef<HTMLElement | null>(null);
  const [dropIn] = React.useState(() => { const first = !droppedIn; droppedIn = true; return first; });
  // The dock's top border runs through the middle of the name pill, like the thinking tab on a reply.
  React.useLayoutEffect(() => {
    const bar = barRef.current, name = nameRef.current, dock = trayRef.current;
    if (!bar || !name || !dock) return;
    // Layout offsets, not the on-screen rect: the pill squashes with every hop, and a mid-hop measure moved the edge.
    const mark = name.offsetParent as HTMLElement | null;
    if (!mark) return;
    const pillMiddle = mark.offsetTop + name.offsetTop + name.offsetHeight / 2;
    bar.style.setProperty('--hsk-tray-top', `${pillMiddle}px`);
    bar.style.setProperty('--hsk-tray-head', `${name.offsetHeight / 2 + 8}px`);
    bar.style.setProperty('--hsk-tray-h', `${dock.offsetHeight}px`);
    bar.style.setProperty('--hsk-tray-w', `${dock.offsetWidth}px`);
  }, [themeMenuOpen, isNarrow]);
  const [trayMotion] = React.useState(() =>
    typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
  // The dock's first mount blocked the page for a visible beat, so it mounts parked once the chat is idle.
  const [trayReady, setTrayReady] = React.useState(false);
  React.useEffect(() => {
    if (!isNarrow || trayReady) return;
    const ric = (window as any).requestIdleCallback;
    const id = ric ? ric(() => setTrayReady(true), { timeout: 1200 }) : setTimeout(() => setTrayReady(true), 600);
    return () => {
      const cic = (window as any).cancelIdleCallback;
      if (ric && cic) cic(id); else clearTimeout(id);
    };
  }, [isNarrow, trayReady]);
  const trayMounted = isNarrow && (themeMenuOpen || trayReady);

  const tray = useIslandMorph({
    target: React.useCallback(() => trayRef.current, []),
    trigger: React.useCallback(() => nameRef.current, []),
    shadow: React.useCallback(() => shadowRef.current, []),
    radius: 18,
    enabled: isNarrow && themeMenuOpen && trayMotion,
    onClosed: () => onThemeMenuClosed?.(),
  });
  React.useEffect(() => {
    if (isNarrow && themeMenuClosing) tray.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMenuClosing, isNarrow]);
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
    <div ref={barRef} className={cn("hsk-cb-topbar", isNarrow && themeMenuOpen && "is-docked")}>
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
        aria-label={awayFromBottom ? tr('jumpToLatest') : `${title} (tap for scouts and themes)`}
      >
        <KikuAvatar
          state={avatarState}
          size={34}
          theme={currentTheme}
          alert={unread}
          onImpact={handleImpact}
          triggerRef={triggerRef}
          dropIn={dropIn}
        />
        {logo ? (
          <img ref={nameRef as React.Ref<HTMLImageElement>} className="hsk-cb-topbar-logo" src={logo} alt={title} />
        ) : (
          <span ref={nameRef as React.Ref<HTMLSpanElement>} className="hsk-cb-topbar-name">{title}</span>
        )}
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
            aria-label="Close Chat"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {isNarrow && themeMenuOpen && (
        <div
          className={cn("hsk-cb-topbar-scrim", themeMenuClosing && "is-closing")}
          onClick={onToggleThemeMenu}
          aria-hidden="true"
        />
      )}

      {/* Mobile Tray: Ooze menu above 2x2 theme grid */}
      {trayMounted && (
        <div className={cn("hsk-cb-tray-shadow", !themeMenuOpen && "is-parked")} aria-hidden="true"><div ref={shadowRef} /></div>
      )}
      {trayMounted && (
        <div
          ref={trayRef}
          className={cn("hsk-cb-topbar-ooze-menu", themeMenuClosing && "is-closing", trayMotion && "is-island", !themeMenuOpen && "is-parked")}
          role="dialog"
          aria-label="Scouts and theme selector"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {scoutsAllowed && <ScoutRail
            className="hsk-cb-scout-tray"
            compact
            paused={!themeMenuOpen}
            themeAttr={themeAttr}
            onNew={onScoutNew}
            onAsk={onScoutAsk}
          />}

          <div className="hsk-cb-theme-block">
            <div className="hsk-cb-tray-aside">
              <SoundToggle compact />
              <span className="hsk-cb-tray-rule" aria-hidden="true" />
              <span className="hsk-cb-theme-vlabel" aria-hidden="true">Themes</span>
            </div>
            <div className="hsk-cb-theme-2x2-grid">
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
        </div>
      )}
    </div>
  );
}
