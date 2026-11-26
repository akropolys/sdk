import { useEffect, type RefObject } from 'react';
import { writingSlow } from '../../../utils/writing';

const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const f = (a: number, b: number, t: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0, hi = 1, t = p;
    for (let i = 0; i < 24; i++) {
      const x = f(x1, x2, t);
      if (Math.abs(x - p) < 1e-5) break;
      if (x < p) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return f(y1, y2, t);
  };
};

// Android's IME curves.
const IME_EASE = bezier(0.2, 0, 0, 1);
const LEAD_EASE = bezier(0, 0, 0.2, 1);
const IME_MS = 285;
const DOWN_MS = 240;
const GAP = 10;
const LEARN_KEY = 'hsk-kb';

type Anim = { from: number; to: number; t0: number; dur: number; ease: (p: number) => number; done?: () => void };

const store = {
  get(): { d: number; t: number } | null {
    try { return JSON.parse(localStorage.getItem(LEARN_KEY) || 'null'); } catch { return null; }
  },
  set(v: { d: number; t: number }) {
    try { localStorage.setItem(LEARN_KEY, JSON.stringify(v)); } catch {}
  },
};

/**
 * Phone keyboard: the panel always covers the screen; the chat and the input
 * move together as one layer and land just above the keyboard.
 */
