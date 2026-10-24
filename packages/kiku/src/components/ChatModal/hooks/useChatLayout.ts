import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const key = 'akropolys_chat_layout';
export function useChatLayout(scroller: RefObject<HTMLElement | null>) {
  const [wide, setWide] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(key) === 'wide'; } catch { return false; }
  });
  const anchor = useRef<{node?: HTMLElement; top: number; bottom: boolean} | null>(null);
  const animations = useRef<Animation[]>([]);
  const previous = useRef(new Map<HTMLElement, DOMRect>());
  const toggle = () => {
    animations.current.forEach(a => a.cancel());
    previous.current.clear();
    scroller.current?.querySelectorAll<HTMLElement>('.hsk-cb-msg-group').forEach(row => previous.current.set(row, row.getBoundingClientRect()));
    const box = scroller.current;
    if (box) {
      const top = box.getBoundingClientRect().top;
      const node = Array.from(box.querySelectorAll<HTMLElement>('.hsk-cb-msg-group')).find(el => el.getBoundingClientRect().bottom > top);
      anchor.current = {node, top: node ? node.getBoundingClientRect().top - top : 0,
        bottom: box.scrollHeight - box.scrollTop - box.clientHeight < 40};
    }
    setWide(value => !value);
  };
  useLayoutEffect(() => {
    const saved = anchor.current, box = scroller.current;
    if (!saved || !box) return;
    anchor.current = null;
    // Restore the visible turn before paint; changing layout never remounts it.
    const behavior = box.style.scrollBehavior;
    box.style.scrollBehavior = 'auto';
    if (saved.bottom) box.scrollTop = box.scrollHeight;
    else if (saved.node?.isConnected) box.scrollTop += saved.node.getBoundingClientRect().top - box.getBoundingClientRect().top - saved.top;
    box.style.scrollBehavior = behavior;
    animations.current.forEach(a => a.cancel());
    animations.current = [];
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const bounds = box.getBoundingClientRect();
      for (const row of box.querySelectorAll<HTMLElement>('.hsk-cb-msg-group')) {
        const rect = row.getBoundingClientRect();
        if (rect.bottom < bounds.top || rect.top > bounds.bottom || !row.animate) continue;
        const before = previous.current.get(row);
        if (!before || !rect.width || !rect.height) continue;
        animations.current.push(row.animate([
          {transformOrigin: 'top left', transform: `translate(${before.left - rect.left}px, ${before.top - rect.top}px) scale(${before.width / rect.width}, ${before.height / rect.height})`},
          {transformOrigin: 'top left', transform: 'none'}
        ], {duration: 360, easing: 'cubic-bezier(.4,0,.2,1)'}));
      }
    }
  }, [wide, scroller]);
  useEffect(() => { try { localStorage.setItem(key, wide ? 'wide' : 'bubbles'); } catch {} }, [wide]);
  useEffect(() => () => animations.current.forEach(a => a.cancel()), []);
  return {wide, toggle};
}
