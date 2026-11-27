// Preact build only. React 18 runs useEffect before paint when a click or key
// caused the render; Preact always waits a frame, so the modal showed a frame
// of stale state (empty kiku, old text) at those moments. Same timing here.
import { options } from 'preact';

const DISCRETE = new Set(['click', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'input', 'change', 'submit', 'beforeinput',
  'compositionend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'focusin', 'focusout',
  'copy', 'cut', 'paste', 'drop']);

export function preactEffects() {
  let discrete = false;
  let flush;

  const afterFrame = cb => {
    let raf;
    const done = () => { clearTimeout(timer); cancelAnimationFrame(raf); setTimeout(cb); };
    const timer = setTimeout(done, 35);
    raf = requestAnimationFrame(done);
  };

  options.requestAnimationFrame = cb => {
    flush = cb;
    (discrete ? queueMicrotask : afterFrame)(cb);
  };

  const prevEvent = options.event;
  options.event = e => {
    if (DISCRETE.has(e.type) && !discrete) {
      discrete = true;
      setTimeout(() => { discrete = false; });
      // Runs after the handler's render; effects still waiting on a frame go now.
      queueMicrotask(() => queueMicrotask(() => flush?.()));
    }
    return prevEvent ? prevEvent(e) : e;
  };
}
