import { useEffect, useRef } from 'react';

export function rubberBand(offset: number, dimension: number, coeff = 0.55): number {
  if (dimension <= 0) return 0;
  return (offset * dimension * coeff) / (dimension + coeff * Math.abs(offset));
}

type SpringOpts = { stiffness?: number; damping?: number; onFrame: (v: number) => void; onRest?: () => void };

export function createSpring({ stiffness = 500, damping = 45, onFrame, onRest }: SpringOpts) {
  let value = 0, velocity = 0, target = 0;
  let raf: number | null = null;
  let last = 0;

  const tick = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000) || 1 / 60;
    last = now;
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -stiffness * (value - target) - damping * velocity;
      velocity += a * h;
      value += velocity * h;
    }
    if (Math.abs(value - target) < 0.5 && Math.abs(velocity) < 0.5) {
      value = target; velocity = 0; raf = null;
      onFrame(value); onRest?.();
      return;
    }
    onFrame(value);
    raf = requestAnimationFrame(tick);
  };

  const start = () => { if (raf === null) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  return {

    track(v: number) {
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      value = v; velocity = 0; onFrame(value);
    },

    to(t: number, v0 = 0) { target = t; velocity = v0; start(); },
    get value() { return value; },
    stop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } },
  };
}

type Opts = {
  panel: () => HTMLElement | null;
  scroller: () => HTMLElement | null;
  onDismiss: () => void;

  quiescent?: () => boolean;
  enabled?: boolean;
};

export function useDragToDismiss({ panel, scroller, onDismiss, quiescent, enabled = true }: Opts): void {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!enabled) return;
    const el = panel();
    if (!el) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let dragging = false, startY = 0, startX = 0, offset = 0, pointerId = -1;
    let lastY = 0, lastT = 0, velocity = 0, decided = false, exiting = false;

    const apply = (v: number) => {
      el.style.transform = v === 0 ? '' : `translate3d(0, ${v}px, 0)`;
      const host = el.parentElement;
      if (host) host.style.opacity = v === 0 ? '' : String(Math.max(0.35, 1 - v / (el.offsetHeight || 1) * 1.1));
    };
    const spring = createSpring({
      onFrame: apply,
      onRest: () => {
        el.style.willChange = '';
        if (exiting) { exiting = false; dismissRef.current(); }
      },
    });

    const atTop = () => {
      const s = scroller();
      if (s && s.scrollTop > 0) return false;
      return quiescent ? quiescent() : true;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      dragging = false; decided = false;
      pointerId = e.pointerId;
      startY = lastY = e.clientY; startX = e.clientX;
      lastT = e.timeStamp; velocity = 0;
      offset = spring.value;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dy = e.clientY - startY;
      const dx = e.clientX - startX;

      if (!decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        decided = true;
        dragging = dy > 0 && Math.abs(dy) > Math.abs(dx) && atTop();
        if (dragging) {
          try { el.setPointerCapture(e.pointerId); } catch {  }
          spring.stop();
          el.style.animation = 'none';
          el.style.willChange = 'transform';
        }
      }
      if (!dragging) return;

      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = ((e.clientY - lastY) / dt) * 1000;
      lastY = e.clientY; lastT = e.timeStamp;

      const raw = offset + dy;
      spring.track(raw < 0 ? -rubberBand(-raw, el.offsetHeight || 1) : raw);
      if (e.cancelable) e.preventDefault();
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch {  }
      pointerId = -1;
      if (!dragging) return;
      dragging = false;
      const h = el.offsetHeight || 1;
      const projected = spring.value + velocity * 0.12;
      if (projected > h * 0.3 || velocity > 900) {
        exiting = true;
        el.style.pointerEvents = 'none';
        spring.to(h, velocity);
      } else {
        spring.to(0, velocity);
      }
    };

    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp, { passive: true });
    el.addEventListener('pointercancel', onUp, { passive: true });
    return () => {
      spring.stop();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.style.transform = ''; el.style.willChange = ''; el.style.animation = ''; el.style.pointerEvents = '';
      const host = el.parentElement;
      if (host) host.style.opacity = '';
    };
  }, [enabled, panel, scroller, quiescent]);
}
