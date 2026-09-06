import React from 'react';

export interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

function Digit({ d, delay }: { d: number; delay: number }) {
  return (
    <span className="hsk-cb-num-slot">
      <span className="hsk-cb-num-col" style={{ transform: `translateY(${-d * 10}%)`, transitionDelay: `${delay}ms` }}>
        {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
          <span key={n} className="hsk-cb-num-d">{n}</span>
        ))}
      </span>
    </span>
  );
}

export function AnimatedNumber({ value, decimals = 0, prefix, suffix, className }: AnimatedNumberProps) {
  const text = Math.abs(value).toFixed(decimals);
  const chars = text.split('');
  // Right-most digit leads; each one further left waits a beat longer.
  const digitsTotal = chars.filter(c => c >= '0' && c <= '9').length;
  let seen = 0;

  return (
    <span className={['hsk-cb-num', className].filter(Boolean).join(' ')}>
      {prefix && <span className="hsk-cb-num-fix">{prefix}</span>}
      {chars.map((c, i) => {
        if (c >= '0' && c <= '9') {
          const fromRight = digitsTotal - 1 - seen;
          seen += 1;
          return <Digit key={i} d={Number(c)} delay={fromRight * 34} />;
        }
        return <span key={i} className="hsk-cb-num-fix">{c}</span>;
      })}
      {suffix && <span className="hsk-cb-num-fix">{suffix}</span>}
    </span>
  );
}
