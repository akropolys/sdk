import React, { useEffect, useRef } from 'react';

export type ScoutMood = 'watching' | 'resting' | 'struck' | 'gone';

export type SpeciesId = 'pig' | 'hyena' | 'owl' | 'cat' | 'frog' | 'ram';

type Species = {
  id: SpeciesId;
  name: string;
  nick: string;
  bw: number;
  bh: number;
  coat: string;
  shade: string;
  snout: string;
  eyeGap: number;
  eyeY: number;
  ears: (bw: number, bh: number) => string;
  extras?: (bw: number, bh: number) => React.ReactNode;
};

const SPECIES: Species[] = [
  {
    id: 'pig',
    name: 'Pig',
    nick: 'Piggy',
    bw: 34, bh: 30, coat: '#F4B8C1', shade: '#E093A0', snout: '#EFA3AE',
    eyeGap: 16, eyeY: 3,
    ears: (bw, bh) => `M${-bw * 0.78} ${-bh * 0.5} q${-16} ${-16} ${-2} ${-21} q${10} ${-2} ${14} ${16} Z M${bw * 0.78} ${-bh * 0.5} q${16} ${-16} ${2} ${-21} q${-10} ${-2} ${-14} ${16} Z`,
    extras: (_bw, bh) => (
      <g>
        <ellipse cx="0" cy={bh * 0.42} rx="13" ry="9" fill="#EFA3AE" />
        <ellipse cx="-4.4" cy={bh * 0.42} rx="2.1" ry="3" fill="#D4818F" />
        <ellipse cx="4.4" cy={bh * 0.42} rx="2.1" ry="3" fill="#D4818F" />
      </g>
    ),
  },
  {
    id: 'hyena',
    name: 'Hyena',
    nick: 'Giggles',
    bw: 32, bh: 31, coat: '#DCC08E', shade: '#BE9E67', snout: '#B08F5E',
    eyeGap: 15, eyeY: 2,
    ears: (bw, bh) => `M${-bw * 0.66} ${-bh * 0.6} q${-11} ${-30} ${13} ${-24} Z M${bw * 0.66} ${-bh * 0.6} q${11} ${-30} ${-13} ${-24} Z`,
    extras: (bw, bh) => (
      <g>
        <path d={`M${-bw * 0.2} ${-bh} q${bw * 0.2} ${-9} ${bw * 0.4} 0`} fill="none" stroke="#B08F5E" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx={-bw * 0.42} cy={bh * 0.06} rx="4" ry="3.2" fill="#BE9E67" opacity="0.75" />
        <ellipse cx={bw * 0.46} cy={bh * 0.24} rx="3.4" ry="2.8" fill="#BE9E67" opacity="0.75" />
        <ellipse cx="0" cy={bh * 0.46} rx="8" ry="6" fill="#B08F5E" />
      </g>
    ),
  },
  {
    id: 'owl',
    name: 'Owl',
    nick: 'Hoot',
    bw: 33, bh: 32, coat: '#C3B9A6', shade: '#9C917E', snout: '#E8A94E',
    eyeGap: 17, eyeY: 3,
    ears: (bw, bh) => `M${-bw * 0.62} ${-bh * 0.74} l${-4} ${-21} l${17} ${11} Z M${bw * 0.62} ${-bh * 0.74} l${4} ${-21} l${-17} ${11} Z`,
    extras: (_bw, bh) => (
      <path d={`M0 ${bh * 0.06} l4.5 7 l-4.5 5 l-4.5 -5 Z`} fill="#E8A94E" />
    ),
  },
  {
    id: 'cat',
    name: 'Cat',
    nick: 'Kitty',
    bw: 31, bh: 30, coat: '#AEB7C4', shade: '#8B94A2', snout: '#7C8592',
    eyeGap: 15, eyeY: 3,
    ears: (bw, bh) => `M${-bw * 0.74} ${-bh * 0.58} l${-3} ${-26} l${21} ${12} Z M${bw * 0.74} ${-bh * 0.58} l${3} ${-26} l${-21} ${12} Z`,
    extras: (bw, bh) => (
      <g stroke="#7C8592" strokeWidth="1.6" strokeLinecap="round" opacity="0.8">
        <path d={`M${-bw * 0.3} ${bh * 0.4} l${-14} ${-3}`} />
        <path d={`M${-bw * 0.3} ${bh * 0.46} l${-14} ${3}`} />
        <path d={`M${bw * 0.3} ${bh * 0.4} l${14} ${-3}`} />
        <path d={`M${bw * 0.3} ${bh * 0.46} l${14} ${3}`} />
      </g>
    ),
  },
  {
    id: 'frog',
    name: 'Frog',
    nick: 'Hopper',
    bw: 36, bh: 26, coat: '#A9D194', shade: '#7FA96C', snout: '#7FA96C',
    eyeGap: 17, eyeY: -8,
    ears: (bw, bh) => `M${-bw * 0.52} ${-bh * 0.7} a13 13 0 1 1 26 0 Z M${bw * 0.06} ${-bh * 0.7} a13 13 0 1 1 26 0 Z`,
    extras: (_bw, bh) => (
      <path d={`M-11 ${bh * 0.44} q11 7 22 0`} fill="none" stroke="#7FA96C" strokeWidth="2.4" strokeLinecap="round" />
    ),
  },
  {
    id: 'ram',
    name: 'Ram',
    nick: 'Bram',
    bw: 32, bh: 30, coat: '#E2D6C0', shade: '#B9AC96', snout: '#A79A84',
    eyeGap: 15, eyeY: 3,
    ears: (bw, bh) => `M${-bw * 0.86} ${-bh * 0.24} l${-17} ${5} l${14} ${9} Z M${bw * 0.86} ${-bh * 0.24} l${17} ${5} l${-14} ${9} Z`,
    extras: (bw, bh) => (
      <g fill="none" stroke="#A79A84" strokeWidth="4.5" strokeLinecap="round">
        <path d={`M${-bw * 0.66} ${-bh * 0.6} q${-13} ${4} ${-9} ${13} q${3} ${7} ${9} ${2}`} />
        <path d={`M${bw * 0.66} ${-bh * 0.6} q${13} ${4} ${9} ${13} q${-3} ${7} ${-9} ${2}`} />
      </g>
    ),
  },
];

