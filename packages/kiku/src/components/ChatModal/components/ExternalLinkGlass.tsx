import React from 'react';
import { externalLinkGlass } from '../../../utils/externalLinkGlass';

export function ExternalLinkGlass() {
  const surfaceRef = React.useRef<HTMLSpanElement>(null);
  const outlineRef = React.useRef<SVGSVGElement>(null);
  const pathRef = React.useRef<SVGPathElement>(null);

  React.useEffect(() => {
    const surface = surfaceRef.current;
    const outline = outlineRef.current;
    const path = pathRef.current;
    const card = surface?.parentElement;
    if (!surface || !outline || !path || !card) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = card.clientWidth;
    let height = card.clientHeight;
    let visible = true;
    let frame = 0;
    const start = performance.now();

    const draw = (time: number) => {
      if (width <= 0 || height <= 0) return;
      const phase = reduced.matches ? -1 : ((time - start) % 8000) / 8000;
      const { d, center } = externalLinkGlass(width, height, phase);
      surface.style.clipPath = `path('${d}')`;
      surface.style.setProperty('--hsk-wave-x', `${center}px`);
      outline.setAttribute('viewBox', `0 0 ${width} ${height + 12}`);
      path.setAttribute('d', d);
    };
    const tick = (time: number) => {
      frame = 0;
      draw(time);
      if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      draw(performance.now());
      if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
    };
    const resize = new ResizeObserver(() => {
      width = card.clientWidth;
      height = card.clientHeight;
      sync();
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    resize.observe(card);
    intersection.observe(card);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
    };
  }, []);

  return <>
    <span ref={surfaceRef} className="hsk-cb-external-surface" aria-hidden="true" />
    <svg ref={outlineRef} className="hsk-cb-external-outline" aria-hidden="true" focusable="false"><path ref={pathRef} /></svg>
  </>;
}
