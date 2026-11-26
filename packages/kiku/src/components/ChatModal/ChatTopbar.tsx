import React from 'react';
import { useT } from './types';
import { ChevronLeftIcon, CloseIcon, TrashIcon } from './icons';
import { THEMES, type ThemeId } from './themes';
import { KikuAvatar, type KikuState, type KikuCue } from '../KikuAvatar';
import { SoundToggle } from './components/SoundToggle';
import { cn } from '../../utils/cn';
import { useIslandMorph } from '../../utils/island';
import { ThemeDiscoveryHint } from './components/ThemeDiscoveryHint';

export interface ChatTopbarProps {
  title: string;
  logo?: string;
  brandIcon?: string; // shown before the title in the name pill; ignored when logo is set
  hasMessages: boolean;
  avatarState?: KikuState;
  // The message box, so kiku can watch the caret while the visitor types.
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  // Rises when a message's first words land; kiku swells.
  newMessages?: number;
  // A moment for kiku to react to: a success, the visitor's thanks, a stop.
  avatarCue?: { kind: KikuCue; n: number };
  unread?: boolean;
  awayFromBottom?: boolean;
  themeMenuOpen?: boolean;
  themeMenuClosing?: boolean;
  themeDiscovery?: boolean;
  onThemeMenuReady?: () => void;
  onThemeMenuClosed?: () => void;
  isNarrow?: boolean;
  currentTheme?: ThemeId;
  onJumpToLatest?: () => void;
  onReset: () => void;
  onClose: () => void;
  onToggleThemeMenu?: () => void;
  onSelectTheme?: (theme: ThemeId) => void;
  themeAttr?: string;
  layoutControl?: React.ReactNode;
  below?: React.ReactNode; // shown under the open phone dock
  // A stray click outside the chat: each bump redraws the close X once, and
  // exitHint is the one-time note under it ("Close with ✕ or Esc").
  exitAck?: number;
  exitHint?: string | null;
}

let droppedIn = false;

const SIDE_MIN = 34;
const COMPACT_CLEAR = 34;
const LOGO_H = 16;

function NamePill({ title, brandIcon, pillRef }: { title: string; brandIcon?: string; pillRef: React.MutableRefObject<HTMLElement | null> }) {
  return (
    <span ref={pillRef as React.Ref<HTMLSpanElement>} className={cn('hsk-cb-topbar-name', brandIcon && 'has-brand')} title={title}>
      {brandIcon && <img className="hsk-cb-topbar-brand" src={brandIcon} alt="" width={14} height={14} draggable={false} onContextMenu={e => e.preventDefault()} />}
      <span className="hsk-cb-topbar-title">{title}</span>
    </span>
  );
}

function ratioKey(src: string): string {
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return `kiku-logo-ratio:${(h >>> 0).toString(36)}`;
}

function readRatio(src: string): number | null {
  try {
    const r = Number(localStorage.getItem(ratioKey(src)));
    return r > 0 && Number.isFinite(r) ? r : null;
  } catch {
    return null;
  }
}