export const SPECIES_IDS = SPECIES.map(s => s.id);

export function speciesFor(id: string, avatar?: string): Species {
  if (avatar) {
    const chosen = SPECIES.find(s => s.id === avatar);
    if (chosen) return chosen;
  }
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SPECIES[h % SPECIES.length];
}

const MOOD: Record<ScoutMood, { lid: number; perk: number; breath: number; tilt: number; dim: number }> = {
  watching: { lid: 1, perk: 1, breath: 1700, tilt: 0, dim: 1 },
  resting: { lid: 0.16, perk: 0.25, breath: 3400, tilt: 6, dim: 0.82 },
  struck: { lid: 1.15, perk: 1.3, breath: 700, tilt: 0, dim: 1 },
  gone: { lid: 0.08, perk: 0.1, breath: 4200, tilt: 10, dim: 0.45 },
};

function squircle(bw: number, bh: number) {
  const k = 0.46;
  const r = Math.min(bw, bh) * 0.72;
  const p = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return (
    `M${p(-bw, -bh + r)}` +
    `C${p(-bw, -bh + r * k)} ${p(-bw + r * k, -bh)} ${p(-bw + r, -bh)}` +
    `L${p(bw - r, -bh)}` +
    `C${p(bw - r * k, -bh)} ${p(bw, -bh + r * k)} ${p(bw, -bh + r)}` +
    `L${p(bw, bh - r)}` +
    `C${p(bw, bh - r * k)} ${p(bw - r * k, bh)} ${p(bw - r, bh)}` +
    `L${p(-bw + r, bh)}` +
    `C${p(-bw + r * k, bh)} ${p(-bw, bh - r * k)} ${p(-bw, bh - r)}` +
    'Z'
  );
}

