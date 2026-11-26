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
const GAP = 8;
const LEARN_KEY = 'hsk-kb';

type Anim = { c0: number; c1: number; s0: number; s1: number; t0: number; dur: number; ease: (p: number) => number; done?: () => void };

const store = {
  get(): { d: number; t: number } | null {
    try { return JSON.parse(localStorage.getItem(LEARN_KEY) || 'null'); } catch { return null; }
  },
  set(v: { d: number; t: number }) {
    try { localStorage.setItem(LEARN_KEY, JSON.stringify(v)); } catch {}
  },
};

/**
 * Phone keyboard: the panel always covers the screen and the input lands just
 * above the keyboard. Layout changes once; the input and the chat glide into
 * place from where they were, on the keyboard's curve.
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

    const sab = document.createElement('div');
    sab.setAttribute('aria-hidden', 'true');
    sab.style.cssText = 'position:fixed;bottom:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)';
    ov.appendChild(sab);

    const lh0 = ov.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const comp = () => dock.querySelector('.hsk-cb-composer-wrapper') as HTMLElement | null;
    const wrap = () => dock.querySelector('.hsk-cb-input-wrap') as HTMLElement | null;
    const pill = () => dock.querySelector('.hsk-cb-input-card') as HTMLElement | null;
    const list = () => scrollerRef.current;
    const isField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.classList?.contains('hsk-cb-textarea');

    let cY = 0, sY = 0, anim: Anim | null = null, raf = 0, guard = 0, watchUntil = 0;
    let lhPrev = lh0, focusAt = 0, padTop = 0, padBottom = 0, vkLift = 0, kb = 0, kbY = 0, nav = 0;
    let anchorEnd = 0, writing = false, compH = -1, compEl: Element | null = null;
    let seen: { c: number; s: number } | null = null;
    let learned = store.get();

    const off = () => (vv ? vv.offsetTop : 0);
    const vh = () => (vv ? vv.height : ov.clientHeight);
    const pad = () => { const w = wrap(); return w ? parseFloat(getComputedStyle(w).paddingBottom) || GAP : GAP; };

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

    // Two transforms, one clock: the input and the chat content.
    const apply = () => {
      const c = comp(), l = list();
      const rc = snap(cY), rs = snap(sY);
      if (c) c.style.transform = rc ? `translate3d(0,${rc}px,0)` : '';
      if (l) l.style.transform = rs ? `translate3d(0,${rs}px,0)` : '';
    };
    const setT = (c: number, s: number) => { cY = c; sY = s; apply(); };
    const willChange = (on: boolean) => {
      const c = comp(), l = list();
      if (c) c.style.willChange = on ? 'transform' : '';
      if (l) l.style.willChange = on ? 'transform' : '';
    };
    const stop = () => { anim = null; willChange(false); };
    const animate = (c1: number, s1: number, dur: number, ease: (p: number) => number, done?: () => void) => {
      if (reduce.matches || dur <= 0 || (c1 === cY && s1 === sY)) { stop(); setT(c1, s1); done?.(); return; }
      anim = { c0: cY, c1, s0: sY, s1, t0: performance.now(), dur, ease, done };
      willChange(true);
      if (!raf) raf = requestAnimationFrame(step);
    };

    // Where the input and the first line of chat sit on screen right now.
    const contentEl = () => { const l = list(); return (l?.firstElementChild as HTMLElement | null) || l; };
    const where = () => {
      const c = comp(), e = contentEl();
      return c && e ? { c: c.getBoundingClientRect().top, s: e.getBoundingClientRect().top } : null;
    };
    // After a layout change, start both from where they were and glide home.
    const glideFrom = (before: { c: number; s: number } | null, dur: number, clampUp = false) => {
      setT(0, 0);
      const after = where();
      if (!before || !after) { stop(); return; }
      let dc = before.c - after.c;
      if (clampUp && dc > 0) dc = 0; // never draw the input below a shrunk layout
      setT(dc, before.s - after.s);
      animate(0, 0, dur, IME_EASE);
    };

    const step = (now: number) => {
      raf = 0;
      if (ov.clientHeight !== lhPrev) onLayout();
      if (useVk) pollVk();
      if (anim) {
        const a = anim;
        const p = Math.max(0, Math.min(1, (now - a.t0) / a.dur));
        const e = a.ease(p);
        setT(a.c0 + (a.c1 - a.c0) * e, a.s0 + (a.s1 - a.s0) * e);
        if (p >= 1) { anim = null; willChange(false); a.done?.(); }
      }
      const live = performance.now() < watchUntil;
      seen = live ? where() : null;
      if (anim || live) raf = requestAnimationFrame(step);
    }
    const watch = (ms: number) => { watchUntil = performance.now() + ms; if (!raf) raf = requestAnimationFrame(step); };

    // The chat's last line stays clear of the glass input.
    const roComp = typeof ResizeObserver === 'function' ? new ResizeObserver(() => syncComp()) : null;
    const syncComp = () => {
      const w = comp();
      if (w !== compEl) { if (compEl) roComp?.unobserve(compEl); compEl = w; if (w) roComp?.observe(w); }
      const ch = w ? w.offsetHeight : 0;
      if (ch === compH) return;
      compH = ch;
      dock.style.setProperty('--hsk-composer-h', `${ch}px`);
      restoreAnchor();
    };

    const keyboardShown = () => (useVk && kb > 0) || lh0 - vh() > 80;
    const onLayout = () => {
      syncComp();
      const lh = ov.clientHeight, o = off(), h = vh();
      if (!keyboardShown()) nav = sab.offsetHeight;
      const d = lhPrev - lh;
      lhPrev = lh;
      // Keyboard API not honoured: fall back to the visual viewport.
      const vkLive = useVk && (kb > 0 || lh - h <= 80);
      let lift = vkLift;
      if (!vkLive) {
        const pinned = lh >= lh0 - 80 && lh0 - h > 80;
        const kbTop = o + h - (pinned ? nav : 0);
        lift = Math.max(0, (lh - pad()) - (kbTop - GAP));
        if (pinned && cY < 0 && !(anim && anim.c1 === 0)) { clearTimeout(guard); stop(); setT(0, 0); }
      }
      if (Math.abs(d) > 40 && !useVk) {
        clearTimeout(guard);
        const before = seen;
        place(Math.round(o), Math.round(lift));
        if (d > 0) {
          const t = focusAt ? Math.round(performance.now() - focusAt) : 0;
          if (t > 0 && t < 1000) { learned = { d, t }; store.set(learned); }
          glideFrom(before, 200, true);
        } else {
          glideFrom(before, DOWN_MS);
        }
        return;
      }
      place(Math.round(o), Math.round(lift));
    }

    const onFocus = (e: FocusEvent) => {
      if (!isField(e.target)) return;
      focusAt = performance.now();
      onListScroll();
      watch(1200);
      if (useVk) { pollVk(); return; }
      // Lead with the input only, so the chat moves once.
      if (learned && ov.clientHeight >= lh0 - 40 && window.matchMedia('(pointer: coarse)').matches) {
        animate(-learned.d, sY, Math.max(60, learned.t - 15), LEAD_EASE);
        guard = window.setTimeout(() => { if (ov.clientHeight >= lh0 - 40) animate(0, 0, DOWN_MS, IME_EASE); }, 900);
      }
    };
    const onBlur = (e: FocusEvent) => { if (isField(e.target)) { onListScroll(); watch(1200); } };

    // The reported rect leaves out a gesture bar the panel reaches under.
    const kbEdge = () => (kbY > 0 ? kbY : ov.clientHeight - kb) - nav;
    const pillGap = () => { const p = pill(); return p ? kbEdge() - GAP - p.getBoundingClientRect().bottom : 0; };
    const settle = () => requestAnimationFrame(() => {
      if (!kb || anim) return;
      const g = pillGap();
      if (Math.abs(g) > 0.5) { vkLift = Math.max(0, Math.round(vkLift - g)); place(padTop, vkLift); }
    });
    const onKeyboard = (height: number, y: number) => {
      if (height === kb && y === kbY) return;
      const before = where();
      kb = height; kbY = y;
      wrap()?.toggleAttribute('data-kb', kb > 0);
      const target = kb ? Math.max(0, Math.round(vkLift - cY - pillGap())) : 0;
      onListScroll();
      vkLift = target;
      place(padTop, target);
      glideFrom(before, IME_MS);
      if (anim) anim.done = settle; else settle();
      watch(600);
    };
    // geometrychange can be missed (keyboard already up, or a race); read it too.
    const pollVk = () => {
      const r = vk?.boundingRect;
      if (r) onKeyboard(r.height, r.y);
    };
    const onGeo = (e: any) => { const r = e.target.boundingRect; onKeyboard(r.height, r.y); };

    const tick = window.setInterval(() => {
      if (anim) return;
      onLayout();
      if (useVk) { pollVk(); if (kb && Math.abs(pillGap()) > 1) settle(); }
    }, 150);
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
    if (useVk) pollVk();

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
      sab.remove();
      ov.removeAttribute('data-hsk-solid');
      setT(0, 0);
      dock.style.removeProperty('--hsk-composer-h');
      main.style.removeProperty('padding-top'); main.style.removeProperty('padding-bottom');
      wrap()?.removeAttribute('data-kb');
    };
  }, [overlayRef, mainRef, dockRef, scrollerRef]);
}
