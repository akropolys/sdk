import React from 'react';

const TAIL_A = 'M5 20.5 V11 a7 7 0 0 1 14 0 v9.5 l-3.5 -2 l-3.5 2 l-3.5 -2 L5 20.5 z';
const TAIL_B = 'M5 18.5 V11 a7 7 0 0 1 14 0 v7.5 l-3.5 2 l-3.5 -2 l-3.5 2 L5 18.5 z';

export default function KikuGhost() {
  return (
    <svg className="hsk-ghost" viewBox="0 0 24 24" aria-hidden="true">
      <path className="hsk-ghost-body" d={TAIL_A}>
        <animate
          attributeName="d"
          dur="1.9s"
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0;0.5;1"
          keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
          values={`${TAIL_A};${TAIL_B};${TAIL_A}`}
        />
      </path>
      <g className="hsk-ghost-eyes">
        <ellipse cx="9.6" cy="12.4" rx="1.25" ry="1.6" />
        <ellipse cx="14.4" cy="12.4" rx="1.25" ry="1.6" />
      </g>
    </svg>
  );
}