export interface ScoutCharacterProps {
  scoutId: string;
  avatar?: string;
  mood?: ScoutMood;
  size?: number;
  layer?: 'all' | 'body';
}

export function ScoutCharacter({ scoutId, avatar, mood = 'watching', size = 44, layer = 'all' }: ScoutCharacterProps) {
  const sp = speciesFor(scoutId, avatar);
  const moodRef = useRef(mood);
  moodRef.current = mood;

  const figRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGPathElement>(null);
  const earRef = useRef<SVGPathElement>(null);
  const eyeLRef = useRef<SVGRectElement>(null);
  const eyeRRef = useRef<SVGRectElement>(null);
  const shineLRef = useRef<SVGCircleElement>(null);
  const shineRRef = useRef<SVGCircleElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const at = { lid: 1, perk: 1, tilt: 0, dim: 1, gx: 0, gy: 0, hop: 0 };
    const vel = { lid: 0, perk: 0, tilt: 0, dim: 0, gx: 0, gy: 0, hop: 0 };

    let seed = 0;
    for (let i = 0; i < scoutId.length; i++) seed = (seed * 31 + scoutId.charCodeAt(i)) >>> 0;
    const phase = (seed % 1000) * 3;

    let blinkAt = 1200 + (seed % 2600);
    let blinkPhase = -1;
    let wander = 0;
    let wanderAt = 900;
    let hopDue = 2000 + (seed % 5000);
    let hopPhase = -1;
    let raf = 0;

    const spring = (k: keyof typeof at, want: number, stiff = 0.16, damp = 0.76) => {
      vel[k] = (vel[k] + (want - at[k]) * stiff) * damp;
      at[k] += vel[k];
    };

    const frame = (t: number) => {
      const m = MOOD[moodRef.current];
      const awake = moodRef.current === 'watching' || moodRef.current === 'struck';
      const alive = awake || moodRef.current === 'resting';

      if (alive && !reduced && t > wanderAt) {
        wander = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : (Math.random() - 0.5) * 1.2;
        wanderAt = t + (awake ? 1100 + Math.random() * 2400 : 2600 + Math.random() * 3400);
      }

      let lid = m.lid;
      if (!reduced && awake) {
        if (blinkPhase < 0 && t > blinkAt) blinkPhase = 0;
        if (blinkPhase >= 0) {
          blinkPhase += 1 / 6;
          lid = m.lid * Math.abs(blinkPhase - 0.5) * 2;
          if (blinkPhase >= 1) {
            blinkPhase = -1;
            // the occasional quick second blink, the tell that sells a creature
            blinkAt = t + (Math.random() < 0.24 ? 300 : 2200 + Math.random() * 3800);
          }
        }
      }

      // A struck scout jumps: it just did the one thing it was made to do.
      let lift = 0;
      if (moodRef.current === 'struck' && !reduced) {
        if (hopPhase < 0 && t > hopDue) hopPhase = 0;
        if (hopPhase >= 0) {
          hopPhase += 1 / 26;
          lift = -Math.sin(hopPhase * Math.PI) * 7;
          if (hopPhase >= 1) {
            hopPhase = -1;
            hopDue = t + 1600 + Math.random() * 2200;
          }
        }
      }

      const breath = reduced ? 0 : Math.sin((t + phase) / m.breath * Math.PI) * 0.03;

      // Even asleep the head lolls a little rather than holding one angle.
      const sway = alive && !reduced ? Math.sin((t + phase) / (awake ? 3100 : 4800)) * (awake ? 1.6 : 2.4) : 0;

      spring('lid', lid, 0.3, 0.6);
      spring('perk', m.perk);
      spring('tilt', m.tilt + sway);
      spring('dim', m.dim);
      // A sleeping animal glances less far and drifts more slowly.
      const gaze = awake ? 2.4 : 1.3;
      spring('gx', alive && !reduced ? wander * gaze : 0, 0.08, 0.84);
      spring('gy', alive && !reduced ? Math.sin((t + phase) / (awake ? 2200 : 3600)) * 1.4 : 1.5, 0.08, 0.84);

      const bw = sp.bw * (1 + breath * 0.9);
      const bh = sp.bh * (1 - breath);

      bodyRef.current?.setAttribute('d', squircle(bw, bh));
      earRef.current?.setAttribute('d', sp.ears(bw, bh));
      earRef.current?.setAttribute(
        'transform',
        `translate(0 ${((1 - at.perk) * 7).toFixed(2)}) scale(1 ${Math.max(0.2, at.perk).toFixed(3)})`,
      );

      if (layer === 'body') {
        raf = requestAnimationFrame(frame);
        return;
      }

      const h = Math.max(1.4, 17 * Math.max(0.05, at.lid));
      for (const [eye, shine, dir] of [[eyeLRef, shineLRef, -1], [eyeRRef, shineRRef, 1]] as const) {
        const el = eye.current;
        if (el) {
          el.setAttribute('x', String(dir * sp.eyeGap - 6 + at.gx));
          el.setAttribute('y', String(sp.eyeY - h / 2 + at.gy));
          el.setAttribute('height', String(h));
          el.setAttribute('ry', String(Math.min(6, h / 2)));
        }
        const sh = shine.current;
        if (sh) {
          sh.setAttribute('cx', String(dir * sp.eyeGap - 1.8 + at.gx));
          sh.setAttribute('cy', String(sp.eyeY - h / 2 + 3.4 + at.gy));
          // The glint lives inside the eye, so it closes with the lid.
          sh.setAttribute('r', String(h > 7 ? 2.5 : 0));
        }
      }
      mouthRef.current?.setAttribute('transform', `translate(${at.gx.toFixed(2)} ${at.gy.toFixed(2)})`);

      figRef.current?.setAttribute(
        'transform',
        `translate(0 ${lift.toFixed(2)}) rotate(${at.tilt.toFixed(2)})`,
      );
      figRef.current?.setAttribute('opacity', at.dim.toFixed(3));

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [scoutId, sp, layer]);

  return (
    <svg
      className="hsk-cb-scout-char"
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      role="img"
      aria-label={sp.name}
    >
      <g ref={figRef}>
        <path ref={earRef} d={sp.ears(sp.bw, sp.bh)} fill={sp.shade} />
        <path ref={bodyRef} d={squircle(sp.bw, sp.bh)} fill={sp.coat} />
        {layer === 'all' && sp.extras?.(sp.bw, sp.bh)}
{layer === 'all' && (
          <>
        <ellipse cx={-sp.eyeGap - 7} cy={sp.eyeY + 9} rx="6" ry="3.6" fill="#F08898" opacity="0.5" />
        <ellipse cx={sp.eyeGap + 7} cy={sp.eyeY + 9} rx="6" ry="3.6" fill="#F08898" opacity="0.5" />
        <rect ref={eyeLRef} x={-sp.eyeGap - 6} y={sp.eyeY - 8.5} width="12" height="17" rx="6" fill="#3A322C" />
        <rect ref={eyeRRef} x={sp.eyeGap - 6} y={sp.eyeY - 8.5} width="12" height="17" rx="6" fill="#3A322C" />
        <circle ref={shineLRef} cx={-sp.eyeGap - 1.8} cy={sp.eyeY - 5} r="2.5" fill="#FFFFFF" />
        <circle ref={shineRRef} cx={sp.eyeGap - 1.8} cy={sp.eyeY - 5} r="2.5" fill="#FFFFFF" />
        <path ref={mouthRef} d={`M-3.6 ${sp.eyeY + 13} q3.6 3.6 7.2 0`} fill="none" stroke="#3A322C" strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
          </>
        )}
      </g>
    </svg>
  );
}

export function speciesName(id: string, avatar?: string): string {
  return speciesFor(id, avatar).name;
}

// What a shopper would call it out loud.
export function speciesNick(id: string, avatar?: string): string {
  return speciesFor(id, avatar).nick;
}
