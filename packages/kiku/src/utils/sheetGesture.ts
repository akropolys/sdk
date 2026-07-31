import { useEffect, useRef } from 'react';

/**
 * Resistance past a boundary. Displacement approaches an asymptote instead of
 * hitting a wall, so pulling further always moves *something* — the reason a
 * hard clamp reads as broken and this reads as elastic.
 */
export function rubberBand(offset: number, dimension: number, coeff = 0.55): number {
  if (dimension <= 0) return 0;
  return (offset * dimension * coeff) / (dimension + coeff * Math.abs(offset));
}

type SpringOpts = { stiffness?: number; damping?: number; onFrame: (v: number) => void; onRest?: () => void };

/**
 * A spring you push values into, not an animation you play. `to` retargets from
 * the CURRENT position and velocity, so grabbing mid-flight continues the motion
 * rather than restarting it — the difference between this and a CSS transition.
 *
 * Measured at these constants: 90% of the travel lands in ~183ms with no
 * overshoot. Note that initial velocity barely changes the motion (~16ms over a
 * 200px move, none over a 500px one) — critical damping absorbs it. Velocity
 * earns its keep in the dismiss DECISION, not in the animation.
 */
// Critically damped: 2*sqrt(stiffness) is the exact no-overshoot boundary. A
// sheet must not bounce, but under-damping it further makes flicks feel absorbed
// and dead — measured at 220/30 it took ~2s to settle and a 2000px/s flick
// arrived no sooner than a dead release.
export function createSpring({ stiffness = 500, damping = 45, onFrame, onRest }: SpringOpts) {
  let value = 0, velocity = 0, target = 0;
  let raf: number | null = null;
  let last = 0;

  const tick = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000) || 1 / 60;
    last = now;
    // Semi-implicit Euler, substepped so a long frame can't make it explode.
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -stiffness * (value - target) - damping * velocity;
      velocity += a * h;
      value += velocity * h;
    }
    // Sub-pixel: the last stretch of an exponential tail is invisible, and
    // resting sooner stops the rAF ~6 frames earlier per gesture.
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
    /** Jump to a value without animating — for tracking a finger 1:1. */
    track(v: number) {
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      value = v; velocity = 0; onFrame(value);
    },
    /** Animate to a target, carrying `v0` in as initial velocity (px/s). */
    to(t: number, v0 = 0) { target = t; velocity = v0; start(); },
    get value() { return value; },
    stop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } },
  };
}

type Opts = {
  panel: () => HTMLElement | null;
  scroller: () => HTMLElement | null;
  onDismiss: () => void;
  /** False while the list is still moving under its own momentum. */
  quiescent?: () => boolean;
  enabled?: boolean;
};

/**
 * Drag-down-to-dismiss. The sheet follows the finger exactly while the scroller
 * is already at the top; past that it rubber-bands. On release the decision uses
 * velocity as well as distance — a short fast flick dismisses, a long slow drag
 * that stalls snaps back — which is where velocity actually matters, since the
 * spring itself absorbs it almost entirely.
 */
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
        // Dismiss AFTER the sheet has flown out. Calling it on release unmounts
        // the panel immediately, which tears down this effect and cancels the
        // very animation that was meant to play — the sheet just vanished.
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
        // Claim the gesture only for a downward pull that starts at the top of
        // the list. Anything else stays with the scroller (or the host page).
        decided = true;
        dragging = dy > 0 && Math.abs(dy) > Math.abs(dx) && atTop();
        if (dragging) {
          // Capture only once committed. Capturing on pointerdown would claim
          // every touch on the panel — including ones meant to scroll the list —
          // and a captured pointer can stop the native scroll from happening.
          try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
          spring.stop();
          // A running CSS animation outranks inline styles for the same
          // property, so the entrance keyframes would swallow our transform.
          // Clearing it also makes the entrance itself grabbable mid-flight.
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
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
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
