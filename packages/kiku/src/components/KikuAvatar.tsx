import React, { useEffect, useRef } from 'react';
import { createKiku, KIKU_SVG, type Kiku } from './kikuBrain';

export type KikuState = 'idle' | 'thinking' | 'visualizing' | 'speaking' | 'failed' | 'curious' | 'welcoming' | 'guiding' | 'happy' | 'focused'
  | 'listening' | 'handoff';

export interface KikuAvatarProps {
  state?: KikuState;
  size?: number;
  alert?: boolean;
  theme?: string; // colours come from the theme's CSS tokens; kept for callers
  onImpact?: (splat: number) => void; // 1 as kiku lands, 0 just after
  triggerRef?: React.MutableRefObject<(() => void) | undefined>;
  // Starts above its spot and drops in, for an entrance onto whatever it sits on.
  dropIn?: boolean;
  // The chat's message box: while the visitor types, kiku looks at the caret and listens.
  inputRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  // Count of messages kiku should notice; a rise (a reply's first words, a teammate's message) makes kiku swell.
  notice?: number;
  // A moment to react to over the current state: n bumps each time.
  cue?: { kind: KikuCue; n: number };
}

// happy: something worked or the visitor is pleased; oh: the visitor stopped the reply.
export type KikuCue = 'happy' | 'oh';

// Roughly where the caret sits: half an em per character before it on its line.
function caretAt(el: HTMLTextAreaElement | HTMLInputElement) {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el), pad = parseFloat(cs.paddingLeft) || 0, inner = Math.max(1, r.width - pad * 2);
  const before = el.value.slice(0, el.selectionStart ?? 1e9);
  return { x: r.left + pad + (before.length - before.lastIndexOf('\n') - 1) * parseFloat(cs.fontSize) * .5 % inner, y: r.top + r.height / 2 };
}

export function KikuAvatar({ state = 'idle', size = 40, alert = false, onImpact, triggerRef, dropIn = false, inputRef, notice = 0, cue }: KikuAvatarProps) {
  const ref = useRef<SVGSVGElement>(null);
  const kiku = useRef<Kiku>();
  const props = useRef({ onImpact, inputRef });
  props.current = { onImpact, inputRef };

  useEffect(() => {
    const svg = ref.current!, doc = svg.ownerDocument, root = svg.getRootNode() as Document | ShadowRoot;
    // The drawing goes in here, not through React: React would rebuild it on a
    // re-render and the brain would go on moving parts no longer on screen.
    svg.innerHTML = KIKU_SVG;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const k = createKiku(svg, s => props.current.onImpact?.(s), !!mq?.matches, dropIn);
    kiku.current = k;
    const input = (e: Event) => e.target === props.current.inputRef?.current ? (e.target as HTMLTextAreaElement) : null;
    const on: [EventTarget, string, (e: any) => void][] = [
      [doc, 'visibilitychange', () => k.pause(doc.hidden)],
      [svg, 'pointerenter', () => k.react('hover')],
      [root, 'pointermove', (e: PointerEvent) => k.attend({ x: e.clientX, y: e.clientY })],
      [root, 'input', (e: Event) => { const el = input(e); if (el) k.typed(caretAt(el)); }],
      [root, 'focusin', (e: Event) => { if (input(e)) k.focus(true); }],
      [root, 'focusout', (e: Event) => { if (input(e)) k.focus(false); }],
    ];
    const onMq = () => k.setReduced(mq.matches);
    on.forEach(([t, n, f]) => t.addEventListener(n, f, { passive: true }));
    mq?.addEventListener?.('change', onMq);
    if (triggerRef) triggerRef.current = () => k.react('boop');
    if (doc.hidden) k.pause(true);
    return () => {
      k.destroy(); kiku.current = undefined;
      on.forEach(([t, n, f]) => t.removeEventListener(n, f));
      mq?.removeEventListener?.('change', onMq);
      if (triggerRef) triggerRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => kiku.current?.setBase(state), [state]);
  useEffect(() => kiku.current?.setAlert(alert), [alert]);
  // Only a rise counts: opening a chat with history, or clearing it, is not news.
  const seen = useRef(notice);
  useEffect(() => { if (notice > seen.current) kiku.current?.react('swell'); seen.current = notice; }, [notice]);
  const cued = useRef(cue?.n);
  useEffect(() => { if (cue && cue.n !== cued.current) kiku.current?.react(cue.kind); cued.current = cue?.n; }, [cue?.n]);

  return (
    <svg ref={ref} className="hsk-kiku" width={size} height={size} viewBox="-50 -50 100 100" aria-hidden="true" />
  );
}

export default KikuAvatar;
