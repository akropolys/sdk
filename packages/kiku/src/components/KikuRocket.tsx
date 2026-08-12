import React, { useEffect, useId, useRef } from 'react';

export interface KikuRocketProps {
  /** True once the answer has begun arriving: the rocket touches down. */
  landed: boolean;
  size?: number;
  className?: string;
}

const GLYPH =
  'M39.4 10.4 Q44 0 48.6 10.4 L86.1 95.8 Q88 100 83.4 100 L4.6 100 Q0 100 1.9 95.8 Z ' +
  'M24 100 L24 65 Q24 60 27.4 56.3 Q44 38 60.6 56.3 Q64 60 64 65 L64 100 Z';

type RGB = [number, number, number];

const mix = (a: RGB, b: RGB, t: number): RGB =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

/** Two tones either side of the brand accent, so the shimmer never leaves the family. */
function tones(base: RGB): RGB[] {
  return [base, mix(base, [255, 205, 130], 0.5), mix(base, [198, 44, 30], 0.38), base];
}

function sample(pal: RGB[], u: number): RGB {
  const n = pal.length - 1;
  const x = (((u % 1) + 1) % 1) * n;
  const i = Math.floor(x);
  const f = x - i;
  // Smoothstep, so the loop has no visible corners where stops meet.
  return mix(pal[i], pal[Math.min(i + 1, n)], f * f * (3 - 2 * f));
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; decay: number; r: number; c: RGB;
}

/**
 * The brand mark as a rocket: holding altitude under thrust while the answer
 * is being worked out, then descending and settling as it starts to arrive.
 *
 * The exhaust is a canvas particle field; the mark itself is SVG so it stays
 * crisp at 40px, filled with a gradient whose stops travel to give it the lit
 * quality a flat recolour cannot. The door handle is not hidden while it flies
 * — it has dropped out and is tumbling in the plume, and climbs back into the
 * door on touchdown.
 */
export function KikuRocket({ landed, size = 40, className }: KikuRocketProps) {
  const gid = useId().replace(/:/g, '');
  const hostRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopsRef = useRef<SVGStopElement[]>([]);
  const partsRef = useRef<Particle[]>([]);
  const landedRef = useRef(landed);
  const rgbRef = useRef<RGB>([255, 106, 51]);

  // Read in an effect, not in render: the burst must fire on the transition
  // into `landed`, and only once.
  useEffect(() => {
    const wasFlying = !landedRef.current;
    landedRef.current = landed;
    if (!landed || !wasFlying) return;
    const s = size;
    // Touchdown is partway through the descent, not at the moment the prop
    // flips — the plume has to arrive with the impact, not before it.
    const t = setTimeout(() => {
      for (let i = 0; i < 30; i++) {
        const a = Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const v = 50 * (0.5 + Math.random() * 0.9) * (s / 40);
        partsRef.current.push({
          x: s / 2 + (Math.random() - 0.5) * s * 0.18,
          y: s * 0.8,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 1, decay: 1 / (0.9 * (0.6 + Math.random() * 0.8)),
          r: (0.5 + Math.random() * 2.2) * (s / 40),
          c: rgbRef.current,
        });
      }
    }, 430);
    return () => clearTimeout(t);
  }, [landed, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const parsed = (getComputedStyle(host).color.match(/-?[\d.]+/g) ?? ['255', '106', '51'])
      .slice(0, 3).map(Number) as RGB;
    const palette = tones(parsed);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    let raf = 0;
    let last = performance.now();
    const t0 = last;
    let acc = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const flying = !landedRef.current;

      if (flying) {
        // Each stop samples a little further along, so a band of colour runs
        // the length of the mark rather than the whole of it changing at once.
        stopsRef.current.forEach((s, i) =>
          s?.setAttribute('stop-color', css(sample(palette, t / 2.6 + i * 0.14))));
        rgbRef.current = sample(palette, t / 2.6 + 0.14);
        host.style.setProperty('--hsk-rocket-ink', css(rgbRef.current));
        acc += dt * (reduced ? 1.1 : 2.4) * 60;
        while (acc >= 1) {
          acc -= 1;
          const a = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
          const v = 28 * (0.5 + Math.random() * 0.9) * (size / 40);
          partsRef.current.push({
            x: size / 2 + (Math.random() - 0.5) * size * 0.07,
            y: size * 0.8 + (Math.random() - 0.5) * size * 0.05,
            vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: 1, decay: 1 / (0.6 * (0.6 + Math.random() * 0.8)),
            r: (0.5 + Math.random() * 1.3) * (size / 40),
            c: rgbRef.current,
          });
        }
      } else {
        rgbRef.current = parsed;
        stopsRef.current.forEach(s => s?.setAttribute('stop-color', css(parsed)));
        host.style.setProperty('--hsk-rocket-ink', css(parsed));
        acc = 0;
      }

      ctx.clearRect(0, 0, size, size);
      const parts = partsRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.93; p.vy *= 0.93;
        p.life -= p.decay * dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.c[0] | 0},${p.c[1] | 0},${p.c[2] | 0},${Math.pow(p.life, 1.6) * 0.85})`;
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      }

      // Landed with the plume gone: nothing left to draw, so stop burning a
      // frame callback for the rest of the conversation.
      if (!flying && parts.length === 0) { raf = 0; return; }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [size, landed]);

  return (
    <span
      ref={hostRef}
      className={['hsk-rocket', landed ? 'hsk-rocket--landed' : 'hsk-rocket--flying', className]
        .filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
      {/* Cropped to the glyph's own bounds rather than the source artboard.
          In the full 0–100 box the mark only occupies y 19–81, so it rendered
          at ~62% of the slot and read undersized. This frames it tightly and
          still puts its base at 80% of the box, where the plume spawns. */}
      <svg className="hsk-rocket-glyph" viewBox="10.2 17.4 79.5 79.5">
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            {[0, 0.5, 1].map((off, i) => (
              <stop
                key={off}
                ref={(el) => { if (el) stopsRef.current[i] = el; }}
                offset={off}
                stopColor="currentColor"
              />
            ))}
          </linearGradient>
        </defs>
        <path
          d={GLYPH}
          transform="translate(22.7 19) scale(0.62)"
          fillRule="evenodd"
          fill={`url(#${gid})`}
        />
      </svg>
      <span className="hsk-rocket-handle" />
    </span>
  );
}