export function usePhoneKeyboard(
  overlayRef: RefObject<HTMLElement | null>,
  mainRef: RefObject<HTMLElement | null>,
  dockRef: RefObject<HTMLElement | null>,
  scrollerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const ov = overlayRef.current, main = mainRef.current, dock = dockRef.current;
    if (!ov || !main || !dock || typeof window === 'undefined') return;
    if (!window.matchMedia?.('(max-width: 768px)').matches) return;

    const vv = window.visualViewport;
    const vk = (navigator as any).virtualKeyboard as any;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const html = document.documentElement, body = document.body;
    const panel = (ov.querySelector('.hsk-cb-panel') as HTMLElement | null) || ov;

    const prevOverflow = html.style.overflow;
    if (writingSlow()) ov.setAttribute('data-hsk-solid', '');
    html.style.overflow = 'hidden';

    let useVk = false;
    const prevVk = vk ? vk.overlaysContent : null;
    try { if (vk && window.isSecureContext) { vk.overlaysContent = true; useVk = vk.overlaysContent === true; } } catch {}

    const meta = document.querySelector('meta[name="viewport"]');
    const metaPrev = meta ? meta.getAttribute('content') : null;
    if (meta && metaPrev && !useVk && /width\s*=\s*device-width/i.test(metaPrev) && !/interactive-widget/i.test(metaPrev)) {
      meta.setAttribute('content', metaPrev + ', interactive-widget=resizes-content');
    }

    // The root wears the panel colour, so nothing shows past a shrinking layout.
    const bgPrev = [html, body].map(el => [el.style.getPropertyValue('background-color'), el.style.getPropertyPriority('background-color')]);
    const paintRoot = () => {
      const c = getComputedStyle(panel).backgroundColor;
      [html, body].forEach(el => el.style.setProperty('background-color', c, 'important'));
    };
    paintRoot();
    let repaintT = 0;
    const themeObs = new MutationObserver(() => { paintRoot(); clearTimeout(repaintT); repaintT = window.setTimeout(paintRoot, 420); });
    themeObs.observe(ov, { attributes: true, attributeFilter: ['data-hsk-theme'] });

    const probe = (h: string) => {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = `position:fixed;bottom:0;width:0;visibility:hidden;pointer-events:none;height:${h}`;
      ov.appendChild(el);
      return el;
    };
    const sab = probe('env(safe-area-inset-bottom, 0px)');
    const sabMax = probe('env(safe-area-max-inset-bottom, 0px)');

    const lh0 = ov.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const wrap = () => dock.querySelector('.hsk-cb-input-wrap') as HTMLElement | null;
    const pill = () => dock.querySelector('.hsk-cb-input-card') as HTMLElement | null;
    const list = () => scrollerRef.current;
    const isField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.classList?.contains('hsk-cb-textarea');

    let y = 0, anim: Anim | null = null, raf = 0, guard = 0, watchUntil = 0;
    let lhPrev = lh0, focusAt = 0, padTop = 0, padBottom = 0, vkLift = 0, kb = 0, kbY = 0, nav = 0;
    let anchorEnd = 0, writing = false, compH = -1, compEl: Element | null = null;
    let learned = store.get();

    const off = () => (vv ? vv.offsetTop : 0);
    const vh = () => (vv ? vv.height : ov.clientHeight);
    const pad = () => { const w = wrap(); return w ? parseFloat(getComputedStyle(w).paddingBottom) || GAP : GAP; };
    const navProbe = () => Math.max(sab.offsetHeight, sabMax.offsetHeight);

    const onListScroll = () => {
      const l = list();
      if (l && !writing) anchorEnd = l.scrollHeight - l.scrollTop - l.clientHeight;
    };
    const restoreAnchor = () => {
      const l = list();
      if (!l) return;
      writing = true;
      l.scrollTop = l.scrollHeight - l.clientHeight - anchorEnd;
      writing = false;
    };
    const place = (t: number, b: number) => {
      if (t === padTop && b === padBottom) return;
      main.style.setProperty('padding-top', t ? `${t}px` : '', t ? 'important' : '');
      main.style.setProperty('padding-bottom', b ? `${b}px` : '', b ? 'important' : '');
      padTop = t; padBottom = b;
      restoreAnchor();
    };
    const setY = (v: number) => {
      y = v;
      const r = snap(v);
      dock.style.transform = r ? `translate3d(0,${r}px,0)` : '';
    };
    const stop = () => { anim = null; dock.style.willChange = ''; };

    const step = (now: number) => {
      raf = 0;
      if (ov.clientHeight !== lhPrev) onLayout();
      if (anim) {
        const a = anim;
        const p = Math.max(0, Math.min(1, (now - a.t0) / a.dur));
        setY(a.from + (a.to - a.from) * a.ease(p));
        if (p >= 1) { anim = null; dock.style.willChange = ''; a.done?.(); }
      }
      if (anim || performance.now() < watchUntil) raf = requestAnimationFrame(step);
    };
    const watch = (ms: number) => { watchUntil = performance.now() + ms; if (!raf) raf = requestAnimationFrame(step); };
    const animate = (to: number, dur: number, ease: (p: number) => number, done?: () => void) => {
      if (reduce.matches || dur <= 0 || to === y) { stop(); setY(to); done?.(); return; }
      anim = { from: y, to, t0: performance.now(), dur, ease, done };
      dock.style.willChange = 'transform';
      if (!raf) raf = requestAnimationFrame(step);
    };

    // The chat runs under the glass input; its last line stays clear of it.
    const roComp = typeof ResizeObserver === 'function' ? new ResizeObserver(() => syncComp()) : null;
    const syncComp = () => {
      const w = dock.querySelector('.hsk-cb-composer-wrapper');
      if (w !== compEl) { if (compEl) roComp?.unobserve(compEl); compEl = w; if (w) roComp?.observe(w); }
      const ch = w ? (w as HTMLElement).offsetHeight : 0;
      if (ch === compH) return;
      compH = ch;
      dock.style.setProperty('--hsk-composer-h', `${ch}px`);
      restoreAnchor();
    };

    // Every viewport change: keep the panel's top in view, place the chat, catch the one-step resize.
    const onLayout = () => {
      syncComp();
      const lh = ov.clientHeight, o = off(), h = vh();
      if (useVk ? !kb : lh0 - h <= 80) nav = navProbe();
      const d = lhPrev - lh;
      lhPrev = lh;
      let lift = vkLift;
      if (!useVk) {
        const pinned = lh >= lh0 - 80 && lh0 - h > 80;
        const kbTop = o + h - (pinned ? nav : 0);
        lift = Math.max(0, (lh - pad()) - (kbTop - GAP));
        if (pinned && y < 0 && !(anim && anim.to === 0)) { clearTimeout(guard); stop(); setY(0); }
      }
      place(Math.round(o), Math.round(lift));
      if (!useVk && Math.abs(d) > 40) {
        clearTimeout(guard);
        if (d > 0) {
          const t = focusAt ? Math.round(performance.now() - focusAt) : 0;
          if (t > 0 && t < 1000) { learned = { d, t }; store.set(learned); }
          stop(); setY(0);
        } else {
          stop(); setY(d); animate(0, DOWN_MS, IME_EASE);
        }
      }
    };

    const onFocus = (e: FocusEvent) => {
      if (!isField(e.target)) return;
      focusAt = performance.now();
      onListScroll();
      watch(1200);
      if (!useVk && learned && ov.clientHeight >= lh0 - 40 && window.matchMedia('(pointer: coarse)').matches) {
        animate(-learned.d, Math.max(60, learned.t - 15), LEAD_EASE);
        guard = window.setTimeout(() => { if (ov.clientHeight >= lh0 - 40) animate(0, DOWN_MS, IME_EASE); }, 900);
      }
    };
    const onBlur = (e: FocusEvent) => { if (isField(e.target)) { onListScroll(); watch(1200); } };

    // The reported rect leaves out the gesture bar the panel reaches under.
    const kbEdge = () => (kbY > 0 ? kbY : ov.clientHeight - kb) - nav;
    const pillGap = () => { const p = pill(); return p ? kbEdge() - GAP - p.getBoundingClientRect().bottom : 0; };
    const settle = () => requestAnimationFrame(() => {
      if (!kb || anim) return;
      const g = pillGap();
      if (Math.abs(g) > 0.5) { vkLift = Math.max(0, Math.round(vkLift - g)); place(padTop, vkLift); }
    });
    const onGeo = (e: any) => {
      const r = e.target.boundingRect;
      kb = r.height; kbY = r.y;
      wrap()?.toggleAttribute('data-kb', kb > 0);
      const cur = vkLift - y;
      const target = kb ? Math.max(0, Math.round(cur - pillGap())) : 0;
      place(padTop, 0); vkLift = 0; setY(-cur);
      animate(-target, IME_MS, IME_EASE, () => { vkLift = target; setY(0); place(padTop, target); settle(); });
    };

    const tick = window.setInterval(() => { if (!anim) onLayout(); }, 150);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => onLayout()) : null;
    ro?.observe(ov);
    const scroller = list();
    scroller?.addEventListener('scroll', onListScroll, { passive: true });
    vv?.addEventListener('resize', onLayout);
    vv?.addEventListener('scroll', onLayout);
    if (useVk) vk.addEventListener('geometrychange', onGeo);
    dock.addEventListener('focusin', onFocus);
    dock.addEventListener('focusout', onBlur);
    onLayout();

    return () => {
      stop(); cancelAnimationFrame(raf); clearTimeout(guard); clearTimeout(repaintT); clearInterval(tick);
      ro?.disconnect(); roComp?.disconnect(); themeObs.disconnect();
      scroller?.removeEventListener('scroll', onListScroll);
      vv?.removeEventListener('resize', onLayout);
      vv?.removeEventListener('scroll', onLayout);
      if (useVk) vk.removeEventListener('geometrychange', onGeo);
      dock.removeEventListener('focusin', onFocus);
      dock.removeEventListener('focusout', onBlur);
      try { if (vk) vk.overlaysContent = prevVk; } catch {}
      if (meta && metaPrev !== null) meta.setAttribute('content', metaPrev);
      html.style.overflow = prevOverflow;
      [html, body].forEach((el, i) => el.style.setProperty('background-color', bgPrev[i][0], bgPrev[i][1]));
      sab.remove(); sabMax.remove();
      ov.removeAttribute('data-hsk-solid');
      dock.style.transform = ''; dock.style.willChange = ''; dock.style.removeProperty('--hsk-composer-h');
      main.style.removeProperty('padding-top'); main.style.removeProperty('padding-bottom');
      wrap()?.removeAttribute('data-kb');
    };
  }, [overlayRef, mainRef, dockRef, scrollerRef]);
}