function LogoPill({ src, title, pillRef }: { src: string; title: string; pillRef: React.MutableRefObject<HTMLElement | null> }) {
  const [ratio, setRatio] = React.useState<number | null>(() => readRatio(src));
  const [failed, setFailed] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const measure = React.useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.complete || !img.parentElement) return;
    const probe = img.cloneNode() as HTMLImageElement;
    probe.removeAttribute('style');
    probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${LOGO_H}px;width:auto;max-width:none`;
    img.parentElement.appendChild(probe);
    const w = probe.offsetWidth, h = probe.offsetHeight;
    probe.remove();
    const r = w > 0 && h > 0 ? w / h : img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0;
    if (!(r > 0) || !Number.isFinite(r)) return;
    const rounded = Math.round(r * 1000) / 1000;
    setRatio(prev => (prev !== null && Math.abs(prev - rounded) < 0.01 ? prev : rounded));
    try { localStorage.setItem(ratioKey(src), String(rounded)); } catch {}
  }, [src]);
  React.useLayoutEffect(() => { measure(); }, [measure]);
  if (failed) return <NamePill title={title} pillRef={pillRef} />;
  return (
    <span
      ref={pillRef as React.Ref<HTMLSpanElement>}
      className={cn('hsk-cb-topbar-logo', ratio === null && 'is-loading')}
      title={title}
    >
      <img
        ref={imgRef}
        src={src}
        alt={title}
        draggable={false}
        onContextMenu={e => e.preventDefault()}
        style={ratio === null ? undefined : { width: `${Math.round(LOGO_H * ratio * 100) / 100}px`, aspectRatio: String(ratio) }}
        onLoad={measure}
        onError={() => setFailed(true)}
      />
    </span>
  );
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
  logo,
  brandIcon,
  hasMessages,
  avatarState = 'idle',
  inputRef,
  newMessages,
  avatarCue,
  unread = false,
  awayFromBottom = false,
  themeMenuOpen = false,
  themeMenuClosing = false,
  themeDiscovery = false,
  onThemeMenuReady,
  onThemeMenuClosed,
  isNarrow = false,
  currentTheme = 'dark',
  onJumpToLatest,
  onReset,
  onClose,
  onToggleThemeMenu,
  onSelectTheme,
  themeAttr,
  below,
  layoutControl,
  exitAck = 0,
  exitHint = null,
}: ChatTopbarProps) {
  const tr = useT();
  const hasLayoutControl = Boolean(layoutControl);
  const barRef = React.useRef<HTMLDivElement>(null);
  const trayRef = React.useRef<HTMLDivElement>(null);
  const nameRef = React.useRef<HTMLElement | null>(null);
  const [dropIn] = React.useState(() => { const first = !droppedIn; droppedIn = true; return first; });
  const clearRef = React.useRef<HTMLButtonElement>(null);
  const clearMeasureRef = React.useRef<HTMLSpanElement>(null);
  const clearLabel = tr('clearChat');
  const [clearFit, setClearFit] = React.useState({ size: 12, compact: false });
  React.useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let active = true;
    const fit = () => {
      if (!active) return;
      const button = clearRef.current, measure = clearMeasureRef.current;
      const actions = bar.querySelector<HTMLElement>('.hsk-cb-topbar-actions');
      const close = actions?.querySelector<HTMLElement>('.hsk-cb-exit-btn') ?? null;
      const gap = actions ? parseFloat(getComputedStyle(actions).gap) || 0 : 0;
      const barStyle = getComputedStyle(bar);
      const inner = bar.clientWidth - parseFloat(barStyle.paddingLeft) - parseFloat(barStyle.paddingRight);
      const side = Math.max(SIDE_MIN, COMPACT_CLEAR + (close ? close.offsetWidth + gap : 0));
      bar.style.setProperty('--hsk-name-room', `${Math.max(0, Math.floor(inner - 2 * side - 2 * (parseFloat(barStyle.columnGap) || 0)))}px`);
      if (!button || !measure || !actions) return;
      const columns = barStyle.gridTemplateColumns.split(' ');
      const slot = parseFloat(columns[2]) || actions.clientWidth;
      const available = Math.max(0, slot - (close ? close.offsetWidth + gap : 0) - 30);
      const size = Math.min(12, Math.floor(1200 * available / Math.max(1, measure.scrollWidth)) / 100);
      const compact = size < 10;
      setClearFit(previous => previous.size === size && previous.compact === compact ? previous : { size, compact });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(bar);
    if (nameRef.current) observer.observe(nameRef.current);
    document.fonts?.ready.then(fit).catch(() => {});
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
    };
  }, [clearLabel, hasMessages, isNarrow, title, logo]);
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
  }, [themeMenuOpen, isNarrow, hasLayoutControl]);
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
  React.useEffect(() => {
    if (isNarrow && !trayReady) return;
    const frame = requestAnimationFrame(() => onThemeMenuReady?.());
    return () => cancelAnimationFrame(frame);
  }, [isNarrow, trayReady, onThemeMenuReady]);

  const tray = useIslandMorph({
    target: React.useCallback(() => trayRef.current, []),
    trigger: React.useCallback(() => nameRef.current, []),
    enabled: isNarrow && themeMenuOpen && trayMotion,
    onClosed: () => onThemeMenuClosed?.(),
  });
  React.useEffect(() => {
    if (isNarrow && themeMenuClosing) tray.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMenuClosing, isNarrow]);
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


  return (
    <div ref={barRef} className={cn("hsk-cb-topbar", isNarrow && themeMenuOpen && "is-docked")}>
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

      <div
        className={cn("hsk-cb-topbar-mark", isNarrow && themeMenuOpen && "is-oozing", themeDiscovery && themeMenuOpen && !themeMenuClosing && 'is-discovering')}
        data-unread={unread ? 'true' : 'false'}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchMove={cancelPress}
        onTouchCancel={cancelPress}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={awayFromBottom ? tr('jumpToLatest') : `${title} (tap for themes)`}
      >
        <KikuAvatar
          state={avatarState}
          size={34}
          theme={currentTheme}
          alert={unread}
          triggerRef={triggerRef}
          dropIn={dropIn}
          inputRef={inputRef}
          notice={newMessages}
          cue={avatarCue}
        />
        <div className="hsk-cb-topbar-identity">
          {logo ? (
            <LogoPill key={logo} src={logo} title={title} pillRef={nameRef} />
          ) : (
            <NamePill title={title} brandIcon={brandIcon} pillRef={nameRef} />
          )}
        </div>
      </div>

      <div className="hsk-cb-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {hasMessages && (
          <button ref={clearRef} type="button" className={cn("hsk-cb-topbar-btn", clearFit.compact && "is-compact")} onClick={onReset} title={clearLabel} aria-label={clearLabel}>
            <span ref={clearMeasureRef} className="hsk-cb-clear-measure" aria-hidden="true">{clearLabel}</span>
            {clearFit.compact ? <TrashIcon /> : <span className="hsk-cb-topbar-btn-label" style={{ fontSize: clearFit.size }}>{clearLabel}</span>}
          </button>
        )}

        {!isNarrow && (
          <span className="hsk-cb-exit-wrap">
            <button
              key={exitAck}
              type="button"
              className={`hsk-cb-squircle-btn hsk-cb-exit-btn${exitAck > 0 ? ' hsk-cb-exit-btn--ack' : ''}`}
              onClick={onClose}
              aria-label="Close Chat"
            >
              <CloseIcon />
            </button>
            {exitHint && <span className="hsk-cb-exit-hint" aria-hidden="true">{exitHint}</span>}
            <span className="hsk-sr-only" aria-live="polite">{exitHint ?? ''}</span>
          </span>
        )}
      </div>

      {isNarrow && themeMenuOpen && (
        <div
          className={cn("hsk-cb-topbar-scrim", themeDiscovery && 'is-discovery', themeMenuClosing && "is-closing")}
          onClick={onToggleThemeMenu}
          aria-hidden="true"
        />
      )}

      {trayMounted && (
        <div
          ref={trayRef}
          className={cn("hsk-cb-topbar-ooze-menu", themeMenuClosing && "is-closing", trayMotion && "is-island", !themeMenuOpen && "is-parked")}
          role="dialog"
          aria-label="Theme selector"
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
          {layoutControl && <div className="hsk-cb-dock-layout"><span className="hsk-cb-layout-label">RESPONSIVE LAYOUT</span>{layoutControl}</div>}
          </div>
        </div>
      )}
      {isNarrow && themeMenuOpen && below && (
        <div className={cn("hsk-cb-tray-below", themeMenuClosing && "is-closing")}>{below}</div>
      )}
      {isNarrow && themeMenuOpen && themeDiscovery && (
        <ThemeDiscoveryHint mobile closing={themeMenuClosing} />
      )}
    </div>
  );
}
