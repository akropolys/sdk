import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { ChatMessage } from '@akropolys/sdk';

interface UseChatScrollOptions {
  messages: ChatMessage[];
  loading: boolean;
  streaming: boolean;
  messageRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

export function useChatScroll({ messages, loading, streaming, messageRefs }: UseChatScrollOptions) {
  const msgsContainerRef = useRef<HTMLDivElement>(null);
  const lastExternalScrollRef = useRef(0);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(1);
  const [activeMsgIdx, setActiveMsgIdx] = useState(0);
  const resyncScrollRef = useRef<() => void>(() => {});
  const glideScrollRef = useRef<((to: number) => void) | null>(null);
  const touchScrollingRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const spacerRef = useRef<HTMLDivElement>(null);
  const anchorNodeRef = useRef<HTMLElement | null>(null);
  const prevLenRef = useRef(messages.length);
  const pendingAnchorRef = useRef(false);
  const layoutAnchorRef = useRef<(mode: 'glide' | 'sync') => void>(() => {});
  const followBottomRef = useRef<() => void>(() => {});
  const syncScrollRef = useRef<((to: number) => void) | null>(null);
  const releaseAnchorRef = useRef<() => void>(() => {});
  const [alertTick, setAlertTick] = useState(0);
  const awayEpochRef = useRef(0);
  const lastAlertKeyRef = useRef('');
  const dismissJumpAlertRef = useRef<() => void>(() => {});
  const resetAlertArmingRef = useRef<() => void>(() => {});

  useEffect(() => {
    const el = msgsContainerRef.current;
    if (!el) return;
    let idle: ReturnType<typeof setTimeout>;
    const settle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => { touchScrollingRef.current = false; }, 150);
    };
    const onTouchStart = () => {
      clearTimeout(idle);
      touchScrollingRef.current = true;
      dismissJumpAlertRef.current();
    };
    const onScroll = () => { if (touchScrollingRef.current) settle(); };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', settle, { passive: true });
    el.addEventListener('touchcancel', settle, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(idle);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', settle);
      el.removeEventListener('touchcancel', settle);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const el = msgsContainerRef.current;
    if (!el) return;
    const JUMP_THRESHOLD = 160;
    const STICK_ON = 8;
    let queued = 0;

    const measure = () => {
      queued = 0;
      const spacerH = spacerRef.current?.offsetHeight ?? 0;
      const distance = el.scrollHeight - spacerH - el.scrollTop - el.clientHeight;
      if (distance <= STICK_ON) {
        if (!stickToBottomRef.current) resetAlertArmingRef.current();
        stickToBottomRef.current = true;
        clearUnreadRef.current();
      }

      setShowJumpToBottom(distance > JUMP_THRESHOLD && !stickToBottomRef.current);

      const max = el.scrollHeight - el.clientHeight;
      setScrollProgress(max > 8 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 1);

      const line = el.scrollTop + el.clientHeight * 0.33;
      let active = 0;
      for (let i = 0; i < messageRefs.current.length; i++) {
        const node = messageRefs.current[i];
        if (node && node.offsetTop <= line) active = i;
      }
      setActiveMsgIdx(active);
    };

    const onScroll = () => {
      if (queued) return;
      queued = requestAnimationFrame(measure);
    };

    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => { // rows resize after the commit (tables, images, fonts)
      if (anchorNodeRef.current) layoutAnchorRef.current('sync');
      else if (stickToBottomRef.current && !touchScrollingRef.current) followBottomRef.current();
      onScroll();
    });
    ro.observe(el);
    for (const node of messageRefs.current) if (node) ro.observe(node);
    return () => {
      if (queued) cancelAnimationFrame(queued);
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [messages.length, messageRefs]);

  const notifyNewBelow = useCallback((turn: number) => {
    const key = `${turn}:${awayEpochRef.current}`;
    if (lastAlertKeyRef.current === key) return;
    lastAlertKeyRef.current = key;
    setAlertTick(t => t + 1);
  }, []);

  const [unreadBelow, setUnreadBelow] = useState(false);
  const unreadBelowRef = useRef(false);
  const markUnread = useCallback(() => {
    if (unreadBelowRef.current) return;
    unreadBelowRef.current = true;
    setUnreadBelow(true);
  }, []);
  const clearUnread = useCallback(() => {
    if (!unreadBelowRef.current) return;
    unreadBelowRef.current = false;
    setUnreadBelow(false);
  }, []);
  const clearUnreadRef = useRef<() => void>(() => {});
  clearUnreadRef.current = clearUnread;

  const [jumpAlert, setJumpAlert] = useState(false);
  const jumpAlertRef = useRef(false);
  const alertShownAtRef = useRef(0);
  const clearAlert = useCallback(() => {
    jumpAlertRef.current = false;
    setJumpAlert(false);
  }, []);
  const resetAlertArming = useCallback(() => {
    lastAlertKeyRef.current = '';
    clearAlert();
    clearUnread();
  }, [clearAlert, clearUnread]);
  const dismissJumpAlert = useCallback(() => {
    if (!jumpAlertRef.current) return;
    if (performance.now() - alertShownAtRef.current < 700) return;
    clearAlert();
  }, [clearAlert]);
  dismissJumpAlertRef.current = dismissJumpAlert;
  resetAlertArmingRef.current = resetAlertArming;

  useEffect(() => {
    if (alertTick === 0) return;
    jumpAlertRef.current = true;
    alertShownAtRef.current = performance.now();
    setJumpAlert(true);
    const t = setTimeout(clearAlert, 4200);
    return () => clearTimeout(t);
  }, [alertTick, clearAlert]);

  const releaseAnchor = useCallback(() => {
    pendingAnchorRef.current = false;
    if (!anchorNodeRef.current) return;
    anchorNodeRef.current = null;
    if (spacerRef.current) spacerRef.current.style.height = '';
  }, []);
  releaseAnchorRef.current = releaseAnchor;

  followBottomRef.current = () => {
    const el = msgsContainerRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.clientHeight;
    if (syncScrollRef.current) syncScrollRef.current(bottom);
    else el.scrollTop = bottom;
  };

  layoutAnchorRef.current = (mode) => {
    const el = msgsContainerRef.current;
    const spacer = spacerRef.current;
    const node = anchorNodeRef.current;
    const move = (to: number) => {
      const fn = mode === 'sync' ? syncScrollRef.current : glideScrollRef.current;
      if (fn) fn(to);
      else if (el) el.scrollTop = to;
    };
    const followBottom = followBottomRef.current;

    if (!el || !spacer || !node || !node.isConnected) {
      releaseAnchor();
      if (stickToBottomRef.current) followBottom();
      return;
    }

    const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
    if (spacer.offsetHeight < el.clientHeight) spacer.style.height = `${el.clientHeight}px`; // defeat margin-top:auto before measuring
    const top = Math.max(0, node.offsetTop - padTop);
    const need = top + el.clientHeight - (el.scrollHeight - spacer.offsetHeight);

    if (need <= 0) {
      releaseAnchor();
      stickToBottomRef.current = true;
      followBottom();
      return;
    }

    if (need !== spacer.offsetHeight) spacer.style.height = `${need}px`; // exact: integer scrollHeight flickers +-1 per token
    move(top);
  };

  const jumpToMessage = useCallback((idx: number) => {
    const el = msgsContainerRef.current;
    const node = messageRefs.current[idx];
    if (!el || !node) return;
    const targetCenter = node.offsetTop - Math.max(0, (el.clientHeight - node.clientHeight) / 2);
    const to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, targetCenter));
    if (glideScrollRef.current) glideScrollRef.current(to);
    else el.scrollTo({ top: to, behavior: 'smooth' });
  }, [messageRefs]);

  const jumpToBottom = useCallback(() => {
    const el = msgsContainerRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    releaseAnchorRef.current();
    resetAlertArmingRef.current();
    const bottom = el.scrollHeight - el.clientHeight;
    if (glideScrollRef.current) glideScrollRef.current(bottom);
    else el.scrollTo({ top: bottom, behavior: 'smooth' });
  }, []);

  useLayoutEffect(() => {
    const container = msgsContainerRef.current;
    if (!container) return;

    const added = messages.slice(prevLenRef.current);
    prevLenRef.current = messages.length;
    if (added.some(m => m.role === 'user')) {
      stickToBottomRef.current = true;
      resetAlertArmingRef.current();
      anchorNodeRef.current = null;
      pendingAnchorRef.current = true;
    }

    if (pendingAnchorRef.current) {
      pendingAnchorRef.current = false;
      for (let i = messageRefs.current.length - 1; i >= 0; i--) {
        const node = messageRefs.current[i];
        if (node?.dataset.hskRole === 'user') { anchorNodeRef.current = node; break; }
      }
      if (anchorNodeRef.current) { layoutAnchorRef.current('glide'); return; }
    }
    if (anchorNodeRef.current) { layoutAnchorRef.current('glide'); return; }

    const before = container.scrollTop;
    if (!stickToBottomRef.current) {
      markUnread();
      notifyNewBelow(messages.length);
    } else if (!touchScrollingRef.current) {
      followBottomRef.current(); // exact, not eased: easing lags growth and bobs the last line
      return;
    }
    if (container.scrollTop !== before) resyncScrollRef.current();
  }, [messages, loading, streaming, messageRefs, notifyNewBelow, markUnread]);

  useEffect(() => {
    const el = msgsContainerRef.current;
    if (!el) return;

    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const LAMBDA = 7;
    const LINE_PX = 16;
    const step = 1 / (window.devicePixelRatio || 1);
    const snap = (v: number) => Math.round(v / step) * step;

    let target = el.scrollTop;
    let current = el.scrollTop;
    let written = el.scrollTop;
    let lastTime = 0;
    let rafId: number | null = null;

    const write = (v: number) => {
      if (v === written) return;
      el.scrollTop = v;
      written = el.scrollTop;
    };

    const resync = () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      el.classList.remove('hsk-scrolling');
      target = current = written = el.scrollTop;
    };
    resyncScrollRef.current = resync;

    glideScrollRef.current = (to: number) => {
      if (Math.abs(el.scrollTop - written) > 1) { target = current = written = el.scrollTop; }
      const next = Math.round(Math.max(0, Math.min(el.scrollHeight - el.clientHeight, to)));
      if (next === target) return;
      target = next;
      if (rafId === null) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(update);
      }
    };

    syncScrollRef.current = (to: number) => {
      const next = Math.round(Math.max(0, Math.min(el.scrollHeight - el.clientHeight, to)));
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; el.classList.remove('hsk-scrolling'); }
      el.scrollTop = next;
      target = current = written = el.scrollTop;
    };

    const update = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      current += (target - current) * (1 - Math.exp(-LAMBDA * dt));
      if (Math.abs(target - current) < step) {
        current = target;
        write(Math.round(target));
        el.classList.remove('hsk-scrolling');
        rafId = null;
        return;
      }
      write(snap(current));
      rafId = requestAnimationFrame(update);
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      if (Math.abs(el.scrollTop - written) > 1) target = current = written = el.scrollTop;

      if (e.deltaY < 0) {
        if (stickToBottomRef.current) awayEpochRef.current += 1;
        stickToBottomRef.current = false;
        releaseAnchorRef.current();
      }

      dismissJumpAlertRef.current();

      const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? el.clientHeight : 1;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const next = Math.round(Math.max(0, Math.min(maxScroll, target + e.deltaY * scale)));

      if (next === target) { if (maxScroll > 0) e.preventDefault(); return; }
      e.preventDefault();
      target = next;

      if (rafId === null) {
        lastTime = performance.now();
        el.classList.add('hsk-scrolling');
        rafId = requestAnimationFrame(update);
      }
    };

    let lastTop = el.scrollTop;
    const handleScroll = () => {
      const external = Math.abs(el.scrollTop - written) > 1;
      if (external) {
        lastExternalScrollRef.current = performance.now();
        if (el.scrollTop < lastTop - 1 && stickToBottomRef.current) {
          awayEpochRef.current += 1;
          stickToBottomRef.current = false;
          releaseAnchorRef.current();
        }
      }
      lastTop = el.scrollTop;
      if (rafId !== null && external) {
        cancelAnimationFrame(rafId);
        rafId = null;
        el.classList.remove('hsk-scrolling');
        target = current = written = el.scrollTop;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', handleWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
      el.classList.remove('hsk-scrolling');
      resyncScrollRef.current = () => {};
      glideScrollRef.current = null;
      syncScrollRef.current = null;
    };
  }, []);

  return {
    msgsContainerRef,
    spacerRef,
    lastExternalScrollRef,
    showJumpToBottom,
    scrollProgress,
    activeMsgIdx,
    jumpAlert,
    unreadBelow,
    jumpToMessage,
    jumpToBottom,
    resetAlertArming,
  };
}
