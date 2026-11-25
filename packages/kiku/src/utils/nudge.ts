import { BLOOM_DURATION_MS, BLOOM_REACH, BLOOM_JITTER } from './bloomTiming';

// The doodle wave starts at the lower dock corner and travels to the opposite corner.
export function waveArrival(element: HTMLElement, canvas: HTMLElement, rtl: boolean): number | undefined {
  const area = canvas.getBoundingClientRect();
  if (!area.width || !area.height) return;
  const box = element.getBoundingClientRect();
  const x = Math.max(area.left, Math.min(area.right, (box.left + box.right) / 2));
  const y = Math.max(area.top, Math.min(area.bottom, (box.top + box.bottom) / 2));
  const startX = rtl ? area.right : area.left;
  const progress = Math.min(1, Math.hypot(x - startX, y - area.bottom) / Math.hypot(area.width, area.height));
  return Math.round(BLOOM_DURATION_MS * (BLOOM_REACH * progress + BLOOM_JITTER / 2));
}

export function animateNudge(elements: HTMLElement[], rtl: boolean, canvas?: HTMLElement | null, text?: HTMLElement | null): Animation[] {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return [];
  const away = rtl ? -3 : 3;
  const frames: Keyframe[] = [
    { transform: 'translate(0, 0)', easing: 'cubic-bezier(.3, 0, .2, 1)' },
    { offset: 0.26, transform: `translate(${away}px, -6px)`, easing: 'cubic-bezier(.45, 0, .35, 1)' },
    { offset: 0.52, transform: `translate(${-away * 0.3}px, 1.6px)`, easing: 'cubic-bezier(.45, 0, .35, 1)' },
    { offset: 0.74, transform: `translate(${away * 0.1}px, -0.6px)`, easing: 'cubic-bezier(.45, 0, .55, 1)' },
    { transform: 'translate(0, 0)' },
  ];
  return elements.filter(element => typeof element.animate === 'function')
    .map(element => element.animate(frames, { duration: 1100, delay: element !== text && canvas ? waveArrival(element, canvas, rtl) ?? 380 : 380 }));
}
